// 生成 PWA 图标：渐变底 + 播放三角，无第三方依赖（手写 PNG 编码）。
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;

function render(size, { maskable = false } = {}) {
  const buffer = Buffer.alloc(size * size * 4);
  const radius = maskable ? size / 2 : size * 0.22;
  const glyphScale = maskable ? 0.34 : 0.42;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // 圆角矩形遮罩
      const dx = Math.max(radius - x, x - (size - radius), 0);
      const dy = Math.max(radius - y, y - (size - radius), 0);
      const outside = Math.hypot(dx, dy) > radius;
      const t = (x / size) * 0.5 + (y / size) * 0.5;
      let r = mix(255, 255, t);
      let g = mix(59, 122, t);
      let b = mix(92, 69, t);
      // 左上角高光
      const glow = Math.max(0, 1 - Math.hypot(x - size * 0.22, y - size * 0.18) / (size * 0.62));
      r = Math.min(255, r + glow * 40);
      g = Math.min(255, g + glow * 52);
      b = Math.min(255, b + glow * 40);

      // 播放三角：顶点 (-0.5,±0.62) → 尖端 (0.7,0)
      const px = (x - cx) / (size * glyphScale);
      const py = (y - cy) / (size * glyphScale);
      if (px >= -0.5 && px <= 0.7) {
        const half = 0.62 * (0.7 - px) / 1.2;
        if (Math.abs(py) <= half) { r = 255; g = 255; b = 255; }
      }

      const alpha = outside ? 0 : 255;
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = alpha;
    }
  }
  return encodePng(size, size, buffer);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), render(size, { maskable: size === 512 }));
  console.log(`生成 icons/icon-${size}.png`);
}
