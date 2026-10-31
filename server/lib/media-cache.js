// 解密后视频的磁盘缓存：按总容量做 LRU 淘汰，同一集并发请求只解密一次。
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = process.env.HGM_CACHE_DIR || path.join(__dirname, '..', '..', '.cache', 'media');
const LIMIT_BYTES = Math.max(256, Number(process.env.HGM_CACHE_MB) || 3072) * 1024 * 1024;
const inflight = new Map();

fs.mkdirSync(DIR, { recursive: true });

const fileOf = (key) => path.join(DIR, `${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}.mp4`);

async function evictIfNeeded(extraBytes, keepPath) {
  let entries = [];
  for (const name of await fsp.readdir(DIR)) {
    if (!name.endsWith('.mp4')) continue;
    const full = path.join(DIR, name);
    try {
      const stat = await fsp.stat(full);
      entries.push({ full, size: stat.size, at: stat.atimeMs });
    } catch (_) { /* 已被并发删掉 */ }
  }
  let total = entries.reduce((sum, item) => sum + item.size, 0);
  if (total + extraBytes <= LIMIT_BYTES) return;
  entries.sort((a, b) => a.at - b.at);
  for (const item of entries) {
    if (total + extraBytes <= LIMIT_BYTES) break;
    if (item.full === keepPath) continue;
    try {
      await fsp.unlink(item.full);
      total -= item.size;
    } catch (_) { /* ignore */ }
  }
}

// 只有解密成功的完整文件才会落盘：先写 .part 再原子改名，避免半截文件被当成缓存。
async function ensure(key, producer) {
  const target = fileOf(key);
  try {
    const stat = await fsp.stat(target);
    if (stat.size > 0) {
      const now = new Date();
      await fsp.utimes(target, now, now).catch(() => {});
      return target;
    }
  } catch (_) { /* 未命中 */ }

  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    const buffer = await producer();
    const part = `${target}.${process.pid}.part`;
    await fsp.writeFile(part, buffer);
    await fsp.rename(part, target);
    await evictIfNeeded(buffer.length, target);
    return target;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

module.exports = { ensure, DIR };
