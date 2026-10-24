// 生成透明底托盘图标 assets/tray.png (16x16) 与 assets/tray@2x.png (32x32)。
// 纯 node:zlib 实现 PNG 编码，无外部依赖。图案：蓝底圆点 + 白色对勾，背景全透明。
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(here, "..", "assets");
fs.mkdirSync(assetsDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function drawCircle(size) {
  const rgba = Buffer.alloc(size * size * 4, 0); // 全透明
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.44;
  const rInner = size * 0.30;
  const tick = [
    [0.32, 0.52],
    [0.45, 0.65],
    [0.70, 0.36],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const o = (y * size + x) * 4;
      if (d <= rOuter && d > rInner) {
        rgba[o] = 0x25;
        rgba[o + 1] = 0x63;
        rgba[o + 2] = 0xeb;
        rgba[o + 3] = 255;
      } else if (d <= rInner) {
        rgba[o] = 0x25;
        rgba[o + 1] = 0x63;
        rgba[o + 2] = 0xeb;
        rgba[o + 3] = 255;
      }
    }
  }
  // 对勾（白）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / size;
      const py = y / size;
      const onSeg1 = Math.abs(py - (0.52 + (px - 0.32) * 1.0)) < 0.045 && px >= 0.30 && px <= 0.46;
      const onSeg2 = Math.abs(py - (0.65 - (px - 0.46) * 0.9)) < 0.045 && px > 0.44 && px <= 0.72;
      if (onSeg1 || onSeg2) {
        const o = (y * size + x) * 4;
        rgba[o] = 255;
        rgba[o + 1] = 255;
        rgba[o + 2] = 255;
        rgba[o + 3] = 255;
      }
    }
  }
  return rgba;
}

fs.writeFileSync(path.join(assetsDir, "tray.png"), encodePng(16, 16, drawCircle(16)));
fs.writeFileSync(path.join(assetsDir, "tray@2x.png"), encodePng(32, 32, drawCircle(32)));
// electron-builder 打包图标（≥256x256 PNG）
fs.writeFileSync(path.join(assetsDir, "icon.png"), encodePng(256, 256, drawCircle(256)));
console.log("[gen-tray-icon] tray.png / tray@2x.png / icon.png 已生成（透明底）");
