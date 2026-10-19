// Generates icons/icon{16,48,128}.png (blue rounded square + white funnel). Run: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function inside(x, y) {
  // x, y in [0,1]. Rounded square background.
  const r = 0.2, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  // Funnel: trapezoid 0.25..0.55 narrowing from 0.64 to 0.16 wide, then stem to 0.8.
  let half = 0;
  if (y >= 0.25 && y <= 0.55) half = 0.32 - (0.24 * (y - 0.25)) / 0.3;
  else if (y > 0.55 && y <= 0.8) half = 0.08;
  return Math.abs(x - 0.5) <= half ? 'fg' : 'bg';
}

function png(size) {
  const ss = 4, rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0
    for (let x = 0; x < size; x++) {
      let a = 0, white = 0;
      for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
        const hit = inside((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size);
        if (hit) a++;
        if (hit === 'fg') white++;
      }
      const t = a ? white / a : 0;
      row.set([Math.round(0x00 + t * 255), Math.round(0xa8 + t * (255 - 0xa8)), Math.round(0xe1 + t * (255 - 0xe1)), Math.round((a / ss / ss) * 255)], 1 + x * 4);
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(__dirname, '..', 'icons', `icon${size}.png`), png(size));
}
