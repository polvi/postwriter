// Generates assets/icon.png (96x96, black envelope-with-arrow on white) with
// no image library: raw RGBA rows, zlib via Bun, hand-built PNG chunks.
import { deflateSync } from 'bun';

const W = 96;
const H = 96;
const px = new Uint8Array(W * H * 4).fill(255);
const set = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = 0;
  px[i + 1] = 0;
  px[i + 2] = 0;
};
const rect = (x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y);
};
// Envelope outline (thick), flap, and a downward arrow into it.
const t = 5;
rect(14, 30, 82, 30 + t); // top
rect(14, 82 - t, 82, 82); // bottom
rect(14, 30, 14 + t, 82); // left
rect(82 - t, 30, 82, 82); // right
for (let i = 0; i <= 34; i++) {
  for (let k = 0; k < t; k++) {
    set(14 + i, 30 + i + k); // flap left
    set(82 - i, 30 + i + k); // flap right
  }
}
// Arrow: shaft from y=6 to y=44 through the flap's centre, head at the bottom.
rect(48 - 3, 6, 48 + 3, 44);
for (let i = 0; i < 12; i++) rect(48 - 12 + i, 36 + i, 48 + 12 - i, 36 + i + 1);

const raw = new Uint8Array((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0; // filter: none
  raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (W * 4 + 1) + 1);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const chunk = (type: string, data: Uint8Array) => {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  return [be32(data.length), body, be32(crc32(body))];
};
const ihdr = new Uint8Array(13);
ihdr.set(be32(W), 0);
ihdr.set(be32(H), 4);
ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
const parts = [
  new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  ...chunk('IHDR', ihdr),
  ...chunk('IDAT', deflateSync(raw)),
  ...chunk('IEND', new Uint8Array(0)),
];
const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
let o = 0;
for (const p of parts) {
  out.set(p, o);
  o += p.length;
}
await Bun.write(new URL('../assets/icon.png', import.meta.url), out);
console.log('wrote assets/icon.png');
