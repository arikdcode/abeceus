/** Paint ground tiles, write the atlas, then rebuild the ground yard from GROUNDS.
 *  Downstream: content/textures/ground/atlas.*, web/gpu/ground-tiles.js, ground_yard.
 *  Run via: node scripts/rebuild-tex.mjs ground
 */
import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const TILE = 512;
const COLS = 8;
const REPEAT = 0.45;

const GROUNDS = [
  { id: "dirt", name: "Packed dirt", kind: "natural" },
  { id: "dirt_dry", name: "Dry dirt", kind: "natural" },
  { id: "dirt_red", name: "Red earth", kind: "natural" },
  { id: "mud", name: "Wet mud", kind: "natural" },
  { id: "clay", name: "Clay", kind: "natural" },
  { id: "cracked", name: "Cracked earth", kind: "natural" },
  { id: "sand", name: "Sand", kind: "natural" },
  { id: "ash", name: "Ash", kind: "natural" },
  { id: "grass", name: "Grass", kind: "natural" },
  { id: "grass_dry", name: "Dry grass", kind: "natural" },
  { id: "moss", name: "Moss", kind: "natural" },
  { id: "leaf", name: "Leaf litter", kind: "natural" },
  { id: "gravel", name: "Gravel", kind: "natural" },
  { id: "pebbles", name: "Pebbles", kind: "natural" },
  { id: "rock", name: "Bedrock", kind: "natural" },
  { id: "snow", name: "Packed snow", kind: "natural" },
  { id: "concrete", name: "Concrete", kind: "built" },
  { id: "concrete_worn", name: "Worn concrete", kind: "built" },
  { id: "asphalt", name: "Asphalt", kind: "built" },
  { id: "tarmac", name: "Tarmac", kind: "built" },
  { id: "brick", name: "Brick pavers", kind: "built" },
  { id: "cobble", name: "Cobblestone", kind: "built" },
  { id: "wood", name: "Wood deck", kind: "built" },
  { id: "wood_worn", name: "Worn wood", kind: "built" },
  { id: "metal", name: "Deck plate", kind: "sci-fi" },
  { id: "rust", name: "Rusted plate", kind: "sci-fi" },
  { id: "tread", name: "Tread plate", kind: "sci-fi" },
  { id: "hex", name: "Hex tile", kind: "sci-fi" },
  { id: "polymer", name: "Polymer floor", kind: "sci-fi" },
  { id: "carbon", name: "Carbon weave", kind: "sci-fi" },
  { id: "grate", name: "Metal grate", kind: "sci-fi" },
  { id: "hazard", name: "Hazard deck", kind: "sci-fi" },
];

function hash(x, y, s = 0) {
  let n = Math.imul(x + s * 17, 374761393) + Math.imul(y + s * 31, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, y, scale, seed) {
  const xs = x * scale;
  const ys = y * scale;
  const x0 = Math.floor(xs);
  const y0 = Math.floor(ys);
  const fx = xs - x0;
  const fy = ys - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, scale, seed, oct = 5) {
  let sum = 0;
  let amp = 0.5;
  let sc = scale;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x, y, sc, seed + i * 19) * amp;
    sc *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

function clamp(v, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function rgb(r, g, b) {
  return [clamp(r), clamp(g), clamp(b)];
}

function paint(fn) {
  const data = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const u = x / TILE;
      const v = y / TILE;
      const [r, g, b] = fn(u, v, x, y);
      const o = (y * TILE + x) * 4;
      data[o] = r * 255;
      data[o + 1] = g * 255;
      data[o + 2] = b * 255;
      data[o + 3] = 255;
    }
  }
  return data;
}

const gens = {
  dirt: (u, v) => {
    const n = fbm(u, v, 6, 1);
    const clump = fbm(u, v, 2.2, 4);
    return rgb(0.28 + n * 0.16 + clump * 0.08, 0.2 + n * 0.1, 0.13 + n * 0.06);
  },
  dirt_dry: (u, v) => {
    const n = fbm(u, v, 5, 8);
    const crack = Math.abs(Math.sin((u * 18 + fbm(u, v, 3, 9)) * Math.PI));
    const line = crack < 0.06 ? 0.18 : 0;
    return rgb(0.42 + n * 0.14 - line, 0.32 + n * 0.1 - line, 0.2 + n * 0.06 - line);
  },
  dirt_red: (u, v) => {
    const n = fbm(u, v, 5.5, 11);
    return rgb(0.46 + n * 0.18, 0.2 + n * 0.08, 0.12 + n * 0.05);
  },
  mud: (u, v) => {
    const n = fbm(u, v, 4, 14);
    const wet = fbm(u, v, 1.6, 15);
    const k = 0.12 + n * 0.08 + wet * 0.06;
    return rgb(k * 1.15, k * 0.85, k * 0.55);
  },
  sand: (u, v) => {
    const grain = hash(Math.floor(u * 180), Math.floor(v * 180), 20);
    const ripple = 0.5 + 0.5 * Math.sin((u * 14 + fbm(u, v, 2, 21) * 2) * Math.PI * 2);
    return rgb(0.62 + grain * 0.12 + ripple * 0.06, 0.5 + grain * 0.08, 0.3 + grain * 0.05);
  },
  ash: (u, v) => {
    const n = fbm(u, v, 8, 24);
    const speck = hash(Math.floor(u * 90), Math.floor(v * 90), 25);
    const g = 0.28 + n * 0.18 + speck * 0.1;
    return rgb(g, g * 0.98, g * 0.96);
  },
  grass: (u, v) => {
    const blade = Math.abs(Math.sin((u * 70 + fbm(u, v, 4, 28) * 3) * Math.PI));
    const patch = fbm(u, v, 2.4, 29);
    return rgb(0.14 + patch * 0.08, 0.28 + patch * 0.16 + blade * 0.1, 0.1 + patch * 0.05);
  },
  grass_dry: (u, v) => {
    const blade = Math.abs(Math.sin((u * 64 + fbm(u, v, 3.5, 32)) * Math.PI));
    const n = fbm(u, v, 2.8, 33);
    return rgb(0.38 + n * 0.14 + blade * 0.08, 0.34 + n * 0.1, 0.14 + n * 0.04);
  },
  moss: (u, v) => {
    const blot = fbm(u, v, 3.2, 36);
    const fine = fbm(u, v, 10, 37);
    return rgb(0.08 + blot * 0.06, 0.2 + blot * 0.18 + fine * 0.06, 0.1 + blot * 0.08);
  },
  gravel: (u, v) => {
    const cell = hash(Math.floor(u * 28), Math.floor(v * 28), 40);
    const n = fbm(u, v, 9, 41);
    const r = 0.32 + cell * 0.28 + n * 0.08;
    return rgb(r, r * 0.92, r * 0.82);
  },
  pebbles: (u, v) => {
    const gx = Math.floor(u * 14);
    const gy = Math.floor(v * 14);
    const cx = (gx + 0.5 + (hash(gx, gy, 44) - 0.5) * 0.35) / 14;
    const cy = (gy + 0.5 + (hash(gx, gy, 45) - 0.5) * 0.35) / 14;
    const d = Math.hypot(u - cx, v - cy);
    const stone = hash(gx, gy, 46);
    const inS = d < 0.028 + stone * 0.012;
    const base = 0.22 + fbm(u, v, 4, 47) * 0.08;
    const c = inS ? 0.3 + stone * 0.35 : base;
    return rgb(c, c * 0.93, c * 0.86);
  },
  rock: (u, v) => {
    const strata = Math.abs(Math.sin((v * 9 + u * 1.4 + fbm(u, v, 2, 50) * 2) * Math.PI));
    const n = fbm(u, v, 6, 51);
    const g = 0.26 + n * 0.14 + strata * 0.1;
    return rgb(g, g * 0.97, g * 0.94);
  },
  concrete: (u, v) => {
    const agg = hash(Math.floor(u * 70), Math.floor(v * 70), 54);
    const seamX = Math.abs(fract(u * 2) - 0.5);
    const seamY = Math.abs(fract(v * 2) - 0.5);
    const seam = seamX < 0.012 || seamY < 0.012 ? 0.12 : 0;
    const g = 0.42 + agg * 0.1 - seam;
    return rgb(g, g, g * 0.98);
  },
  concrete_worn: (u, v) => {
    const stain = fbm(u, v, 2.2, 58);
    const crack = Math.abs(Math.sin((u * 12 + v * 3 + fbm(u, v, 3, 59) * 4) * Math.PI));
    const g = 0.36 + stain * 0.12 - (crack < 0.05 ? 0.14 : 0);
    return rgb(g * 1.02, g, g * 0.9);
  },
  asphalt: (u, v) => {
    const grit = hash(Math.floor(u * 120), Math.floor(v * 120), 62);
    const n = fbm(u, v, 5, 63);
    const g = 0.14 + grit * 0.08 + n * 0.04;
    return rgb(g, g, g * 1.05);
  },
  tarmac: (u, v) => {
    const grit = hash(Math.floor(u * 100), Math.floor(v * 100), 66);
    const g = 0.1 + grit * 0.07 + fbm(u, v, 3, 67) * 0.03;
    return rgb(g * 0.95, g, g * 1.08);
  },
  wood: (u, v) => {
    const plank = Math.floor(v * 8);
    const gap = Math.abs(fract(v * 8) - 0.5);
    const grain = Math.sin((u * 22 + plank * 0.7 + fbm(u, v, 6, 70 + plank) * 3) * Math.PI * 2);
    const base = 0.38 + hash(plank, 2, 71) * 0.08 + grain * 0.05;
    const line = gap < 0.04 ? 0.16 : 0;
    return rgb(base * 1.15 - line, base * 0.78 - line, base * 0.42 - line);
  },
  wood_worn: (u, v) => {
    const plank = Math.floor(v * 7);
    const gap = Math.abs(fract(v * 7) - 0.5);
    const grain = Math.sin((u * 16 + fbm(u, v, 4, 74) * 4) * Math.PI * 2);
    const fade = fbm(u, v, 1.8, 75);
    const base = 0.34 + fade * 0.1 + grain * 0.04;
    const line = gap < 0.045 ? 0.14 : 0;
    return rgb(base * 1.05 - line, base * 0.82 - line, base * 0.55 - line);
  },
  metal: (u, v) => {
    const panel = (Math.floor(u * 4) + Math.floor(v * 4)) & 1;
    const seam = Math.min(Math.abs(fract(u * 4) - 0.5), Math.abs(fract(v * 4) - 0.5));
    const n = fbm(u, v, 7, 78);
    const g = 0.34 + n * 0.08 + panel * 0.04 - (seam < 0.02 ? 0.12 : 0);
    return rgb(g * 0.92, g, g * 1.08);
  },
  rust: (u, v) => {
    const blot = fbm(u, v, 3, 82);
    const flake = fbm(u, v, 9, 83);
    return rgb(0.36 + blot * 0.28, 0.16 + blot * 0.1 + flake * 0.04, 0.08 + blot * 0.04);
  },
  tread: (u, v) => {
    const dx = Math.abs(((u * 12) % 1) - 0.5);
    const dy = Math.abs(((v * 12) % 1) - 0.5);
    const dia = Math.abs(dx - dy);
    const n = fbm(u, v, 6, 86);
    const g = 0.3 + n * 0.06 + (dia < 0.07 ? 0.16 : 0);
    return rgb(g * 0.9, g, g * 1.05);
  },
  hex: (u, v) => {
    const q = u * 10;
    const r = v * 11.5 + ((Math.floor(q) & 1) ? 0.5 : 0);
    const fx = Math.abs(fract(q) - 0.5);
    const fy = Math.abs(fract(r) - 0.5);
    const edge = Math.max(fx * 1.15, fy);
    const cell = hash(Math.floor(q), Math.floor(r), 90);
    const g = 0.18 + cell * 0.08 + (edge > 0.42 ? 0.12 : 0);
    return rgb(g * 0.7, g * 0.95, g * 1.2);
  },
  polymer: (u, v) => {
    const n = fbm(u, v, 3.4, 94);
    const sheen = Math.pow(fbm(u, v, 1.4, 95), 2);
    return rgb(0.22 + n * 0.06 + sheen * 0.08, 0.26 + n * 0.06, 0.3 + n * 0.08 + sheen * 0.1);
  },
  carbon: (u, v) => {
    const a = Math.abs(Math.sin((u + v) * 48 * Math.PI));
    const b = Math.abs(Math.sin((u - v) * 48 * Math.PI));
    const weave = Math.min(a, b);
    const g = 0.08 + weave * 0.14 + fbm(u, v, 5, 98) * 0.03;
    return rgb(g, g * 1.02, g * 1.08);
  },
  clay: (u, v) => {
    const n = fbm(u, v, 4.6, 101);
    const vein = fbm(u, v, 1.8, 102);
    return rgb(0.5 + n * 0.16 + vein * 0.04, 0.28 + n * 0.08, 0.16 + n * 0.05);
  },
  cracked: (u, v) => {
    const n = fbm(u, v, 3.2, 104);
    const a = Math.abs(Math.sin((u * 9 + fbm(u, v, 2, 105) * 3) * Math.PI));
    const b = Math.abs(Math.sin((v * 11 + fbm(u, v, 2, 106) * 3) * Math.PI));
    const line = Math.min(a, b) < 0.045 ? 0.22 : 0;
    return rgb(0.48 + n * 0.1 - line, 0.34 + n * 0.08 - line, 0.2 + n * 0.04 - line);
  },
  leaf: (u, v) => {
    const blot = fbm(u, v, 3.4, 108);
    const flake = hash(Math.floor(u * 42), Math.floor(v * 42), 109);
    return rgb(0.28 + blot * 0.16 + flake * 0.08, 0.2 + blot * 0.12, 0.09 + blot * 0.05);
  },
  snow: (u, v) => {
    const n = fbm(u, v, 4, 112);
    const spark = hash(Math.floor(u * 90), Math.floor(v * 90), 113);
    const g = 0.78 + n * 0.14 + spark * 0.05;
    return rgb(g * 0.96, g * 0.98, g);
  },
  brick: (u, v) => {
    const row = Math.floor(v * 10);
    const off = (row & 1) ? 0.5 : 0;
    const col = Math.floor(u * 8 + off);
    const fx = Math.abs(fract(u * 8 + off) - 0.5);
    const fy = Math.abs(fract(v * 10) - 0.5);
    const mortar = fx < 0.055 || fy < 0.075;
    const tone = hash(col, row, 116);
    if (mortar) return rgb(0.4, 0.38, 0.34);
    return rgb(0.4 + tone * 0.2, 0.15 + tone * 0.08, 0.11 + tone * 0.04);
  },
  cobble: (u, v) => {
    const gx = Math.floor(u * 9);
    const gy = Math.floor(v * 9);
    const cx = (gx + 0.5 + (hash(gx, gy, 118) - 0.5) * 0.22) / 9;
    const cy = (gy + 0.5 + (hash(gx, gy, 119) - 0.5) * 0.22) / 9;
    const d = Math.hypot(u - cx, v - cy);
    const stone = hash(gx, gy, 120);
    const inS = d < 0.042 + stone * 0.01;
    const g = inS ? 0.34 + stone * 0.22 : 0.2 + fbm(u, v, 4, 121) * 0.06;
    return rgb(g, g * 0.94, g * 0.88);
  },
  grate: (u, v) => {
    const barX = Math.abs(fract(u * 8) - 0.5);
    const barY = Math.abs(fract(v * 8) - 0.5);
    const hole = barX > 0.16 && barY > 0.16;
    const g = hole ? 0.07 : 0.3 + fbm(u, v, 6, 124) * 0.06;
    return rgb(g * 0.82, g, g * 1.06);
  },
  hazard: (u, v) => {
    const stripe = fract(u + v) < 0.5;
    const n = fbm(u, v, 5, 128);
    if (stripe) return rgb(0.7 + n * 0.08, 0.56 + n * 0.05, 0.08);
    return rgb(0.08 + n * 0.04, 0.08, 0.07);
  },
};

function fract(v) {
  return v - Math.floor(v);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
      raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ROWS = Math.ceil(GROUNDS.length / COLS);
for (const g of GROUNDS) {
  if (!gens[g.id]) throw new Error(`missing gen ${g.id}`);
}

const tiles = GROUNDS.map((g) => paint(gens[g.id]));
const atlas = new Uint8Array(COLS * TILE * ROWS * TILE * 4);
for (let i = 0; i < tiles.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const src = tiles[i];
  for (let y = 0; y < TILE; y++) {
    const dest = ((row * TILE + y) * COLS * TILE + col * TILE) * 4;
    atlas.set(src.subarray(y * TILE * 4, (y + 1) * TILE * 4), dest);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "content/textures/ground");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "atlas.png"), encodePng(COLS * TILE, ROWS * TILE, atlas));
writeFileSync(join(outDir, "atlas.json"), `${JSON.stringify({
  tile: TILE,
  cols: COLS,
  rows: ROWS,
  repeat: REPEAT,
  base: 16,
  tiles: GROUNDS.map((g, i) => ({ ...g, index: i })),
}, null, 2)}\n`);
writeFileSync(join(root, "web/gpu/ground-tiles.js"), `/** Generated by scripts/gen-ground-tex.mjs — edit GROUNDS there and rebuild. */
export const GROUND_TILES = ${JSON.stringify(GROUNDS.map(({ id, name }) => ({ id, name })), null, 2)};
`);

const patch = 8;
const gap = 1.8;
const margin = 3.5;
const mapW = margin * 2 + COLS * patch + (COLS - 1) * gap;
const mapH = margin * 2 + ROWS * patch + (ROWS - 1) * gap;
const surfaces = GROUNDS.map((g, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x0 = margin + col * (patch + gap);
  const y0 = mapH - margin - (row + 1) * patch - row * gap;
  return {
    kind: g.id,
    tile: i,
    label: g.name,
    min: [+x0.toFixed(2), +y0.toFixed(2)],
    max: [+(x0 + patch).toFixed(2), +(y0 + patch).toFixed(2)],
  };
});
mkdirSync(join(root, "content/maps"), { recursive: true });
mkdirSync(join(root, "content/scenarios"), { recursive: true });
writeFileSync(join(root, "content/maps/ground_yard.json"), `${JSON.stringify({
  id: "ground_yard",
  name: "Ground yard",
  min: [0, 0],
  max: [+mapW.toFixed(2), +mapH.toFixed(2)],
  grid: 1,
  ground: "dirt",
  surfaces,
}, null, 2)}\n`);
writeFileSync(join(root, "content/scenarios/ground_yard.json"), `${JSON.stringify({
  id: "ground_yard",
  name: "Ground yard",
  map: "ground_yard",
  seed: 4,
  skip_contact: true,
  look: true,
  sun: true,
  sun_az: 210,
  sun_el: 48,
  units: [],
}, null, 2)}\n`);
console.log(`atlas ${COLS * TILE}x${ROWS * TILE} tiles=${GROUNDS.length} yard ${mapW.toFixed(1)}x${mapH.toFixed(1)}`);
