import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to Jigsaw Explorer...');
    await page.goto('https://www.jigsawexplorer.com/create-a-jigsaw-puzzle/', { waitUntil: 'domcontentloaded' });
    
    // 페이지 내 input 필드와 button 정보 출력
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, button, label')).map(el => {
        return {
          tagName: el.tagName,
          id: el.id,
          name: el.name,
          type: el.type,
          placeholder: el.placeholder,
          labelText: el.innerText || el.textContent,
          className: el.className
        };
      });
    });
    
    console.log('--- FOUND ELEMENTS ---');
    console.log(JSON.stringify(inputs, null, 2));
    
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
}

main();
