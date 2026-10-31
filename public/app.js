/* 红果短剧 · 移动版前端（无构建、无框架，直接跑在 iOS Safari / 主屏幕独立窗口里） */

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const topbar = $('#topbar');
const toastEl = $('#toast');

/* ---------------- 基础工具 ---------------- */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

let toastTimer = 0;
function toast(message, ms = 2600) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

async function api(path, params) {
  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  let body;
  try {
    body = await response.json();
  } catch (_) {
    throw new Error('服务返回异常，请确认后端仍在运行');
  }
  if (!response.ok || !body.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

const store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 隐私模式下忽略 */ }
  },
};

const HISTORY_KEY = 'hgm.history';
const PROGRESS_KEY = 'hgm.progress';
const SEARCH_KEY = 'hgm.searches';

const watchHistory = {
  list: () => store.read(HISTORY_KEY, []),
  touch(entry) {
    const rows = store.read(HISTORY_KEY, []).filter((item) => item.id !== entry.id);
    rows.unshift(entry);
    store.write(HISTORY_KEY, rows.slice(0, 60));
  },
  remove(id) {
    store.write(HISTORY_KEY, store.read(HISTORY_KEY, []).filter((item) => item.id !== id));
  },
};

const progress = {
  get: (sid) => store.read(PROGRESS_KEY, {})[sid] || null,
  set(sid, value) {
    const all = store.read(PROGRESS_KEY, {});
    all[sid] = value;
    store.write(PROGRESS_KEY, all);
  },
};

function rememberSearch(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return;
  const rows = store.read(SEARCH_KEY, []).filter((item) => item !== kw);
  rows.unshift(kw);
  store.write(SEARCH_KEY, rows.slice(0, 12));
}

/* ---------------- 路由 ---------------- */

const routes = {
  home: renderHome,
  search: renderSearch,
  mine: renderMine,
  detail: renderDetail,
};

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, query] = hash.split('?');
  return { name: routes[name] ? name : 'home', params: new URLSearchParams(query || ''), raw: hash };
}

async function router() {
  const route = currentRoute();
  const tab = route.name === 'detail' ? 'search' : route.name;
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('is-active', el.dataset.tab === tab));
  $('#topbar').style.display = route.name === 'detail' ? 'none' : '';
  view.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    await routes[route.name](route.params);
  } catch (error) {
    view.innerHTML = `<div class="empty"><b>加载失败</b>${esc(error.message)}</div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('scroll', () => topbar.classList.toggle('is-scrolled', window.scrollY > 4), { passive: true });

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => { location.hash = `#/${tab.dataset.tab}`; });
});
$('#btn-search').addEventListener('click', () => { location.hash = '#/search'; });

/* ---------------- 通用片段 ---------------- */

const SOURCE_LABEL = { hongguo: '红果', xifan: '西饭', hema: '河马' };

function posterCard(item) {
  const cover = item.cover
    ? `<img src="${esc(item.cover)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'fallback',textContent:'${esc(item.title).slice(0, 12)}'}))">`
    : `<div class="fallback">${esc(item.title).slice(0, 12)}</div>`;
  const badge = item.episodeCount ? `<span class="badge">${item.episodeCount} 集</span>` : '';
  return `<a class="card-link" href="#/detail?id=${encodeURIComponent(item.id)}">
    <div class="poster">${cover}${badge}</div>
    <div class="poster-title">${esc(item.title)}</div>
  </a>`;
}

function skeletonGrid(count = 9) {
  return `<div class="grid">${'<div class="skeleton"></div>'.repeat(count)}</div>`;
}

/* ---------------- 发现页 ---------------- */

const CATEGORIES = [
  { key: 'hot-drama', label: '热播榜' },
  { key: 'real-drama', label: '真人剧' },
  { key: 'comic-drama', label: '漫剧' },
  { key: 'ai-drama', label: 'AI 剧' },
];

let homeState = { category: 'hot-drama', page: 1, items: [] };

async function renderHome() {
  if (!homeState.items.length) {
    view.innerHTML = `
      <div class="section-head"><h2>短剧库</h2><span class="hint">下拉切换分类</span></div>
      <div class="chips" id="home-chips">
        ${CATEGORIES.map((c) => `<button class="chip${c.key === homeState.category ? ' is-active' : ''}" data-key="${c.key}">${c.label}</button>`).join('')}
      </div>
      ${skeletonGrid(9)}`;
  }
  bindHomeChips();
  await loadHome(true);
}

function bindHomeChips() {
  const chips = $('#home-chips');
  if (!chips) return;
  chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip || chip.dataset.key === homeState.category) return;
    chips.querySelectorAll('.chip').forEach((el) => el.classList.toggle('is-active', el === chip));
    homeState = { category: chip.dataset.key, page: 1, items: [] };
    view.querySelector('.grid')?.remove();
    view.insertAdjacentHTML('beforeend', skeletonGrid(9));
    loadHome(true);
  });
}

let loadingHome = false;
async function loadHome(reset = false) {
  if (loadingHome) return;
  loadingHome = true;
  try {
    const page = reset ? 1 : homeState.page + 1;
    const data = await api('/api/browse', { category: homeState.category, page });
    if (data.page !== homeState.page || reset) {
      homeState.page = data.page;
      homeState.items = reset ? data.results : [...homeState.items, ...data.results];
    }
    paintHome(data.hasMore);
  } catch (error) {
    const grid = view.querySelector('.grid');
    if (grid && !homeState.items.length) grid.remove();
    view.insertAdjacentHTML('beforeend', `<div class="empty"><b>内容加载失败</b>${esc(error.message)}</div>`);
  } finally {
    loadingHome = false;
  }
}

function paintHome(hasMore) {
  view.querySelector('.grid')?.remove();
  view.querySelector('.load-more')?.remove();
  if (!homeState.items.length) {
    view.insertAdjacentHTML('beforeend', '<div class="empty"><b>这个分类暂时没有内容</b>换个分类看看</div>');
    return;
  }
  view.insertAdjacentHTML('beforeend', `<div class="grid">${homeState.items.map(posterCard).join('')}</div>`);
  if (hasMore) {
    const button = document.createElement('button');
    button.className = 'ghost-btn load-more';
    button.style.cssText = 'display:block;margin:0 auto 28px;';
    button.textContent = '加载更多';
    button.addEventListener('click', () => { button.textContent = '加载中…'; loadHome(false); });
    view.appendChild(button);
  }
}

/* ---------------- 搜索页 ---------------- */

let searchState = { keyword: '', source: 'all', results: [], done: false };

async function renderSearch(params) {
  const keyword = params.get('q') || searchState.keyword || '';
  view.innerHTML = `
    <div class="search-bar">
      <form class="search-input-wrap" id="search-form">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5 L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="search-input" type="search" enterkeyhint="search" autocomplete="off" placeholder="搜剧名 / 关键词，如 总裁" value="${esc(keyword)}">
        ${keyword ? '<button type="button" class="search-clear" id="search-clear">清空</button>' : ''}
      </form>
    </div>
    <div class="chips" id="source-chips">
      ${[['all', '全部'], ['hongguo', '红果'], ['xifan', '西饭'], ['hema', '河马']]
        .map(([key, label]) => `<button class="chip${key === searchState.source ? ' is-active' : ''}" data-source="${key}">${label}</button>`).join('')}
    </div>
    <div id="search-body"></div>`;

  const input = $('#search-input');
  const body = $('#search-body');

  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    input.blur();
    runSearch(input.value.trim());
  });
  $('#search-clear')?.addEventListener('click', () => {
    input.value = '';
    searchState = { ...searchState, keyword: '', results: [], done: false };
    body.innerHTML = recentSearches();
    bindRecent();
    location.hash = '#/search';
  });
  $('#source-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    $('#source-chips').querySelectorAll('.chip').forEach((el) => el.classList.toggle('is-active', el === chip));
    searchState.source = chip.dataset.source;
    if (searchState.keyword) runSearch(searchState.keyword);
  });

  if (keyword && (!searchState.done || searchState.keyword !== keyword)) {
    searchState.keyword = keyword;
    await runSearch(keyword);
  } else if (!keyword) {
    body.innerHTML = recentSearches();
    bindRecent();
  }
}

function recentSearches() {
  const rows = store.read(SEARCH_KEY, []);
  if (!rows.length) {
    return `<div class="empty"><b>搜你想看的短剧</b>支持剧名、关键词，也可以直接粘贴分享链接或剧集 ID</div>`;
  }
  return `<div class="section-head"><h2>最近搜索</h2></div>
    <div class="chips">${rows.map((kw) => `<button class="chip" data-kw="${esc(kw)}">${esc(kw)}</button>`).join('')}</div>`;
}

function bindRecent() {
  view.querySelectorAll('[data-kw]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const input = $('#search-input');
      if (input) input.value = chip.dataset.kw;
      runSearch(chip.dataset.kw);
    });
  });
}

let searching = false;
async function runSearch(keyword) {
  const body = $('#search-body');
  const kw = String(keyword || '').trim();
  if (!kw || searching) return;
  searching = true;
  searchState.keyword = kw;
  $('#search-clear')?.remove();
  $('#search-form')?.insertAdjacentHTML('beforeend', '<button type="button" class="search-clear" id="search-clear">清空</button>');
  $('#search-clear')?.addEventListener('click', () => { $('#search-input').value = ''; searchState = { ...searchState, keyword: '', results: [], done: false }; body.innerHTML = recentSearches(); bindRecent(); });
  body.innerHTML = `<div class="result-row" style="color:var(--text-faint);font-size:13px;padding-top:16px">正在搜索「${esc(kw)}」…</div>`;

  try {
    const data = await api('/api/search', { q: kw, source: searchState.source });
    searchState.results = data.results || [];
    searchState.done = true;
    rememberSearch(kw);
    if (location.hash !== `#/search?q=${encodeURIComponent(kw)}`) {
      window.history.replaceState(null, '', `#/search?q=${encodeURIComponent(kw)}`);
    }
    if (!searchState.results.length) {
      body.innerHTML = `<div class="empty"><b>没有找到「${esc(kw)}」</b>${esc(data.error || '换个关键词，或切换到其他来源试试')}</div>`;
      return;
    }
    body.innerHTML = `
      ${data.partial ? `<div class="empty" style="padding:14px 16px 0;text-align:left;font-size:12px">部分来源未完成：${esc(data.error)}</div>` : ''}
      ${searchState.results.map(resultRow).join('')}`;
  } catch (error) {
    body.innerHTML = `<div class="empty"><b>搜索失败</b>${esc(error.message)}</div>`;
  } finally {
    searching = false;
  }
}

function resultRow(item) {
  const thumb = item.cover
    ? `<img src="${esc(item.cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
    : '';
  const tags = [
    item.source !== 'hongguo' ? `<span class="tag src">${SOURCE_LABEL[item.source] || item.source}</span>` : '',
    ...item.tags.slice(0, 3).map((tag) => `<span class="tag">${esc(tag)}</span>`),
  ].join('');
  const meta = [item.episodeCount ? `${item.episodeCount} 集` : '', item.description].filter(Boolean).join(' · ');
  return `<a class="result-row" href="#/detail?id=${encodeURIComponent(item.id)}">
    <div class="result-thumb">${thumb}</div>
    <div class="result-main">
      <h3>${esc(item.title)}</h3>
      <div class="tag-row">${tags}</div>
      <p>${esc(meta)}</p>
    </div>
  </a>`;
}

/* ---------------- 详情页 ---------------- */

let currentSeries = null;

async function renderDetail(params) {
  const id = params.get('id');
  if (!id) { location.hash = '#/home'; return; }
  view.innerHTML = `<div class="empty"><b>加载中</b>正在读取剧集信息…</div>`;
  const data = await api('/api/series', { id });
  const series = data.series;
  currentSeries = series;
  const saved = progress.get(series.id);
  const startIndex = saved?.index || series.episodes[0].index;

  watchHistory.touch({
    id: series.id,
    title: series.title,
    cover: series.cover,
    source: series.source,
    index: startIndex,
    at: Date.now(),
    total: series.total,
  });

  view.innerHTML = `
    <div class="detail-hero">
      <div class="detail-bg" style="${series.cover ? `background-image:url('${esc(series.cover)}')` : ''}"></div>
      <button class="icon-btn detail-back" id="detail-back" aria-label="返回">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="detail-head">
        <div class="detail-cover">${series.cover ? `<img src="${esc(series.cover)}" alt="">` : ''}</div>
        <div class="detail-meta">
          <h1>${esc(series.title)}</h1>
          <div class="detail-stats">
            <span>共 ${series.total} 集</span>
            <span>${SOURCE_LABEL[series.source] || '红果'}源</span>
          </div>
          <div class="tag-row">
            ${saved ? `<span class="tag">上次看到第 ${saved.index} 集</span>` : ''}
          </div>
          <div class="detail-actions">
            <button class="primary-btn" id="btn-play">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>
              ${saved ? '继续播放' : '开始播放'}
            </button>
            <button class="ghost-btn" id="btn-first">从头看</button>
          </div>
        </div>
      </div>
    </div>
    <div class="section-head"><h2>选集</h2><span class="hint">${series.episodes.filter((e) => !e.locked).length} 集可播</span></div>
    <div class="ep-grid" id="ep-grid">
      ${series.episodes.map((episode) => `
        <button class="ep${episode.index === startIndex ? ' is-current' : ''}${episode.locked ? ' is-locked' : ''}"
          data-vid="${esc(episode.vid)}" data-index="${episode.index}">${episode.index}</button>`).join('')}
    </div>
    <div style="height:8px"></div>`;

  $('#detail-back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else location.hash = '#/home';
  });

  $('#ep-grid').addEventListener('click', (event) => {
    const button = event.target.closest('.ep');
    if (!button) return;
    const episode = series.episodes.find((item) => item.vid === button.dataset.vid);
    if (episode) startPlayback(series, episode);
  });
  $('#btn-play').addEventListener('click', () => {
    const episode = series.episodes.find((item) => item.index === startIndex) || series.episodes[0];
    startPlayback(series, episode);
  });
  $('#btn-first').addEventListener('click', () => startPlayback(series, series.episodes[0]));
}

/* ---------------- 我的 ---------------- */

function renderMine() {
  const rows = watchHistory.list();
  const recent = store.read(SEARCH_KEY, []);
  view.innerHTML = `
    <div class="section-head"><h2>观看记录</h2>${rows.length ? '<button class="hint" id="clear-history">清空</button>' : ''}</div>
    ${rows.length ? rows.map(historyRow).join('') : '<div class="empty"><b>还没有观看记录</b>去「发现」里挑一部开始</div>'}
    ${recent.length ? `<div class="section-head"><h2>最近搜索</h2></div>
      <div class="chips">${recent.map((kw) => `<a class="chip" href="#/search?q=${encodeURIComponent(kw)}">${esc(kw)}</a>`).join('')}</div>` : ''}
    <div class="section-head"><h2>关于</h2></div>
    <div class="empty" style="padding:0 16px 40px;text-align:left;font-size:12px;line-height:1.9">
      红果短剧移动版 · 由本机后端提供片源解析<br>
      添加到主屏幕后以全屏独立窗口运行，与原生应用体验一致<br>
      内容来自公开接口，仅供学习研究，请支持正版
    </div>`;

  $('#clear-history')?.addEventListener('click', () => {
    store.write(HISTORY_KEY, []);
    store.write(PROGRESS_KEY, {});
    renderMine();
    toast('已清空观看记录');
  });
}

function historyRow(item) {
  const percent = item.percent ? Math.min(100, Math.round(item.percent)) : 0;
  return `<a class="history-row" href="#/detail?id=${encodeURIComponent(item.id)}">
    <div class="history-thumb">${item.cover ? `<img src="${esc(item.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}</div>
    <div class="history-main">
      <h3>${esc(item.title)}</h3>
      <span>看到第 ${item.index || 1} 集${item.total ? ` / 共 ${item.total} 集` : ''}</span>
      ${percent ? `<div class="progress-line"><i style="width:${percent}%"></i></div>` : ''}
    </div>
  </a>`;
}

/* ---------------- 播放器 ---------------- */

const player = {
  el: $('#player'),
  video: $('#video'),
  title: $('#player-title'),
  loading: $('#player-loading'),
  loadingText: $('#player-loading-text'),
  sheet: $('#player-sheet'),
  seek: $('#seek'),
  seekBuffer: $('#seek-buffer'),
  seekPlayed: $('#seek-played'),
  seekThumb: $('#seek-thumb'),
  timeCurrent: $('#time-current'),
  timeTotal: $('#time-total'),
  series: null,
  episode: null,
  idleTimer: 0,
  saveTimer: 0,
  warmTimer: 0,
  warmSeq: 0,
  dragging: false,
  dragRatio: 0,
  speeds: [1, 1.25, 1.5, 2, 0.75],
  speedIndex: 0,
};

/* ---------- 进度条 ---------- */

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ratio 只负责视觉；真正的 seek 在松手时一次性提交，避免拖动中反复触发行解码。
function paintSeek(ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  player.seekPlayed.style.width = `${clamped * 100}%`;
  player.seekThumb.style.left = `${clamped * 100}%`;
  player.seek.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  return clamped;
}

function paintBuffer() {
  const { video } = player;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0 || !video.buffered.length) {
    player.seekBuffer.style.width = '0%';
    return;
  }
  let ahead = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime + 0.5) ahead = Math.max(ahead, video.buffered.end(i));
  }
  player.seekBuffer.style.width = `${Math.min(100, (ahead / duration) * 100)}%`;
}

function paintTimes(seconds) {
  const duration = player.video.duration;
  player.timeTotal.textContent = Number.isFinite(duration) && duration > 0 ? formatTime(duration) : '00:00';
  player.timeCurrent.textContent = formatTime(seconds ?? player.video.currentTime);
}

function resetSeek() {
  player.dragging = false;
  player.seek.classList.remove('is-dragging');
  paintSeek(0);
  player.seekBuffer.style.width = '0%';
  player.timeCurrent.textContent = '00:00';
  player.timeTotal.textContent = '00:00';
}

function ratioFromClientX(clientX) {
  const rect = player.seek.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function commitSeek(ratio) {
  const { video } = player;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const target = Math.min(Math.max(ratio * duration, 0), Math.max(duration - 0.15, 0));
  try {
    video.currentTime = target;
  } catch (_) { /* 尚未可跳转时忽略 */ }
  paintTimes(target);
}

const pointX = (event) => (event.touches?.[0]?.clientX ?? event.changedTouches?.[0]?.clientX ?? event.clientX);

const hasPointer = 'PointerEvent' in window;
const EV = hasPointer
  ? { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' }
  : { down: 'touchstart', move: 'touchmove', up: 'touchend', cancel: 'touchcancel' };

function onSeekStart(event) {
  if (!Number.isFinite(player.video.duration) || player.video.duration <= 0) return;
  player.dragging = true;
  player.seek.classList.add('is-dragging');
  player.el.classList.remove('is-idle');
  player.dragRatio = paintSeek(ratioFromClientX(pointX(event)));
  paintTimes(player.dragRatio * player.video.duration);
  if (hasPointer) player.seek.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onSeekMove(event) {
  if (!player.dragging) return;
  player.dragRatio = paintSeek(ratioFromClientX(pointX(event)));
  paintTimes(player.dragRatio * player.video.duration);
  event.preventDefault();
}

function onSeekEnd() {
  if (!player.dragging) return;
  player.dragging = false;
  player.seek.classList.remove('is-dragging');
  commitSeek(player.dragRatio);
}

player.seek.addEventListener(EV.down, onSeekStart, { passive: false });
player.seek.addEventListener(EV.move, onSeekMove, { passive: false });
player.seek.addEventListener(EV.up, onSeekEnd);
player.seek.addEventListener(EV.cancel, () => { player.dragging = false; player.seek.classList.remove('is-dragging'); });
// 手指划出进度条外也要继续跟随
document.addEventListener(EV.move, onSeekMove, { passive: false });
document.addEventListener(EV.up, onSeekEnd);

// 键盘：桌面端方向键微调
player.seek.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const step = event.key === 'ArrowRight' ? 5 : -5;
  commitSeek(Math.min(1, Math.max(0, (player.video.currentTime + step) / (player.video.duration || 1))));
  event.preventDefault();
});

/* ---------- 播放 / 暂停 ---------- */

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1.4" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.4" fill="currentColor"/></svg>';

function syncToggleIcon() {
  const button = $('#player-toggle');
  if (button) button.innerHTML = player.video.paused ? ICON_PLAY : ICON_PAUSE;
}

function togglePlay() {
  if (player.video.paused) player.video.play().catch(() => {});
  else player.video.pause();
  player.el.classList.remove('is-idle');
}

function findEpisodeByStep(series, episode, step) {
  const index = series.episodes.findIndex((item) => item.vid === episode.vid);
  return series.episodes[index + step] || null;
}

// 播放当前集时后台预解密下一集：切集直接命中磁盘缓存，不再等 1~3 秒
function warmNext(series, episode) {
  const next = findEpisodeByStep(series, episode, 1);
  if (!next) return;
  const seq = player.warmSeq;
  clearTimeout(player.warmTimer);
  player.warmTimer = setTimeout(() => {
    if (seq !== player.warmSeq || player.el.hidden) return;
    const query = `vid=${encodeURIComponent(next.vid)}&sid=${encodeURIComponent(series.id)}`;
    fetch(`/api/warm?${query}`, { method: 'POST', keepalive: true }).catch(() => { /* 预热失败不影响正常播放 */ });
  }, 2000);
}

function setLoading(text) {
  player.loadingText.textContent = text;
  player.loading.hidden = false;
}

async function startPlayback(series, episode) {
  player.series = series;
  player.episode = episode;
  player.warmSeq = (player.warmSeq || 0) + 1; // 作废上一集遗留的预热任务
  player.el.hidden = false;
  document.body.style.overflow = 'hidden';
  player.title.textContent = `${series.title} · 第 ${episode.index} 集`;
  player.video.removeAttribute('src');
  player.video.load();
  setLoading('正在解密片源…');
  resetSeek();
  syncToggleIcon();
  paintSheet();

  try {
    const info = await api('/api/play', { vid: episode.vid, sid: series.id });
    player.video.src = info.playUrl;
    applySpeed(); // 新片源立刻套用当前倍速，不回到 1×
    const resume = progress.get(series.id);
    const startAt = resume && resume.vid === episode.vid ? Number(resume.time) || 0 : 0;
    player.video.addEventListener('loadedmetadata', function once() {
      player.video.removeEventListener('loadedmetadata', once);
      if (startAt > 2 && startAt < player.video.duration - 5) player.video.currentTime = startAt;
    });
    player.loading.hidden = true;
    await player.video.play().catch(() => {
      setLoading('点一下屏幕开始播放');
      setTimeout(() => { player.loading.hidden = true; }, 1500);
    });
    warmNext(series, episode);
  } catch (error) {
    setLoading(error.message);
    setTimeout(() => { player.loading.hidden = true; }, 2600);
    toast(error.message);
  }
}

function closePlayer() {
  saveProgress();
  player.video.pause();
  player.video.removeAttribute('src');
  player.video.load();
  player.el.hidden = true;
  player.sheet.hidden = true;
  document.body.style.overflow = '';
}

function saveProgress() {
  const { series, episode, video } = player;
  if (!series || !episode || !video.duration || !Number.isFinite(video.duration)) return;
  const time = video.currentTime;
  progress.set(series.id, {
    vid: episode.vid,
    index: episode.index,
    time,
    duration: video.duration,
    percent: (time / video.duration) * 100,
  });
  watchHistory.touch({
    id: series.id,
    title: series.title,
    cover: series.cover,
    source: series.source,
    index: episode.index,
    total: series.total,
    percent: (time / video.duration) * 100,
    at: Date.now(),
  });
}

function paintSheet() {
  const { series, episode } = player;
  if (!series) return;
  $('#sheet-count').textContent = `共 ${series.total} 集`;
  $('#sheet-body').innerHTML = `<div class="ep-grid" style="padding:0">${series.episodes.map((item) => `
    <button class="ep${item.vid === episode?.vid ? ' is-current' : ''}${item.locked ? ' is-locked' : ''}"
      data-vid="${esc(item.vid)}">${item.index}</button>`).join('')}</div>`;
}

player.el.addEventListener('click', (event) => {
  const epButton = event.target.closest('#player-sheet .ep');
  if (epButton) {
    const episode = player.series?.episodes.find((item) => item.vid === epButton.dataset.vid);
    if (episode) {
      player.sheet.hidden = true;
      startPlayback(player.series, episode);
    }
    return;
  }
  // 画面上的点击/滑动统一交给手势层处理，这里只接选集面板
});

/* ---------------- 手势控制 ---------------- */

const gesture = {
  active: false,
  mode: null,          // null / 'seek' / 'episode' / 'none'
  zone: 'seek',
  sx: 0,
  sy: 0,
  st: 0,
  moved: false,
  seeking: false,
  ratio: 0,
  startRatio: 0,
  startTime: 0,
  episodeTarget: null,
  rect: null,
  lastTapAt: 0,
  lastTapX: 0,
  lastTapY: 0,
  tapTimer: 0,
};

// 右侧切集的滑动触发阈值（px）
const EPISODE_PX = 62;

const hud = {
  el: $('#gesture-hud'),
  value: $('#hud-value'),
  label: $('#hud-label'),
  bar: $('#hud-bar-fill'),
  pulse: $('#tap-pulse'),
  timer: 0,
};

function showHud(text, sub, ratio) {
  hud.value.textContent = text;
  hud.label.textContent = sub;
  hud.bar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  hud.el.classList.add('is-on');
  clearTimeout(hud.timer);
}

function fadeHud(delay = 700) {
  clearTimeout(hud.timer);
  hud.timer = setTimeout(() => hud.el.classList.remove('is-on'), delay);
}

function pulseToggle(playing) {
  hud.pulse.innerHTML = playing ? ICON_PLAY : ICON_PAUSE;
  hud.pulse.classList.remove('is-on');
  void hud.pulse.offsetWidth; // 强制重排以重启动画
  hud.pulse.classList.add('is-on');
}

function armIdleTimer(delay = 3000) {
  clearTimeout(player.idleTimer);
  player.idleTimer = setTimeout(() => {
    if (!player.dragging && !gesture.seeking && player.sheet.hidden && !player.video.paused) {
      player.el.classList.add('is-idle');
    }
  }, delay);
}

function gesturePoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  return { x: event.clientX, y: event.clientY };
}

// 单击：显隐菜单；双击（300ms 内同点两下）：播放/暂停
function handleTap(x, y) {
  if (!player.sheet.hidden) {
    player.sheet.hidden = true;
    return;
  }
  const now = performance.now();
  const isDouble = now - gesture.lastTapAt < 300 && Math.hypot(x - gesture.lastTapX, y - gesture.lastTapY) < 80;
  if (isDouble) {
    gesture.lastTapAt = 0;
    clearTimeout(gesture.tapTimer);
    gesture.tapTimer = 0;
    togglePlay();
    pulseToggle(!player.video.paused);
    player.el.classList.remove('is-idle');
    if (!player.video.paused) armIdleTimer();
    return;
  }
  gesture.lastTapAt = now;
  gesture.lastTapX = x;
  gesture.lastTapY = y;
  clearTimeout(gesture.tapTimer);
  // 延迟 240ms 再执行单击，给双击留出判定窗口
  gesture.tapTimer = setTimeout(() => {
    gesture.tapTimer = 0;
    const idle = player.el.classList.toggle('is-idle');
    if (!idle && !player.video.paused) armIdleTimer();
  }, 240);
}

function onGestureDown(event) {
  if (player.el.hidden) return;
  if (event.target.closest('.player-top, .player-bottom, .sheet')) return;
  const point = gesturePoint(event);
  const rect = player.el.getBoundingClientRect();
  gesture.active = true;
  gesture.mode = null;
  gesture.moved = false;
  gesture.seeking = false;
  gesture.sx = point.x;
  gesture.sy = point.y;
  gesture.st = performance.now();
  gesture.rect = rect;
  // 右侧 1/5 为切集热区，其余区域横向滑动拖进度
  gesture.zone = point.x - rect.left > rect.width * 0.8 ? 'episode' : 'seek';
  const duration = player.video.duration;
  gesture.startTime = Number.isFinite(duration) && duration > 0 ? player.video.currentTime : 0;
  gesture.startRatio = Number.isFinite(duration) && duration > 0 ? gesture.startTime / duration : 0;
  gesture.ratio = gesture.startRatio;
  gesture.episodeTarget = null;
}

function onGestureMove(event) {
  if (!gesture.active) return;
  const point = gesturePoint(event);
  const dx = point.x - gesture.sx;
  const dy = point.y - gesture.sy;

  if (!gesture.mode) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    gesture.moved = true;
    if (gesture.zone === 'episode') {
      if (Math.abs(dy) <= Math.abs(dx)) {
        gesture.mode = 'none'; // 右侧区域只认上下滑动
        return;
      }
      gesture.mode = 'episode';
    } else {
      if (Math.abs(dx) <= Math.abs(dy)) {
        gesture.mode = 'none';
        return;
      }
      gesture.mode = 'seek';
      gesture.seeking = true;
      player.seek.classList.add('is-dragging');
    }
    player.el.classList.remove('is-idle');
    clearTimeout(player.idleTimer);
  }

  if (gesture.mode === 'seek') {
    const duration = player.video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const span = gesture.rect.width * 0.92;
    const ratio = Math.max(0, Math.min(1, gesture.startRatio + dx / span));
    gesture.ratio = ratio;
    const target = ratio * duration;
    paintSeek(ratio);
    paintTimes(target);
    const delta = Math.round(target - gesture.startTime);
    const sign = delta >= 0 ? '+' : '−';
    showHud(formatTime(target), `${sign}${Math.abs(delta)} 秒 · 共 ${formatTime(duration)}`, ratio);
  } else if (gesture.mode === 'episode') {
    paintEpisodeHud(dy);
  }

  if (event.cancelable) event.preventDefault();
}

// 右侧上下滑动切集：上滑下一集、下滑上一集，滑过阈值后松手生效
function paintEpisodeHud(dy) {
  const step = dy < 0 ? 1 : -1;
  const charge = Math.min(1, Math.abs(dy) / EPISODE_PX);
  const name = step > 0 ? '下一集' : '上一集';
  const target = player.series && player.episode ? findEpisodeByStep(player.series, player.episode, step) : null;

  if (!target) {
    gesture.episodeTarget = null;
    showHud(name, step > 0 ? '已经是最后一集' : '已经是第一集', 0);
    return;
  }
  gesture.episodeTarget = charge >= 1 ? target : null;
  const total = player.series.total || player.series.episodes.length;
  showHud(name, `第 ${target.index} 集 / 共 ${total} 集 · ${charge >= 1 ? '松手切换' : '继续滑动'}`, charge);
}

function onGestureUp(event) {
  if (!gesture.active) return;
  gesture.active = false;
  const mode = gesture.mode;
  const elapsed = performance.now() - gesture.st;
  const point = gesturePoint(event);
  gesture.mode = null;
  player.seek.classList.remove('is-dragging');

  if (mode === 'seek') {
    gesture.seeking = false;
    commitSeek(gesture.ratio);
    paintTimes();
    fadeHud(600);
    if (!player.video.paused) armIdleTimer(2400);
    return;
  }
  if (mode === 'episode') {
    gesture.seeking = false;
    const target = gesture.episodeTarget;
    gesture.episodeTarget = null;
    fadeHud(280);
    if (target) {
      startPlayback(player.series, target);
      return;
    }
    if (!player.video.paused) armIdleTimer(1400);
    return;
  }
  gesture.seeking = false;
  // 位移未超阈值且未长按 -> 视为点击
  if (!gesture.moved && elapsed < 480) handleTap(point.x, point.y);
}

const gestureLayer = $('#gesture-layer');
gestureLayer.addEventListener(EV.down, onGestureDown, { passive: true });
gestureLayer.addEventListener(EV.move, onGestureMove, { passive: false });
gestureLayer.addEventListener(EV.up, onGestureUp);
gestureLayer.addEventListener(EV.cancel, () => {
  gesture.active = false;
  gesture.seeking = false;
  gesture.mode = null;
  player.seek.classList.remove('is-dragging');
  fadeHud(400);
  if (!player.video.paused) armIdleTimer(2000);
});

player.video.addEventListener('timeupdate', () => {
  if (!player.dragging && !gesture.seeking) {
    const duration = player.video.duration;
    paintSeek(Number.isFinite(duration) && duration > 0 ? player.video.currentTime / duration : 0);
    paintTimes(player.video.currentTime);
  }
  clearTimeout(player.saveTimer);
  player.saveTimer = setTimeout(saveProgress, 4000);
});

for (const name of ['loadedmetadata', 'durationchange', 'progress', 'seeked', 'emptied']) {
  player.video.addEventListener(name, () => {
    paintBuffer();
    if (!player.dragging && !gesture.seeking) paintTimes();
  });
}

// 起播后 3 秒内自动隐藏控件，避免挡住画面；轻点画面即可再次呼出
player.video.addEventListener('playing', () => armIdleTimer());

player.video.addEventListener('play', () => {
  syncToggleIcon();
  player.el.classList.remove('is-idle');
});
player.video.addEventListener('pause', () => {
  syncToggleIcon();
  clearTimeout(player.idleTimer);
  player.el.classList.remove('is-idle');
});

player.video.addEventListener('ended', () => {
  saveProgress();
  const next = player.series && player.episode ? findEpisodeByStep(player.series, player.episode, 1) : null;
  if (next) {
    toast(`自动播放第 ${next.index} 集`);
    startPlayback(player.series, next);
  } else {
    toast('已经是最后一集了');
  }
});

$('#player-back').addEventListener('click', closePlayer);
$('#player-list').addEventListener('click', () => {
  player.sheet.hidden = !player.sheet.hidden;
  player.el.classList.remove('is-idle');
});
$('#player-prev').addEventListener('click', () => {
  const prev = findEpisodeByStep(player.series, player.episode, -1);
  if (prev) startPlayback(player.series, prev);
  else toast('已经是第一集了');
});
$('#player-next').addEventListener('click', () => {
  const next = findEpisodeByStep(player.series, player.episode, 1);
  if (next) startPlayback(player.series, next);
  else toast('已经是最后一集了');
});
$('#player-toggle').addEventListener('click', (event) => {
  event.stopPropagation();
  togglePlay();
});
/* ---------- 倍速 ---------- */

// 换源（load）时浏览器会把 playbackRate 重置为 defaultPlaybackRate，
// 两个值一起设、并在每次元数据就绪后再同步一次，倍速才能跨集保持。
function applySpeed() {
  const speed = player.speeds[player.speedIndex];
  player.video.defaultPlaybackRate = speed;
  player.video.playbackRate = speed;
  const button = $('#player-speed');
  if (button) button.textContent = `${speed.toFixed(speed % 1 ? 2 : 1)}×`;
}

player.video.addEventListener('loadedmetadata', applySpeed);
player.video.addEventListener('play', applySpeed);

$('#player-speed').addEventListener('click', (event) => {
  event.stopPropagation();
  player.speedIndex = (player.speedIndex + 1) % player.speeds.length;
  applySpeed();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !player.el.hidden) saveProgress();
});

/* ---------------- 启动 ---------------- */

if (!location.hash) location.hash = '#/home';
router();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 非 https 环境注册失败不影响使用 */ });
  });
}
