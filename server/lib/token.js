// 媒体访问令牌：客户端不直接接触上游地址，避免被当成开放代理（SSRF）。
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SECRET_FILE = path.join(__dirname, '..', '..', '.cache', 'secret.key');

function loadSecret() {
  if (process.env.HGM_SECRET) return process.env.HGM_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (_) {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

const SECRET = loadSecret();
const TTL_MS = 6 * 60 * 60 * 1000;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const mac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest().subarray(0, 16);

function sign(payload) {
  const body = b64u(JSON.stringify({ ...payload, e: Date.now() + TTL_MS }));
  return `${body}.${b64u(mac(body))}`;
}

function verify(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = mac(body);
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expect.length || !crypto.timingSafeEqual(actual, expect)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Number(payload.e) < Date.now()) return null;
  return payload;
}

module.exports = { sign, verify };
