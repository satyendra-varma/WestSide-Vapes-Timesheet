// Generates the PWA icons (public/icons/*.png) without any image library: a dark tile with an emerald
// disc and a lightning bolt, rendered with 4x4 supersampling. Run: npx tsx scripts/make-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

type RGB = [number, number, number];
const BG: RGB = [9, 13, 22]; // #090d16, the app background
const DISC: RGB = [16, 185, 129]; // emerald-500
const BOLT: RGB = [9, 13, 22];

// Lightning bolt polygon in unit coordinates (0..1), drawn inside the disc.
const BOLT_POLY: Array<[number, number]> = [
  [0.56, 0.2], [0.33, 0.55], [0.48, 0.55], [0.42, 0.8], [0.67, 0.43], [0.52, 0.43],
];

function insidePolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Colour at a point in unit space. `safe` shrinks the artwork for maskable icons (safe zone). */
function colourAt(x: number, y: number, safe: number): RGB {
  const cx = (x - 0.5) / safe + 0.5;
  const cy = (y - 0.5) / safe + 0.5;
  const r = Math.hypot(cx - 0.5, cy - 0.5);
  if (r > 0.42) return BG;
  return insidePolygon(cx, cy, BOLT_POLY) ? BOLT : DISC;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function renderPng(size: number, safe = 1): Buffer {
  const SS = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colourAt((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, safe);
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      raw[o] = Math.round(acc[0] / (SS * SS));
      raw[o + 1] = Math.round(acc[1] / (SS * SS));
      raw[o + 2] = Math.round(acc[2] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  mkdirSync(OUT, { recursive: true });
  const files: Array<[string, number, number]> = [
    ['icon-192.png', 192, 1],
    ['icon-512.png', 512, 1],
    ['icon-maskable-512.png', 512, 0.8],
    ['apple-touch-icon.png', 180, 1],
  ];
  for (const [name, size, safe] of files) {
    writeFileSync(join(OUT, name), renderPng(size, safe));
    console.log(`Wrote public/icons/${name}`);
  }
}
