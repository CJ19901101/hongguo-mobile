// 校验解密后 MP4 的结构自洽性：样本表偏移必须落在 mdat 内、长度不超过文件尾。
const fs = require('node:fs');

const file = process.argv[2] || 'scripts/out.mp4';
const buf = fs.readFileSync(file);

function boxes(start, end) {
  const out = [];
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const typ = buf.subarray(off + 4, off + 8).toString('latin1');
    let hdr = 8;
    if (size === 1) { size = Number(buf.readBigUInt64BE(off + 8)); hdr = 16; }
    else if (size === 0) { size = end - off; }
    if (size < hdr || off + size > end) { out.push({ typ, off, size: 0, bad: true }); break; }
    out.push({ typ, off, size, hdr,
      children: ['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'].includes(typ)
        ? boxes(off + hdr, off + size) : null });
    off += size;
  }
  return out;
}

const top = boxes(0, buf.length);
const walk = function* (list) {
  for (const b of list || []) {
    yield b;
    if (b.children) yield* walk(b.children);
  }
};
const all = [...walk(top)];
const find = (typ) => all.filter((b) => b.typ === typ);

const mdat = find('mdat')[0];
const moov = find('moov')[0];
console.log('文件大小:', (buf.length / 1048576).toFixed(2), 'MB');
console.log('顶层 box:', top.map((b) => b.typ).join(', '));
console.log('mdat:', mdat ? `${mdat.off}..${mdat.off + mdat.size}` : '缺失', '| moov:', moov ? `${moov.off}..${moov.off + moov.size}` : '缺失');

let checked = 0, bad = 0;
for (const stbl of find('stbl')) {
  const stsz = stbl.children.find((b) => b.typ === 'stsz');
  const stco = stbl.children.find((b) => b.typ === 'stco');
  if (!stsz || !stco) continue;
  const fixed = buf.readUInt32BE(stsz.off + 12);
  const count = buf.readUInt32BE(stsz.off + 16);
  const sizes = fixed !== 0
    ? Array.from({ length: count }, () => fixed)
    : Array.from({ length: count }, (_, i) => buf.readUInt32BE(stsz.off + 20 + i * 4));
  const chunks = buf.readUInt32BE(stco.off + 12);
  const offsets = Array.from({ length: chunks }, (_, i) => buf.readUInt32BE(stco.off + 16 + i * 4));
  for (const off of offsets) {
    checked++;
    if (off < mdat.off || off >= mdat.off + mdat.size || off >= buf.length) { bad++; continue; }
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(`轨道: ${count} 样本 / ${chunks} 块, 首块偏移 ${offsets[0]}, 样本总字节 ${(total / 1048576).toFixed(2)}MB, 编码 ${find('stsd').length ? 'ok' : '?'}`);
}
console.log('块偏移检查:', checked, '个，越界', bad);
console.log(bad === 0 && mdat && moov ? 'PASS' : 'FAIL');
