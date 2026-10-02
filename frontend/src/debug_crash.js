import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('http://127.0.0.1:5173');
  
  // Wait for login or employees page
  await new Promise(r => setTimeout(r, 2000));
  
  await page.goto('http://127.0.0.1:5173/employees');
  
  await new Promise(r => setTimeout(r, 2000));
  
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Change PIN')) {
      console.log('Clicking Change PIN...');
      await btn.click();
      await new Promise(r => setTimeout(r, 1000));
      break;
    }
  }

  await browser.close();
})();
