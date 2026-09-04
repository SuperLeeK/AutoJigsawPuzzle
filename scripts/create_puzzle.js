import { chromium, request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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
 * 외부 이미지 URL에서 이미지를 다운로드 받아 Postimages에 업로드하고 직링크를 반환합니다.
 */
async function uploadToPostimages(imageUrl) {
  console.log(`⏳ 이미지 다운로드 중: ${imageUrl}`);
  const imgRes = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });

  if (!imgRes.ok) {
    throw new Error(`이미지 다운로드 실패 (HTTP Status: ${imgRes.status})`);
  }

  const arrayBuffer = await imgRes.arrayBuffer();
  const base64Image = Buffer.from(arrayBuffer).toString('base64');

  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  let ext = 'jpg';
  if (contentType.includes('png')) ext = 'png';
  else if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('gif')) ext = 'gif';

  console.log(`⏳ Postimages API로 이미지 업로드 중... (크기: ${(base64Image.length / 1024).toFixed(2)} KB)`);

  const formData = {
    key: '64fccd3df1137b264d561e7c55ec8bac',
    gallery: 'jigsaw',
    o: '2b819584285c102318568238c7d4a4c7',
    m: '59c2ad4b46b0c1e12d5703302bff0120',
    version: '1.0.1',
    portable: '1',
    name: `puzzle_${Date.now()}`,
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

  try {
    await page.goto('https://www.jigsawexplorer.com/create-a-custom-jigsaw-puzzle/');

    await page.locator('input[name="image-url"]').fill(hotlinkUrl);
    await page.locator('input[name="puzzle-nop"]').fill(String(pieces));
    await page.getByRole('button', { name: 'Create the Jigsaw Puzzle' }).click();

    try {
      const agreeBtn = page.getByRole('button', { name: 'I Agree' });
      await agreeBtn.waitFor({ timeout: 2000 });
      await agreeBtn.click();
    } catch (e) {}

    const shortLinkInput = page.locator('#short-link');
    await shortLinkInput.waitFor({ state: 'attached', timeout: 15000 });
    const shortLink = await shortLinkInput.inputValue();

    console.log(`⏳ "${nickname}" 닉네임으로 멀티플레이어 초대 링크 생성 중... (페이지: ${shortLink})`);
    await page.goto(shortLink);

    const multiplayerBtn = page.locator('#jigex-multiplayer-btn');
    await multiplayerBtn.waitFor({ state: 'visible', timeout: 15000 });
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
    // 1. 이미지를 Postimages에 업로드하여 깨끗한 퍼블릭 URL 확보
    let targetUrl = imageUrl;
    try {
      targetUrl = await uploadToPostimages(imageUrl);
    } catch (uploadErr) {
      console.warn(`⚠️ Postimages 업로드 실패, 원본 URL로 시도합니다: ${uploadErr.message}`);
    }

    // 2. Playwright 자동화로 퍼즐방 생성
    const { shortLink, gameLink } = await generateMultiplayerPuzzle(targetUrl, pieces, nickname);

    console.log(`\n🎉 성공! 게임 링크: ${gameLink}`);

    // 3. GitHub Issue에 댓글로 달릴 마크다운 작성
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
`;

    fs.writeFileSync('result_comment.md', commentMarkdown);
    fs.writeFileSync('result.json', JSON.stringify({ success: true, pieces, nickname, shortLink, gameLink }, null, 2));

  } catch (error) {
    console.error('❌ 처리 실패:', error);
    const failComment = `## ❌ 퍼즐 생성 중 오류가 발생했습니다.\n\n\`\`\`text\n${error.message}\n\`\`\`\n잠시 후 다시 시도해 주세요.`;
    fs.writeFileSync('result_comment.md', failComment);
    process.exit(1);
  }
}

main();
