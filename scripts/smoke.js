const path = require('path');
const N = p => require(path.join(__dirname, '..', 'server/vendor/native', p));

(async () => {
  const { searchHongguo } = N('hongguo-search');
  const hongguo = N('hongguo');

  console.log('--- 搜索 ---');
  const r = await searchHongguo('总裁', { fuzzy: true });
  console.log('success:', r.success, 'count:', r.results?.length, 'error:', r.error || '-');
  if (!r.results?.length) return;
  const first = r.results[0];
  console.log('首条:', JSON.stringify(first).slice(0, 300));

  console.log('--- 分集 ---');
  const data = await hongguo.fetchEpisodeList(String(first.series_id));
  console.log('keys:', Object.keys(data).join(','));
  const eps = data.episodes || data.video_list || [];
  console.log('集数:', eps.length, '首集:', JSON.stringify(eps[0]).slice(0, 300));

  console.log('--- 播放直链 ---');
  const ep = eps[0];
  const vid = String(ep.vid || ep.video_id || ep.id);
  const play = await hongguo.fetchPlayUrlSingle(vid, String(first.series_id));
  console.log('url:', String(play.url).slice(0, 120));
  console.log('spadeA:', play.spadeA ? `yes(${play.spadeA.length})` : 'no', 'codec:', play.codec, 'error:', play.error || '-');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
