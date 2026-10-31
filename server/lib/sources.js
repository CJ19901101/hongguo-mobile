// 片源统一门面：把三个来源的差异收敛成同一套字段，供 HTTP 层直接使用。
const hongguo = require('../vendor/native/hongguo');
const catalog = require('../vendor/native/catalog');
const { searchHongguo } = require('../vendor/native/hongguo-search');
const xifan = require('../vendor/native/xifan');
const hema = require('../vendor/native/hema');

const SOURCES = ['hongguo', 'xifan', 'hema'];

function sourceOf(id) {
  const value = String(id || '');
  if (value.startsWith('xifan:')) return 'xifan';
  if (value.startsWith('hema:')) return 'hema';
  return 'hongguo';
}

function pick(item, source) {
  if (!item?.series_id || !item?.series_title) return null;
  return {
    id: String(item.series_id),
    title: String(item.series_title),
    cover: item.cover || '',
    episodeCount: Number(item.episode_count) || 0,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 4) : [],
    description: item.description || '',
    source: item.source || source,
  };
}

async function searchOne(source, keyword, page) {
  if (source === 'xifan') {
    const result = await xifan.search(keyword, page);
    if (!result?.success) throw new Error(result?.error || '西饭搜索失败');
    return { results: (result.results || []).map((item) => pick(item, 'xifan')).filter(Boolean), hasMore: result.hasMore === true };
  }
  if (source === 'hema') {
    const result = await hema.search(keyword, page);
    if (!result?.success) throw new Error(result?.error || '河马搜索失败');
    return { results: (result.results || []).map((item) => pick(item, 'hema')).filter(Boolean), hasMore: result.hasMore === true };
  }
  const result = await searchHongguo(keyword, { page });
  return { results: (result.results || []).map((item) => pick(item, 'hongguo')).filter(Boolean), hasMore: result.hasMore === true };
}

async function search({ keyword, source = 'all', page = 1 }) {
  const kw = String(keyword || '').trim();
  if (!kw) throw new Error('请输入搜索词');
  if (kw.length > 200) throw new Error('搜索词过长');
  const targets = source === 'all' ? SOURCES : [source];
  if (!targets.every((name) => SOURCES.includes(name))) throw new Error('未知来源');

  const settled = await Promise.allSettled(targets.map((name) => searchOne(name, kw, page)));
  const results = [];
  const errors = [];
  const seen = new Set();
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      for (const item of outcome.value.results) {
        const dedupe = `${item.source}:${item.id}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        results.push(item);
      }
    } else {
      errors.push(`${targets[index]}：${outcome.reason?.message || '搜索失败'}`);
    }
  });
  // 红果结果默认靠前：剧集信息最完整，也最可能有解密源。
  const order = { hongguo: 0, xifan: 1, hema: 2 };
  results.sort((a, b) => (order[a.source] ?? 9) - (order[b.source] ?? 9));
  return { results, partial: errors.length > 0, error: errors.join('；') };
}

async function series(id) {
  const value = String(id || '').trim();
  if (!value) throw new Error('缺少剧集编号');
  const data = await hongguo.fetchEpisodeList(value);
  const episodes = (data.episodes || []).map((episode) => ({
    vid: String(episode.vid),
    index: Number(episode.vid_index) || 0,
    title: episode.title || '',
    locked: episode.locked === true,
    web: episode.web_available === true,
  }));
  if (!episodes.length) throw new Error('该剧暂无可播放分集');
  return {
    id: String(data.series_id || value),
    title: data.series_title || '未命名短剧',
    cover: data.cover || '',
    total: Number(data.total) || episodes.length,
    source: data.source || sourceOf(value),
    episodes,
  };
}

function keyFromPlay(play) {
  if (play?.contentKey) {
    const key = Buffer.from(String(play.contentKey), 'hex');
    return key.length === 16 ? key : null;
  }
  if (play?.spadeA) return hongguo.deriveKey(play.spadeA);
  return null;
}

async function play(vid, sid, quality = 'auto') {
  const result = await hongguo.fetchPlayUrlSingle(String(vid), String(sid || ''), { quality });
  if (!result?.url) {
    const error = new Error(result?.error || '暂未取得有效片源');
    error.locked = result?.locked === true;
    throw error;
  }
  return {
    url: result.url,
    key: keyFromPlay(result),
    codec: result.codec || '',
    quality: result.quality || '',
    userAgent: result.userAgent || hongguo.UA,
    source: result.source || sourceOf(vid),
  };
}

async function browse(category, page = 1) {
  const result = await catalog.browseList({ category, page });
  if (!result?.success) throw new Error(result?.error || '目录加载失败');
  return {
    results: (result.results || []).map((item) => pick(item, 'hongguo')).filter(Boolean),
    hasMore: (result.page || page) < (result.totalPages || 0),
    page: result.page || page,
  };
}

module.exports = { SOURCES, search, series, play, browse, sourceOf };
