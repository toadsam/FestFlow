const { chromium } = require('playwright');
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/')) {
      const method = resp.request().method();
      const status = resp.status();
      let text = '';
      try {
        text = await resp.text();
      } catch (e) {
        text = String(e);
      }
      console.log(method, status, url.split('://')[1]);
      if (!url.includes('api/not-found')) {
        if (method === 'POST' || status >= 400) {
          console.log(text.slice(0, 180));
        }
      }
    }
  });
  page.on('console', msg => console.log('console', msg.type(), msg.text()));
  await page.goto('http://localhost:5173/admin', { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="아이디 0000"]', '0000');
  await page.fill('input[placeholder="비밀번호 0000"]', '0000');
  await page.click('form button');
  await page.waitForTimeout(1500);
  const body = await page.textContent('body');
  console.log('BODY', body.slice(0, 1800));
  await browser.close();
})();
