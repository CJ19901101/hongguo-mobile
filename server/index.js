const path = require('node:path');
const express = require('express');
const axios = require('axios');

const sources = require('./lib/sources');
const token = require('./lib/token');
const mediaCache = require('./lib/media-cache');
const hongguo = require('./vendor/native/hongguo');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const REFERER = hongguo.VIDEO_REFERER;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const wrap = (handler) => (req, res) => {
  Promise.resolve(handler(req, res)).catch((error) => {
    if (res.headersSent) return;
    res.status(error?.status || 400).json({ ok: false, error: error?.message || '请求失败', locked: error?.locked === true });
  });
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), node: process.version });
});

app.get('/api/search', wrap(async (req, res) => {
  const keyword = String(req.query.q || '').trim();
  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  const source = String(req.query.source || 'all');
  const data = await sources.search({ keyword, source, page });
  res.json({ ok: true, ...data, page });
}));

app.get('/api/series', wrap(async (req, res) => {
  res.json({ ok: true, series: await sources.series(req.query.id) });
}));

app.get('/api/browse', wrap(async (req, res) => {
  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  res.json({ ok: true, ...(await sources.browse(String(req.query.category || 'hot-drama'), page)) });
}));

// 只下发签名后的本站地址，客户端拿不到上游直链，也就无法把服务当开放代理用。
app.get('/api/play', wrap(async (req, res) => {
  const vid = String(req.query.vid || '');
  const sid = String(req.query.sid || '');
  if (!vid) throw new Error('缺少分集编号');
  const quality = ['auto', '1080p', '720p'].includes(String(req.query.quality)) ? String(req.query.quality) : 'auto';
  const info = await sources.play(vid, sid, quality);
  const payload = info.key
    ? { t: 'e', v: vid, s: sid, q: quality }
    : { t: 'p', u: info.url, ua: info.userAgent };
  res.json({
    ok: true,
    playUrl: `/media/${token.sign(payload)}`,
    codec: info.codec,
    quality: info.quality,
    encrypted: Boolean(info.key),
    source: info.source,
  });
}));

function pipeUpstream(req, res, target, userAgent) {
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  const headers = { Referer: REFERER, Accept: '*/*', 'Accept-Encoding': 'identity' };
  if (userAgent) headers['User-Agent'] = userAgent;
  if (req.headers.range) headers.Range = req.headers.range;

  return axios({
    url: target,
    method: 'GET',
    responseType: 'stream',
    headers,
    timeout: 45000,
    signal: controller.signal,
    validateStatus: () => true,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  }).then((upstream) => {
    const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
    for (const name of pass) {
      if (upstream.headers[name]) res.setHeader(name, upstream.headers[name]);
    }
    if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(upstream.status === 206 ? 206 : upstream.status === 200 ? 200 : upstream.status);
    if (req.method === 'HEAD') {
      upstream.data.destroy();
      return res.end();
    }
    upstream.data.on('error', () => res.destroy());
    upstream.data.pipe(res);
  });
}

// 解密一集并落盘，返回本地文件路径。多个请求命中同一集时由 mediaCache 合并成一次任务。
async function prepareMedia(payload) {
  const cacheKey = `${payload.v}|${payload.s}|${payload.q || 'auto'}`;
  return mediaCache.ensure(cacheKey, async () => {
    const info = await sources.play(payload.v, payload.s, payload.q || 'auto').catch((error) => {
      throw Object.assign(new Error(error.message), { status: 502 });
    });
    if (!info.key) throw Object.assign(new Error('该集无需解密，请刷新重试'), { status: 409 });
    const upstream = await axios.get(info.url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': info.userAgent, Referer: REFERER, 'Accept-Encoding': 'identity' },
      timeout: 120000,
      maxContentLength: 512 * 1024 * 1024,
      maxBodyLength: 1024,
    });
    return hongguo.decryptMp4Buffer(Buffer.from(upstream.data), info.key);
  });
}

// 预解密下一集：客户端在播放时后台调用，切集时直接命中缓存
app.all('/api/warm', wrap(async (req, res) => {
  const vid = String(req.query.vid || req.body?.vid || '');
  const sid = String(req.query.sid || req.body?.sid || '');
  const quality = ['auto', '1080p', '720p'].includes(String(req.query.quality)) ? String(req.query.quality) : 'auto';
  if (!vid) throw new Error('缺少分集编号');
  const startedAt = Date.now();
  const file = await prepareMedia({ t: 'e', v: vid, s: sid, q: quality });
  const stat = await require('node:fs/promises').stat(file).catch(() => ({ size: 0 }));
  res.json({ ok: true, ready: true, bytes: stat.size, ms: Date.now() - startedAt });
}));

app.get('/media/:token', wrap(async (req, res) => {
  const payload = token.verify(req.params.token);
  if (!payload) throw Object.assign(new Error('播放地址已失效，请重新打开'), { status: 403 });

  if (payload.t === 'p') {
    if (!/^https?:\/\//i.test(String(payload.u || ''))) throw Object.assign(new Error('播放地址无效'), { status: 403 });
    return pipeUpstream(req, res, payload.u, payload.ua);
  }

  if (payload.t !== 'e') throw Object.assign(new Error('播放地址无效'), { status: 403 });

  const file = await prepareMedia(payload);

  res.sendFile(file, {
    headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=21600' },
    acceptRanges: true,
    lastModified: true,
  }, (error) => {
    if (error && !res.headersSent) res.status(500).end();
  });
}));

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    if (filePath.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
  },
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((req, res) => res.status(404).json({ ok: false, error: '接口不存在' }));

const server = app.listen(PORT, HOST, () => {
  const urls = Object.values(require('node:os').networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
  console.log(`红果短剧移动版已启动  http://localhost:${PORT}`);
  for (const url of urls) console.log(`手机同一 Wi-Fi 可访问  ${url}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
