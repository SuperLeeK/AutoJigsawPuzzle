import { chromium, request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 로컬 .env 파일 자동 로드 (로컬 테스트용)
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
loadDotEnv();

/**
 * 이슈 본문(Markdown)에서 필요한 정보를 정규식으로 추출합니다.
 */
function parseIssueBody(body) {
  let rawImageText = '';
  let pieces = 500;
  let nickname = '또갈통';

  // 1. 퍼즐 이미지 섹션 파싱
  const imageSectionMatch = body.match(/###\s*🖼️\s*퍼즐 이미지\s*([\s\S]*?)(?=###|$)/i);
  if (imageSectionMatch) {
    rawImageText = imageSectionMatch[1].trim();
  } else {
    rawImageText = body; // 섹션이 없으면 전체 본문에서 탐색
  }

  // 이미지 URL 추출 (마크다운 링크, img 태그, 일반 URL 순)
  let imageUrl = '';
  const mdImgMatch = rawImageText.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  const htmlImgMatch = rawImageText.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  const urlMatch = rawImageText.match(/(https?:\/\/[^\s\)]+)/);

  if (mdImgMatch) {
    imageUrl = mdImgMatch[1];
  } else if (htmlImgMatch) {
    imageUrl = htmlImgMatch[1];
  } else if (urlMatch) {
    imageUrl = urlMatch[1];
  }

  // 2. 조각 수 파싱
  const piecesMatch = body.match(/###\s*🧩\s*퍼즐 조각 수\s*([\s\S]*?)(?=###|$)/i);
  if (piecesMatch) {
    const parsedPieces = parseInt(piecesMatch[1].trim(), 10);
    if (!isNaN(parsedPieces) && parsedPieces > 0) {
      pieces = parsedPieces;
    }
  }

  // 3. 닉네임 파싱
  const nickMatch = body.match(/###\s*👤\s*방장 닉네임\s*([\s\S]*?)(?=###|$)/i);
  if (nickMatch) {
    const parsedNick = nickMatch[1].trim();
    if (parsedNick && parsedNick !== '_No response_') {
      nickname = parsedNick;
    }
  }

  return { imageUrl, pieces, nickname };
}

/**
 * 다양한 환경(GitHub 이슈 첨부 비공개 이미지, 일반 외부 이미지)에서
 * 이미지 바이너리를 안전하게 다운로드합니다.
 */
async function downloadImageBuffer(imageUrl) {
  const githubToken = process.env.GITHUB_TOKEN;
  const repository = process.env.REPOSITORY;
  const issueNumber = process.env.ISSUE_NUMBER;

  let downloadUrl = imageUrl;

  // 1. GitHub user-attachments 인 경우 GitHub REST API(body_html)를 통해 서명된 CDN URL 조회
  if (imageUrl.includes('user-attachments/assets') && githubToken && repository && issueNumber) {
    try {
      console.log(`🔍 GitHub API로 서명된 첨부 이미지 URL 확인 중... (저장소: ${repository}, 이슈: #${issueNumber})`);
      const apiRes = await fetch(`https://api.github.com/repos/${repository}/issues/${issueNumber}`, {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.full+json',
          'User-Agent': 'AutoJigsawPuzzle-Bot',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (apiRes.ok) {
        const issueData = await apiRes.json();
        const bodyHtml = issueData.body_html || '';
        const assetIdMatch = imageUrl.match(/user-attachments\/assets\/([a-f0-9-]+)/i);
        const assetId = assetIdMatch ? assetIdMatch[1] : '';

        let matchedSignedUrl = null;
        if (assetId) {
          const regex = new RegExp(`src=["'](https?://[^"']*(?:private-user-images|github-production-user-asset|githubusercontent)[^"']*)["'][^>]*${assetId}`, 'i');
          const regex2 = new RegExp(`${assetId}[^>]*?src=["'](https?://[^"']+)["']`, 'i');
          const m = bodyHtml.match(regex) || bodyHtml.match(regex2);
          if (m) matchedSignedUrl = m[1];
        }

        if (!matchedSignedUrl) {
          const genericMatch = bodyHtml.match(/src=["'](https?:\/\/(?:private-user-images\.githubusercontent\.com|github-production-user-asset)[^"']+)["']/i);
          if (genericMatch) matchedSignedUrl = genericMatch[1];
        }

        if (matchedSignedUrl) {
          downloadUrl = matchedSignedUrl.replace(/&amp;/g, '&');
          console.log(`✅ 서명된 GitHub 첨부 이미지 CDN 링크 획득 완료!`);
        }
      } else {
        console.warn(`⚠️ GitHub API 이슈 조회 실패 (HTTP ${apiRes.status})`);
      }
    } catch (err) {
      console.warn(`⚠️ GitHub API 조회 중 오류 발생: ${err.message}`);
    }
  }

  // 2. 다운로드 요청 수행
  console.log(`⏳ 이미지 다운로드 시도: ${downloadUrl.split('?')[0]}`);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  };

  // 만약 여전히 github 도메인이고 토큰이 있다면 토큰 인증으로 302 리다이렉트 처리
  if (downloadUrl.includes('github.com') && githubToken) {
    const res = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        ...headers,
        'Authorization': `Bearer ${githubToken}`
      },
      redirect: 'manual'
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const redirectLocation = res.headers.get('location');
      console.log(`↪️ 302 리다이렉트 대상 다운로드 중...`);
      const s3Res = await fetch(redirectLocation, {
        headers,
        redirect: 'follow'
      });
      if (!s3Res.ok) {
        throw new Error(`S3 이미지 다운로드 실패 (HTTP ${s3Res.status})`);
      }
      const buffer = Buffer.from(await s3Res.arrayBuffer());
      const contentType = s3Res.headers.get('content-type') || 'image/jpeg';
      return { buffer, contentType };
    }

    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      return { buffer, contentType };
    }
  }

  // 일반 다운로드
  const response = await fetch(downloadUrl, {
    headers,
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`이미지 다운로드 실패 (HTTP Status: ${response.status}) - 이미지 접근 권한 또는 URL을 확인해 주세요.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  return { buffer, contentType };
}

/**
 * 이미지 버퍼를 Postimages API에 업로드하고 직링크를 반환합니다.
 */
async function uploadBufferToPostimages(buffer, filenamePrefix = 'puzzle', ext = 'jpg') {
  const postimagesApiKey = process.env.POSTIMAGES_API_KEY;
  if (!postimagesApiKey) {
    throw new Error('POSTIMAGES_API_KEY 환경변수(또는 GitHub Secret)가 설정되지 않았습니다.');
  }

  const base64Image = buffer.toString('base64');
  console.log(`⏳ Postimages API로 이미지 업로드 중... (크기: ${(base64Image.length / 1024).toFixed(2)} KB)`);

  const formData = {
    key: postimagesApiKey,
    gallery: process.env.POSTIMAGES_GALLERY || 'jigsaw',
    o: process.env.POSTIMAGES_O || '2b819584285c102318568238c7d4a4c7',
    m: process.env.POSTIMAGES_M || '59c2ad4b46b0c1e12d5703302bff0120',
    version: '1.0.1',
    portable: '1',
    name: `${filenamePrefix}_${Date.now()}`,
    type: ext,
    image: base64Image
  };

  const formBody = Object.keys(formData)
    .map(prop => `${encodeURIComponent(prop)}=${encodeURIComponent(formData[prop])}`)
    .join('&');

  const apiContext = await request.newContext();
  try {
    const postRes = await apiContext.post('https://api.postimage.org/1/upload', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      data: formBody
    });

    if (!postRes.ok()) {
      throw new Error(`Postimages HTTP 실패: ${postRes.status()}`);
    }

    const responseText = await postRes.text();
    const successMatch = responseText.match(/success="(\d+)"/);
    if (successMatch && successMatch[1] === '1') {
      const hotlinkMatch = responseText.match(/<hotlink>(.*?)<\/hotlink>/);
      if (hotlinkMatch && hotlinkMatch[1]) {
        console.log(`✅ Postimages 업로드 성공: ${hotlinkMatch[1]}`);
        return hotlinkMatch[1];
      }
    }
    throw new Error(`Postimages 응답 처리 실패: ${responseText}`);
  } finally {
    await apiContext.dispose();
  }
}

/**
 * 로컬 이미지 파일을 Postimages에 업로드하고 직링크를 반환합니다.
 */
async function uploadImageFileToPostimages(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = filePath.endsWith('.png') ? 'png' : 'jpg';
  return await uploadBufferToPostimages(buffer, 'error_screenshot', ext);
}

/**
 * 외부 이미지 URL에서 이미지를 다운로드 받아 Postimages에 업로드하고 직링크를 반환합니다.
 */
async function uploadToPostimages(imageUrl) {
  const { buffer, contentType } = await downloadImageBuffer(imageUrl);

  let ext = 'jpg';
  if (contentType.includes('png')) ext = 'png';
  else if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('gif')) ext = 'gif';

  return await uploadBufferToPostimages(buffer, 'puzzle', ext);
}

/**
 * Playwright를 사용하여 Jigsaw Explorer에서 퍼즐 생성 및 멀티플레이 링크 추출
 */
async function generateMultiplayerPuzzle(hotlinkUrl, pieces, nickname) {
  console.log(`\n⏳ Jigsaw Explorer에서 ${pieces}조각 퍼즐방 생성 시작...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  let siteAlertMessage = '';
  page.on('dialog', async dialog => {
    siteAlertMessage = dialog.message();
    console.warn(`⚠️ 직소 사이트 알림창 감지: "${siteAlertMessage}"`);
    await dialog.accept();
  });

  try {
    await page.goto('https://www.jigsawexplorer.com/create-a-custom-jigsaw-puzzle/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.locator('input[name="image-url"]').fill(hotlinkUrl);
    await page.locator('input[name="puzzle-nop"]').fill(String(pieces));
    await page.getByRole('button', { name: 'Create the Jigsaw Puzzle' }).click();

    try {
      const agreeBtn = page.getByRole('button', { name: 'I Agree' });
      await agreeBtn.waitFor({ timeout: 2000 });
      await agreeBtn.click();
    } catch (e) {}

    const shortLinkInput = page.locator('#short-link');
    try {
      await shortLinkInput.waitFor({ state: 'attached', timeout: 15000 });
    } catch (waitErr) {
      if (siteAlertMessage) {
        throw new Error(`직소 퍼즐 사이트 경고: "${siteAlertMessage}" (유효하지 않은 이미지 주소이거나 지원되지 않는 형식입니다)`);
      }
      throw waitErr;
    }

    const shortLink = await shortLinkInput.inputValue();

    console.log(`⏳ "${nickname}" 닉네임으로 멀티플레이어 초대 링크 생성 중... (페이지: ${shortLink})`);
    await page.goto(shortLink, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const multiplayerBtn = page.locator('#jigex-multiplayer-btn');
    await multiplayerBtn.waitFor({ state: 'visible', timeout: 30000 });
    await multiplayerBtn.click();

    const playerNameInput = page.locator('#jigex-player-name');
    await playerNameInput.waitFor({ state: 'visible', timeout: 5000 });
    await playerNameInput.fill(nickname);

    await page.getByRole('button', { name: 'Create Game Link' }).click();

    const gameLinkInput = page.locator('#jigex-game-link');
    await gameLinkInput.waitFor({ state: 'attached', timeout: 10000 });

    let gameLink = '';
    for (let i = 0; i < 20; i++) {
      gameLink = await gameLinkInput.inputValue();
      if (gameLink && gameLink.startsWith('http')) {
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!gameLink || !gameLink.startsWith('http')) {
      throw new Error('멀티플레이 링크 획득 실패');
    }

    return { shortLink, gameLink };
  } catch (error) {
    try {
      await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
      console.log('📸 디버깅용 에러 스크린샷(error_screenshot.png)을 캡처했습니다.');
    } catch (sErr) {}
    throw error;
  } finally {
    await browser.close();
  }
}

async function main() {
  const issueBody = process.env.ISSUE_BODY || '';
  let imageUrl = process.env.IMAGE_URL || '';
  let pieces = parseInt(process.env.PIECES || '500', 10);
  let nickname = process.env.NICKNAME || '또갈통';

  if (issueBody) {
    const parsed = parseIssueBody(issueBody);
    if (parsed.imageUrl) imageUrl = parsed.imageUrl;
    if (parsed.pieces) pieces = parsed.pieces;
    if (parsed.nickname) nickname = parsed.nickname;
  }

  console.log('📌 작업 파라미터:');
  console.log(` - 이미지 URL: ${imageUrl}`);
  console.log(` - 조각 수: ${pieces}`);
  console.log(` - 닉네임: ${nickname}`);

  if (!imageUrl) {
    const errorComment = `### ❌ 퍼즐 생성 실패\n이슈 본문에서 올바른 이미지 URL이나 첨부 이미지를 찾을 수 없습니다.\n이미지를 드래그 앤 드롭으로 첨부하거나 이미지 링크를 포함해 주세요!`;
    fs.writeFileSync('result_comment.md', errorComment);
    process.exit(1);
  }

  try {
    // 1. 이미지 URL 처리 (이미 Postimages 직링크인 경우 업로드 생략)
    let targetUrl = '';
    const isPostimages = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:postimg\.cc|postimages\.org|postimg\.org)\/.+/i.test(imageUrl);

    if (isPostimages) {
      console.log(`⚡ 이미 Postimages 직링크입니다. 재업로드를 생략하고 바로 퍼즐을 생성합니다: ${imageUrl}`);
      targetUrl = imageUrl;
    } else {
      try {
        targetUrl = await uploadToPostimages(imageUrl);
      } catch (uploadErr) {
        console.warn(`⚠️ Postimages 업로드 실패: ${uploadErr.message}`);
        // 원본 URL이 외부에서 접근 불가능한 비공개 링크인 경우 무리하게 진행하지 않고 명확한 에러 안내
        if (imageUrl.includes('user-attachments') || imageUrl.includes('private-user-images')) {
          throw new Error(`GitHub 비공개 첨부 이미지를 다운로드할 수 없습니다 (${uploadErr.message}).\n\n💡 해결 방법: 외부 무료 이미지 호스팅(Postimages, Imgur 등)에 이미지를 올린 후 직링크(.jpg, .png)를 입력해 주세요.`);
        }
        targetUrl = imageUrl;
      }
    }

    // 2. Playwright 자동화로 퍼즐방 생성 (최대 3회 재시도)
    const MAX_RETRIES = 3;
    let puzzleResult = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`\n🔄 퍼즐방 생성 재시도 (${attempt}/${MAX_RETRIES})...`);
        }
        puzzleResult = await generateMultiplayerPuzzle(targetUrl, pieces, nickname);
        break;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ ${attempt}회차 시도 실패: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          console.log('⏳ 3초 후 다음 시도를 진행합니다...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    if (!puzzleResult) {
      throw lastError || new Error('퍼즐 생성에 최종 실패했습니다.');
    }

    const { shortLink, gameLink } = puzzleResult;

    console.log(`\n🎉 성공! 게임 링크: ${gameLink}`);

    const metaPayload = {
      status: 'completed',
      imageUrl: targetUrl,
      pieces,
      nickname,
      shortLink,
      gameLink,
      completedAt: new Date().toISOString()
    };

    // 3. GitHub Issue에 댓글로 달릴 마크다운 작성 (GitHub Pages 파싱용 PUZZLE_META 포함)
    const commentMarkdown = `## 🎉 멀티플레이어 직소 퍼즐 생성 완료!

친구들과 함께 아래 링크로 접속해서 퍼즐을 즐겨보세요! 🧩

| 항목 | 설정 내용 |
| :--- | :--- |
| 🧩 **퍼즐 조각 수** | **${pieces} 조각** |
| 👤 **방장 닉네임** | **${nickname}** |
| 🔗 **1인용 링크** | [혼자 맞추기](${shortLink}) |
| 🎮 **멀티플레이 링크** | [👉 **친구 초대 게임방 바로가기**](${gameLink}) |

---
### 🎮 게임 초대 링크 주소
\`\`\`text
${gameLink}
\`\`\`

> 💡 *방 생성자: ${nickname}*
<!-- PUZZLE_META: ${JSON.stringify(metaPayload)} -->
`;

    fs.writeFileSync('result_comment.md', commentMarkdown);
    fs.writeFileSync('result.json', JSON.stringify({ success: true, ...metaPayload }, null, 2));

  } catch (error) {
    console.error('❌ 처리 실패:', error);

    let screenshotUrl = '';
    if (fs.existsSync('error_screenshot.png')) {
      try {
        console.log('⏳ 실패 화면 스크린샷을 Postimages에 업로드 중...');
        screenshotUrl = await uploadImageFileToPostimages('error_screenshot.png');
        console.log(`✅ 스크린샷 업로드 성공: ${screenshotUrl}`);
      } catch (upErr) {
        console.warn('⚠️ 스크린샷 업로드 실패:', upErr.message);
      }
    }

    const failMeta = {
      status: 'failed',
      imageUrl,
      pieces,
      nickname,
      error: error.message,
      completedAt: new Date().toISOString()
    };

    let failComment = `## ❌ 퍼즐 생성 중 오류가 발생했습니다.\n\n\`\`\`text\n${error.message}\n\`\`\`\n\n`;
    if (screenshotUrl) {
      failComment += `### 📸 오류 발생 당시 화면\n![오류 화면](${screenshotUrl})\n\n`;
    }
    failComment += `확인 후 다시 시도해 주세요.\n<!-- PUZZLE_META: ${JSON.stringify(failMeta)} -->`;

    fs.writeFileSync('result_comment.md', failComment);
    fs.writeFileSync('result.json', JSON.stringify({ success: false, ...failMeta }, null, 2));
    process.exit(1);
  }
}

main();

