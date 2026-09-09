import { chromium, request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import clipboard from 'clipboardy';

// ESM 환경에서 __dirname 지원용 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 이미지 디렉토리 및 사용 완료 보관함 경로
const IMAGES_DIR = path.join(__dirname, 'images');
const USED_DIR = path.join(IMAGES_DIR, 'used');

// 1. 디렉토리에서 이미지 목록 읽기 (폴더 제외, 이미지 파일만)
function getImagesList() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ 이미지 디렉토리를 찾을 수 없습니다: ${IMAGES_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(IMAGES_DIR);
  return files.filter(file => {
    const filePath = path.join(IMAGES_DIR, file);
    // 폴더는 제외하고 오직 이미지 확장자 파일만 필터링
    return fs.statSync(filePath).isFile() && 
           ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(file).toLowerCase());
  });
}

// 2. 대화형 CLI 인터페이스로 이미지, 조각 수, 닉네임 선택 받기
function askQuestions(images) {
  return new Promise((resolve) => {
    if (images.length === 0) {
      console.log('❌ 업로드 가능한 신규 이미지가 images 디렉토리에 없습니다.');
      process.exit(1);
    }
    console.log('\n🌟 [ Postimages 이미지 업로드 & 멀티플레이 퍼즐 생성기 ] 🌟');
    images.forEach((file, index) => {
      const filePath = path.join(IMAGES_DIR, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`${index + 1}. 🖼️  ${file} (${sizeKB} KB)`);
    });
    console.log('====================================================');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // 1단계: 이미지 번호 선택
    rl.question('👉 업로드할 이미지 번호를 입력하세요: ', (imageAnswer) => {
      const selectedIndex = parseInt(imageAnswer, 10) - 1;
      
      if (selectedIndex < 0 || selectedIndex >= images.length || isNaN(selectedIndex)) {
        console.log('❌ 올바르지 않은 번호입니다. 처음부터 다시 실행해 주세요.');
        rl.close();
        process.exit(1);
      }

      const selectedImage = images[selectedIndex];

      // 2단계: 퍼즐 조각 갯수 선택
      rl.question('👉 퍼즐 조각 갯수를 입력하세요 (기본값: 500): ', (piecesAnswer) => {
        let pieces = parseInt(piecesAnswer, 10);
        if (isNaN(pieces) || pieces <= 0) {
          pieces = 500;
        }

        // 3단계: 멀티플레이 닉네임 입력 (기본값: 또갈통)
        rl.question('👉 멀티플레이 닉네임을 입력하세요 (기본값: 또갈통): ', (nicknameAnswer) => {
          rl.close();
          const nickname = nicknameAnswer.trim() || '또갈통';
          resolve({ selectedImage, pieces, nickname });
        });
      });
    });
  });
}

// 3. 메인 실행 함수
async function main() {
  const images = getImagesList();
  const { selectedImage, pieces, nickname } = await askQuestions(images);
  const imagePath = path.join(IMAGES_DIR, selectedImage);

  console.log(`\n⏳ 1단계: "${selectedImage}" 이미지를 Postimages에 업로드 중...`);

  // 로컬 파일 읽기 및 Base64 인코딩
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  const ext = path.extname(selectedImage).replace('.', '') || 'jpg';
  const nameWithoutExt = path.basename(selectedImage, path.extname(selectedImage));
  
  // API 폼 데이터 생성
  const formData = {
    key: '64fccd3df1137b264d561e7c55ec8bac', 
    gallery: 'jigsaw',                     
    o: '2b819584285c102318568238c7d4a4c7', 
    m: '59c2ad4b46b0c1e12d5703302bff0120', 
    version: '1.0.1',
    portable: '1',
    name: nameWithoutExt,
    type: ext,
    image: base64Image
  };

  const formBody = Object.keys(formData)
    .map(property => `${encodeURIComponent(property)}=${encodeURIComponent(formData[property])}`)
    .join('&');

  const apiContext = await request.newContext();
  let hotlinkUrl = '';
  
  try {
    const response = await apiContext.post('https://api.postimage.org/1/upload', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      data: formBody
    });
    if (!response.ok()) {
      console.error(`❌ 이미지 업로드 실패 (HTTP Status: ${response.status()})`);
      process.exit(1);
    }
    const responseText = await response.text();
    const successMatch = responseText.match(/success="(\d+)"/);
    const isSuccess = successMatch && successMatch[1] === '1';

    if (isSuccess) {
      const hotlinkMatch = responseText.match(/<hotlink>(.*?)<\/hotlink>/);
      hotlinkUrl = hotlinkMatch ? hotlinkMatch[1] : '';
      console.log('✅ 이미지 업로드 완료!');
    } else {
      console.error('❌ 업로드 응답 처리 실패:', responseText);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 업로드 중 오류 발생:', error);
    process.exit(1);
  } finally {
    await apiContext.dispose();
  }

  if (!hotlinkUrl) {
    console.error('❌ 이미지 직접 URL을 받아오지 못했습니다.');
    process.exit(1);
  }

  // 4단계: Playwright 브라우저 자동화를 통한 Jigsaw Explorer 퍼즐 생성
  console.log(`\n⏳ 2단계: Jigsaw Explorer에서 ${pieces}조각 퍼즐방 생성 중...`);
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
    
    // 이미지 URL 및 조각 수 입력
    await page.locator('input[name="image-url"]').fill(hotlinkUrl);
    await page.locator('input[name="puzzle-nop"]').fill(String(pieces));
    await page.getByRole('button', { name: 'Create the Jigsaw Puzzle' }).click();

    // 동의 버튼 팝업 예외 처리
    try {
      const agreeBtn = page.getByRole('button', { name: 'I Agree' });
      await agreeBtn.waitFor({ timeout: 2000 });
      await agreeBtn.click();
    } catch (e) {}

    // 1차 단축 퍼즐 링크 획득
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

    // 5단계: 생성된 퍼즐 페이지로 이동하여 멀티플레이 초대 링크 발급
    console.log(`⏳ 3단계: "${nickname}" 닉네임으로 멀티플레이어 초대 링크 발급 중...`);
    await page.goto(shortLink, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 멀티플레이어 버튼 클릭
    const multiplayerBtn = page.locator('#jigex-multiplayer-btn');
    await multiplayerBtn.waitFor({ state: 'visible', timeout: 30000 });
    await multiplayerBtn.click();

    // 닉네임 기입
    const playerNameInput = page.locator('#jigex-player-name');
    await playerNameInput.waitFor({ state: 'visible', timeout: 5000 });
    await playerNameInput.fill(nickname);

    // Create Game Link 버튼 클릭
    await page.getByRole('button', { name: 'Create Game Link' }).click();

    // 최종 멀티플레이용 게임 링크 획득 (비동기 생성 대기 보강)
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

    console.log('\n====================================================');
    console.log('🎉 [멀티플레이어 지그소 퍼즐 생성 성공!] 🎉');
    console.log(`🧩 설정된 퍼즐 조각 수: ${pieces} 조각`);
    console.log(`👤 방장 닉네임         : ${nickname}`);
    console.log(`🖼️  직접 이미지 URL    : ${hotlinkUrl}`);
    console.log(`🔗 1인용 단축 링크     : ${shortLink}`);
    console.log('\n🎮 [친구들 초대용 멀티플레이 게임 링크] 🎮');
    console.log(gameLink);
    console.log('====================================================');

    // 📋 클립보드 자동 복사 실행
    if (gameLink && gameLink.startsWith('http')) {
      try {
        clipboard.writeSync(gameLink);
        console.log('📋 알림: 초대 링크가 클립보드에 자동으로 복사되었습니다!');
      } catch (clipErr) {
        console.warn('⚠️  클립보드 자동 복사에 실패했습니다:', clipErr.message);
      }
    }

    // 📂 6단계: 성공적으로 완료된 후, 사용된 이미지 파일을 used/ 폴더로 자동 이동
    if (gameLink && gameLink.startsWith('http')) {
      if (!fs.existsSync(USED_DIR)) {
        fs.mkdirSync(USED_DIR, { recursive: true });
      }
      const destPath = path.join(USED_DIR, selectedImage);
      fs.renameSync(imagePath, destPath);
      console.log(`📂 알림: 사용 완료된 이미지 "${selectedImage}"가 'images/used/' 폴더로 이동되었습니다.`);
    }

  } catch (error) {
    console.error('❌ 퍼즐 생성 및 멀티플레이 자동화 중 오류 발생:', error);
  } finally {
    await browser.close();
  }
}

main();