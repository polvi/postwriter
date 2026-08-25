// Rasterises assets/icon.svg to assets/icon.png (transparent background,
// black glyph) at the sizes the host's drawable folders expect.
import { Resvg } from '@resvg/resvg-js';

const svg = await Bun.file(new URL('../assets/icon.svg', import.meta.url)).text();
const size = Number(process.argv[2] ?? 96);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
const out = new URL(`../assets/icon${size === 96 ? '' : `-${size}`}.png`, import.meta.url);
await Bun.write(out, png);
console.log(`wrote ${out.pathname} (${size}px, ${png.length} bytes)`);
