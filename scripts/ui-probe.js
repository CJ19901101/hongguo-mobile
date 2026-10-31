// 用系统 Edge 做移动视口诊断与截图（不下载浏览器）。
const path = require('node:path');
const { chromium } = require('playwright-core');

const EDGE = process.env.EDGE
  || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  || 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const BASE = 'http://127.0.0.1:8787';
const OUT = path.join(__dirname, '..', '.cache');

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });
  page.on('pageerror', (error) => console.log('[pageerror]', error.message));

  const probe = async (name, hash) => {
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(800);
    const info = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      wide: [...document.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest('.chips,.rail'))
        .slice(0, 6)
        .map((el) => `${el.tagName}.${String(el.className).split(' ')[0]}(right=${Math.round(el.getBoundingClientRect().right)})`),
    }));
    console.log(name, JSON.stringify(info));
    await page.screenshot({ path: path.join(OUT, `pw-${name}.png`) });
  };

  await probe('home', '#/home');
  await probe('search', '#/search?q=%E6%80%BB%E8%A3%81');
  await probe('detail', '#/detail?id=7688736152076962840');
  await browser.close();
})().catch((error) => { console.error('FAIL', error.message); process.exit(1); });
