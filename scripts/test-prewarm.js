/**
 * 预加载 A/B 对比：清空缓存后
 *  A. 冷切集（下一集未预热）→ 点击到出画面的耗时
 *  B. 预热后切集（上一集播放时已后台解密）→ 同样口径的耗时
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8787';
const SID = '7688736152076962840';
const CACHE = path.join(__dirname, '..', '.cache', 'media');

(async () => {
  for (const name of fs.readdirSync(CACHE)) {
    if (name.endsWith('.mp4') || name.endsWith('.part')) fs.unlinkSync(path.join(CACHE, name));
  }
  console.log('缓存已清空\n');

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const warms = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/warm')) return;
    const body = await response.json().catch(() => ({}));
    warms.push(body);
    console.log(`  后台预热完成：服务端 ${body.ms}ms, ${(body.bytes / 1048576).toFixed(1)}MB`);
  });

  const waitPlaying = (timeout = 60000) => page.waitForFunction(() => {
    const v = document.querySelector('#video');
    return v && v.readyState >= 2 && !v.paused && v.currentTime > 0.05;
  }, null, { timeout });

  // 计时放在 Node 侧：点击后轮询"新片源已出画面"，避开事件时序问题
  const doSwitch = async () => {
    const beforeSrc = await page.evaluate(() => {
      document.querySelector('#player').classList.remove('is-idle');
      return document.querySelector('#video').currentSrc;
    });
    const startedAt = Date.now();
    await page.click('#player-next', { force: true });
    await page.waitForFunction((previous) => {
      const video = document.querySelector('#video');
      return Boolean(video.currentSrc) && video.currentSrc !== previous && video.currentTime > 0.05;
    }, beforeSrc, { timeout: 90000 });
    return Date.now() - startedAt;
  };

  await page.goto(`${BASE}/#/detail?id=${SID}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.click('#btn-play');
  await waitPlaying(120000);
  console.log('第 1 集起播（冷启动）');

  // A. 立刻切下一集：预热计时器（2s）尚未触发

  const coldMs = await doSwitch();
  console.log(`A 冷切集（未预热）: ${coldMs}ms`);

  await waitPlaying(60000);
  console.log('第 2 集已起播，等待后台预热第 3 集…');
  const deadline = Date.now() + 45000;
  while (warms.length < 1 && Date.now() < deadline) await page.waitForTimeout(250);
  await page.waitForTimeout(300);


  const warmMs = await doSwitch();
  console.log(`B 预热后切集: ${warmMs}ms`);

  const ok = warmMs > 0 && coldMs > 0 && warmMs < coldMs * 0.6;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  提升 ${(coldMs / warmMs).toFixed(1)}×（${coldMs}ms → ${warmMs}ms）`);
  await browser.close();
  if (!ok) process.exitCode = 1;
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exit(1);
});
