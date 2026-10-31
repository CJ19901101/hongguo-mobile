// 生成 iOS 应用图标（1024×1024、全出血、不透明）。iOS 会自动裁圆角，所以这里不加圆角。
// 用法：node scripts/make-ios-icon.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'ios', 'HongguoDrama', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png');

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

function encodePng(width, height, rgb) {
  // 用 RGB（颜色类型 2）编码，避免图标带 alpha 通道
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;

function render(size) {
  const rgb = Buffer.alloc(size * size * 3);
  const cx = size / 2;
  const cy = size / 2;
  const glyph = size * 0.30; // 三角外接尺寸，留足 iOS 圆角安全边

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      // 斜向渐变：橙红 → 洋红
      const t = Math.min(1, Math.max(0, (x / size) * 0.45 + (y / size) * 0.55));
      let r = mix(255, 232, t);
      let g = mix(86, 32, t);
      let b = mix(58, 122, t);
      // 左上高光
      const glow = Math.max(0, 1 - Math.hypot(x - size * 0.24, y - size * 0.2) / (size * 0.7));
      r = Math.min(255, r + glow * 34);
      g = Math.min(255, g + glow * 46);
      b = Math.min(255, b + glow * 60);

      // 播放三角：左边缘 x=-0.5，尖端 x=0.72
      const px = (x - cx) / glyph;
      const py = (y - cy) / glyph;
      if (px >= -0.5 && px <= 0.72) {
        const half = 0.62 * (0.72 - px) / 1.22;
        if (Math.abs(py) <= half) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      rgb[i] = Math.round(r);
      rgb[i + 1] = Math.round(g);
      rgb[i + 2] = Math.round(b);
    }
  }
  return encodePng(size, size, rgb);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, render(1024));
console.log(`生成 ${path.relative(path.join(__dirname, '..'), OUT)} (1024×1024)`);
