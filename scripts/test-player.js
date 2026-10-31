// 播放器进度条回归测试：拖动 / 点击跳转 / 播放暂停 / 时间显示
const path = require('node:path');
const { chromium } = require('playwright-core');

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SID = process.env.SID || '7688736152076962840';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', (error) => console.log('[pageerror]', error.message));

  await page.goto(`http://127.0.0.1:8787/#/detail?id=${SID}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.click('#btn-play');

  await page.waitForFunction(() => {
    const video = document.querySelector('#video');
    return video && Number.isFinite(video.duration) && video.duration > 0;
  }, null, { timeout: 45000 });

  const state = () => page.evaluate(() => {
    const video = document.querySelector('#video');
    return {
      currentTime: Number(video.currentTime.toFixed(1)),
      duration: Number(video.duration.toFixed(1)),
      paused: video.paused,
      seekableEnd: video.seekable.length ? Number(video.seekable.end(video.seekable.length - 1).toFixed(1)) : 0,
      playedWidth: document.querySelector('#seek-played').style.width,
      bufferWidth: document.querySelector('#seek-buffer').style.width,
      timeCurrent: document.querySelector('#time-current').textContent,
      timeTotal: document.querySelector('#time-total').textContent,
      toggleIcon: document.querySelector('#player-toggle svg rect') ? 'pause' : 'play',
    };
  });

  console.log('初始:', JSON.stringify(await state()));

  const box = await page.locator('#seek').boundingBox();
  const y = box.y + box.height / 2;
  const at = (ratio) => box.x + box.width * ratio;

  // 1) 拖动到 20%
  await page.mouse.move(at(0.6), y);
  await page.mouse.down();
  await page.mouse.move(at(0.45), y, { steps: 5 });
  await page.mouse.move(at(0.2), y, { steps: 5 });
  const during = await state();
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log('拖动中:', JSON.stringify(during));
  console.log('松手后:', JSON.stringify(await state()));

  // 2) 点击 85% 直接跳转
  await page.mouse.click(at(0.85), y);
  await page.waitForTimeout(800);
  console.log('点击 85%:', JSON.stringify(await state()));

  // 3) 暂停 / 播放
  await page.click('#player-toggle');
  await page.waitForTimeout(300);
  const pausedState = await state();
  console.log('点暂停:', JSON.stringify({ paused: pausedState.paused, icon: pausedState.toggleIcon }));
  await page.click('#player-toggle');
  await page.waitForTimeout(600);
  const playingState = await state();
  console.log('再点播放:', JSON.stringify({ paused: playingState.paused, icon: playingState.toggleIcon }));

  await page.screenshot({ path: path.join(__dirname, '..', '.cache', 'pw-player-bar.png') });
  await browser.close();
})().catch((error) => { console.error('FAIL', error.message); process.exit(1); });
