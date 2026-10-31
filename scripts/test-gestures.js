/**
 * 播放器手势回归测试（Edge 移动视口 + 真实片源）
 * 覆盖：单击显隐菜单 / 双击播放暂停 / 中部横滑调进度 / 左侧竖滑调音量 / 中部竖滑不误触
 */
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8787';
const SID = '7688736152076962840';
const W = 390;
const H = 844;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const read = () => page.evaluate(() => {
    const video = document.querySelector('#video');
    return {
      time: +video.currentTime.toFixed(2),
      duration: +video.duration.toFixed(2),
      paused: video.paused,
      rate: video.playbackRate,
      speedLabel: document.querySelector('#player-speed').textContent,
      title: document.querySelector('#player-title').textContent,
      idle: document.querySelector('#player').classList.contains('is-idle'),
      hudOn: document.querySelector('#gesture-hud').classList.contains('is-on'),
      hudValue: document.querySelector('#hud-value').textContent,
      hudLabel: document.querySelector('#hud-label').textContent,
      pulseOn: document.querySelector('#tap-pulse').classList.contains('is-on'),
    };
  });

  await page.goto(`${BASE}/#/detail?id=${SID}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.click('#btn-play');
  await page.waitForFunction(() => {
    const video = document.querySelector('#video');
    return video && video.readyState >= 2 && !video.paused;
  }, { timeout: 90000 });

  // 1. 起播 3.2 秒后控件自动隐藏
  await page.waitForTimeout(3400);
  let s = await read();
  check('起播后控件自动隐藏', s.idle === true, `is-idle=${s.idle}`);

  // 2. 单击画面：呼出菜单
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(420);
  s = await read();
  check('单击呼出菜单', s.idle === false, `is-idle=${s.idle}`);

  // 3. 再次单击：隐藏菜单
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(420);
  s = await read();
  check('再次单击隐藏菜单', s.idle === true, `is-idle=${s.idle}`);

  // 4. 双击：暂停
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(90);
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(320);
  s = await read();
  check('双击暂停', s.paused === true, `paused=${s.paused}`);
  check('双击有中央脉冲反馈', s.pulseOn === true, `pulse=${s.pulseOn}`);
  check('双击后菜单保持显示', s.idle === false, `is-idle=${s.idle}`);

  // 5. 双击：恢复播放
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(90);
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(500);
  s = await read();
  check('双击恢复播放', s.paused === false, `paused=${s.paused}`);

  // 6. 中部横滑调进度（先暂停，便于比对）
  await page.evaluate(() => document.querySelector('#video').pause());
  await page.waitForTimeout(150);
  const before = await read();
  await page.mouse.move(210, 420);
  await page.mouse.down();
  await page.mouse.move(300, 420, { steps: 10 });
  await page.waitForTimeout(120);
  const during = await read();
  await page.screenshot({ path: '.cache/pw-hud-seek.png' });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const afterSeek = await read();
  const ratioMoved = (300 - 210) / (W * 0.92);
  const expectTime = Math.min(before.duration, before.time + ratioMoved * before.duration);
  check('横滑时显示进度浮层', during.hudOn === true && during.hudLabel.includes('共'), `hud=${during.hudValue} / ${during.hudLabel}`);
  check('横滑松手前不改动播放位置', Math.abs(during.time - before.time) < 0.6, `before=${before.time}s during=${during.time}s`);
  check('横滑松手后跳转正确', Math.abs(afterSeek.time - expectTime) < before.duration * 0.04,
    `expect≈${expectTime.toFixed(1)}s actual=${afterSeek.time}s`);

  // 7. 右侧上滑：切换到下一集
  const beforeSwipe = await read();
  await page.mouse.move(350, 620);
  await page.mouse.down();
  await page.mouse.move(350, 500, { steps: 12 });
  await page.waitForTimeout(120);
  const epDuring = await read();
  await page.screenshot({ path: '.cache/pw-hud-episode.png' });
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const epAfter = await read();
  check('右侧上滑显示切集浮层', epDuring.hudOn === true && epDuring.hudValue === '下一集',
    `hud=${epDuring.hudValue} / ${epDuring.hudLabel}`);
  check('右侧上滑切到下一集', epAfter.title !== beforeSwipe.title && /第 2 集/.test(epAfter.title),
    `${beforeSwipe.title} -> ${epAfter.title}`);

  // 8. 右侧下滑：回到上一集
  await page.mouse.move(350, 500);
  await page.mouse.down();
  await page.mouse.move(350, 620, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const epBack = await read();
  check('右侧下滑回到上一集', /第 1 集/.test(epBack.title), epBack.title);

  // 9. 右侧滑动距离不足不切集
  await page.mouse.move(350, 600);
  await page.mouse.down();
  await page.mouse.move(350, 572, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const epShort = await read();
  check('滑动距离不足不切集', epShort.title === epBack.title, `${epBack.title} -> ${epShort.title}`);

  // 10. 倍速：切换后进入下一集仍保持
  await page.evaluate(() => document.querySelector('#player').classList.remove('is-idle'));
  await page.click('#player-speed', { force: true });
  await page.waitForTimeout(250);
  const speedBefore = await read();
  check('倍速按钮切换生效', Math.abs(speedBefore.rate - 1.25) < 0.02 && speedBefore.speedLabel === '1.25×',
    `rate=${speedBefore.rate} label=${speedBefore.speedLabel}`);

  await page.evaluate(() => document.querySelector('#player').classList.remove('is-idle'));
  await page.click('#player-next', { force: true });
  await page.waitForFunction(() => {
    const v = document.querySelector('#video');
    return v && v.readyState >= 2 && !v.paused;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const speedAfter = await read();
  check('切集后倍速不丢失', Math.abs(speedAfter.rate - 1.25) < 0.02,
    `rate=${speedAfter.rate} title=${speedAfter.title}`);
  check('切集后倍速按钮文案一致', speedAfter.speedLabel === '1.25×', speedAfter.speedLabel);

  // 11. 中部竖滑不误触进度（先暂停，避免播放本身带来的时间漂移干扰判断）
  await page.evaluate(() => document.querySelector('#video').pause());
  await page.waitForTimeout(200);
  const beforeVertical = await read();
  await page.mouse.move(250, 480);
  await page.mouse.down();
  await page.mouse.move(250, 640, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterVertical = await read();
  check('中部竖滑不改变播放位置', Math.abs(afterVertical.time - beforeVertical.time) < 0.5,
    `${beforeVertical.time}s -> ${afterVertical.time}s`);

  // 10. 选集面板内点击不被手势层拦截
  await page.evaluate(() => document.querySelector('#video').pause());
  await page.click('#player-list');
  await page.waitForTimeout(400);
  const sheetOpen = await page.evaluate(() => !document.querySelector('#player-sheet').hidden);
  check('选集按钮可正常打开', sheetOpen === true, `sheet=${sheetOpen}`);
  const epCount = await page.locator('#player-sheet .ep').count();
  await page.locator('#player-sheet .ep').nth(1).click();
  await page.waitForTimeout(1200);
  const switched = await page.evaluate(() => document.querySelector('#player-title').textContent);
  check('选集面板可正常切集', /第 2 集/.test(switched), `title=${switched}`);
  check('选集内可点集数', epCount > 10, `${epCount} 集`);

  check('无页面脚本错误', errors.length === 0, errors.join(' | ') || 'none');

  await browser.close();
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exit(1);
});
