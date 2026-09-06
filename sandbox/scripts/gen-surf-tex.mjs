import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const TILE = 512;
const COLS = 8;
const ROWS = 8;
const REPEAT = 0.72;
const BASE = 80;

const SURFS = [
  { id: "steel", name: "Bare steel", kind: "metal", mat: "metal" },
  { id: "steel_worn", name: "Worn steel", kind: "metal", mat: "metal" },
  { id: "steel_od", name: "Olive drab steel", kind: "metal", mat: "paint" },
  { id: "steel_tan", name: "Tan steel", kind: "metal", mat: "paint" },
  { id: "steel_grey", name: "Grey steel", kind: "metal", mat: "paint" },
  { id: "galvanized", name: "Galvanized", kind: "metal", mat: "metal" },
  { id: "aluminum", name: "Aluminum", kind: "metal", mat: "metal" },
  { id: "gunmetal", name: "Gunmetal", kind: "metal", mat: "metal" },
  { id: "rust_heavy", name: "Heavy rust", kind: "metal", mat: "metal" },
  { id: "rust_streak", name: "Rust streaks", kind: "metal", mat: "metal" },
  { id: "brass", name: "Brass", kind: "metal", mat: "metal" },
  { id: "copper", name: "Copper", kind: "metal", mat: "metal" },
  { id: "chrome", name: "Chrome", kind: "metal", mat: "metal" },
  { id: "anodized", name: "Anodized blue", kind: "metal", mat: "metal" },
  { id: "corrugated", name: "Corrugated", kind: "metal", mat: "metal" },
  { id: "riveted", name: "Riveted plate", kind: "metal", mat: "metal" },
  { id: "paint_peel", name: "Peeling paint", kind: "paint", mat: "paint" },
  { id: "enamel_white", name: "White enamel", kind: "paint", mat: "paint" },
  { id: "enamel_black", name: "Black enamel", kind: "paint", mat: "paint" },
  { id: "hazard_yel", name: "Hazard yellow", kind: "paint", mat: "paint" },
  { id: "hazard_red", name: "Hazard red", kind: "paint", mat: "paint" },
  { id: "primer", name: "Red primer", kind: "paint", mat: "paint" },
  { id: "camo_paint", name: "Camo paint", kind: "paint", mat: "paint" },
  { id: "rubber_coat", name: "Rubber coat", kind: "paint", mat: "rubber" },
  { id: "brick_wall", name: "Brick wall", kind: "masonry", mat: "concrete" },
  { id: "brick_white", name: "White brick", kind: "masonry", mat: "concrete" },
  { id: "cinder", name: "Cinder block", kind: "masonry", mat: "concrete" },
  { id: "stucco", name: "Stucco", kind: "masonry", mat: "concrete" },
  { id: "plaster", name: "Plaster", kind: "masonry", mat: "concrete" },
  { id: "concrete_panel", name: "Concrete panel", kind: "masonry", mat: "concrete" },
  { id: "concrete_board", name: "Form board", kind: "masonry", mat: "concrete" },
  { id: "tile_white", name: "White tile", kind: "masonry", mat: "concrete" },
  { id: "tile_dirty", name: "Dirty tile", kind: "masonry", mat: "concrete" },
  { id: "stone_block", name: "Stone block", kind: "masonry", mat: "stone" },
  { id: "adobe", name: "Adobe", kind: "masonry", mat: "dirt" },
  { id: "terrazzo", name: "Terrazzo", kind: "masonry", mat: "concrete" },
  { id: "pine", name: "Pine plank", kind: "wood", mat: "wood" },
  { id: "plywood", name: "Plywood", kind: "wood", mat: "wood" },
  { id: "osb", name: "OSB", kind: "wood", mat: "wood" },
  { id: "crate_wood", name: "Crate wood", kind: "wood", mat: "wood" },
  { id: "pallet", name: "Pallet wood", kind: "wood", mat: "wood" },
  { id: "teak", name: "Teak", kind: "wood", mat: "wood" },
  { id: "charred", name: "Charred wood", kind: "wood", mat: "wood" },
  { id: "laminate", name: "Laminate", kind: "wood", mat: "paint" },
  { id: "canvas", name: "Canvas", kind: "fabric", mat: "canvas" },
  { id: "tarp_green", name: "Green tarp", kind: "fabric", mat: "canvas" },
  { id: "tarp_tan", name: "Tan tarp", kind: "fabric", mat: "canvas" },
  { id: "camo_cloth", name: "Camo cloth", kind: "fabric", mat: "canvas" },
  { id: "net", name: "Netting", kind: "fabric", mat: "canvas" },
  { id: "sandbag", name: "Sandbag cloth", kind: "fabric", mat: "canvas" },
  { id: "leather", name: "Leather", kind: "fabric", mat: "rubber" },
  { id: "felt", name: "Felt", kind: "fabric", mat: "canvas" },
  { id: "hull_white", name: "White hull", kind: "sci-fi", mat: "paint" },
  { id: "hull_dark", name: "Dark hull", kind: "sci-fi", mat: "metal" },
  { id: "polymer_panel", name: "Polymer panel", kind: "sci-fi", mat: "paint" },
  { id: "carbon_panel", name: "Carbon panel", kind: "sci-fi", mat: "metal" },
  { id: "hex_panel", name: "Hex panel", kind: "sci-fi", mat: "metal" },
  { id: "insulation", name: "Foam insulation", kind: "sci-fi", mat: "default" },
  { id: "ceramic_heat", name: "Heat shield", kind: "sci-fi", mat: "stone" },
  { id: "server", name: "Server face", kind: "sci-fi", mat: "metal" },
  { id: "plastic", name: "Hard plastic", kind: "sci-fi", mat: "paint" },
  { id: "pvc", name: "PVC", kind: "sci-fi", mat: "paint" },
  { id: "grate_wall", name: "Wall grate", kind: "sci-fi", mat: "metal" },
  { id: "stripe_panel", name: "Stripe panel", kind: "sci-fi", mat: "paint" },
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

function mix3(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function rgb(r, g, b) {
  return [clamp(r), clamp(g), clamp(b)];
}

function fract(v) {
  return v - Math.floor(v);
}

function mottled(u, v, seed, a, b, scale = 5) {
  return mix3(a, b, fbm(u, v, scale, seed));
}

function grit(u, v, seed, amt = 0.08) {
  return (hash(Math.floor(u * 140), Math.floor(v * 140), seed) - 0.5) * amt;
}

function bricks(u, v, seed, brick, mortar, cols = 6, rows = 14) {
  const row = Math.floor(v * rows);
  const off = (row & 1) ? 0.5 : 0;
  const col = Math.floor(u * cols + off);
  const fx = Math.abs(fract(u * cols + off) - 0.5);
  const fy = Math.abs(fract(v * rows) - 0.5);
  if (fx < 0.055 || fy < 0.07) return mortar;
  const t = hash(col, row, seed);
  return mix3(brick, mix3(brick, [1, 1, 1], 0.12), t);
}

function planks(u, v, seed, wood, gap, count = 6) {
  const plank = Math.floor(v * count);
  const g = Math.abs(fract(v * count) - 0.5);
  const grain = Math.sin((u * 20 + plank * 0.6 + fbm(u, v, 6, seed + plank) * 3) * Math.PI * 2);
  const base = mix3(wood, [wood[0] * 1.15, wood[1] * 1.1, wood[2] * 0.9], 0.35 + grain * 0.15);
  if (g < 0.04) return mix3(base, gap, 0.7);
  return mix3(base, [0, 0, 0], hash(plank, 2, seed) * 0.08);
}

function weave(u, v, a, b, freq = 36) {
  const x = Math.abs(Math.sin((u + v) * freq * Math.PI));
  const y = Math.abs(Math.sin((u - v) * freq * Math.PI));
  return mix3(a, b, Math.min(x, y));
}

const gens = {
  steel: (u, v) => {
    const n = mottled(u, v, 1, [0.38, 0.4, 0.43], [0.52, 0.54, 0.58]);
    const g = grit(u, v, 2);
    return rgb(n[0] + g, n[1] + g, n[2] + g * 1.1);
  },
  steel_worn: (u, v) => {
    const n = mottled(u, v, 4, [0.3, 0.31, 0.33], [0.44, 0.4, 0.36], 3.4);
    const scratch = Math.abs(Math.sin((u * 22 + fbm(u, v, 2, 5) * 4) * Math.PI));
    const k = scratch < 0.04 ? 0.12 : 0;
    return rgb(n[0] + k, n[1] + k * 0.7, n[2] + k * 0.4);
  },
  steel_od: (u, v) => rgb(...mottled(u, v, 7, [0.22, 0.26, 0.16], [0.3, 0.34, 0.2]).map((c, i) => c + grit(u, v, 8, 0.04) * (i ? 1 : 1))),
  steel_tan: (u, v) => rgb(...mottled(u, v, 10, [0.42, 0.36, 0.22], [0.54, 0.46, 0.28]).map((c) => c + grit(u, v, 11, 0.05))),
  steel_grey: (u, v) => rgb(...mottled(u, v, 13, [0.34, 0.36, 0.38], [0.46, 0.47, 0.48]).map((c) => c + grit(u, v, 14))),
  galvanized: (u, v) => {
    const spangle = fbm(u, v, 8, 16, 3);
    const n = mix3([0.48, 0.5, 0.5], [0.62, 0.64, 0.63], spangle);
    return rgb(n[0], n[1], n[2] * 0.98);
  },
  aluminum: (u, v) => {
    const n = mottled(u, v, 19, [0.58, 0.6, 0.63], [0.72, 0.74, 0.76], 7);
    const sheen = Math.pow(fbm(u, v, 1.6, 20), 2) * 0.1;
    return rgb(n[0] + sheen, n[1] + sheen, n[2] + sheen);
  },
  gunmetal: (u, v) => rgb(...mottled(u, v, 22, [0.16, 0.17, 0.19], [0.26, 0.28, 0.3])),
  rust_heavy: (u, v) => {
    const blot = fbm(u, v, 3, 25);
    const flake = fbm(u, v, 10, 26);
    return rgb(0.38 + blot * 0.32, 0.14 + blot * 0.1 + flake * 0.05, 0.07 + blot * 0.04);
  },
  rust_streak: (u, v) => {
    const steel = mottled(u, v, 28, [0.34, 0.36, 0.38], [0.46, 0.46, 0.48]);
    const streak = Math.abs(Math.sin((u * 3 + fbm(u, v, 2, 29) * 2) * Math.PI));
    const rust = [0.46, 0.2, 0.08];
    return rgb(...mix3(steel, rust, streak < 0.18 ? 0.85 : 0.08));
  },
  brass: (u, v) => rgb(...mottled(u, v, 31, [0.55, 0.42, 0.16], [0.72, 0.58, 0.24], 4)),
  copper: (u, v) => rgb(...mottled(u, v, 34, [0.52, 0.26, 0.16], [0.68, 0.36, 0.22], 4.4)),
  chrome: (u, v) => {
    const n = mottled(u, v, 37, [0.62, 0.64, 0.68], [0.82, 0.84, 0.88], 9);
    const band = 0.5 + 0.5 * Math.sin((v * 14 + fbm(u, v, 2, 38)) * Math.PI * 2);
    return rgb(n[0] + band * 0.08, n[1] + band * 0.08, n[2] + band * 0.1);
  },
  anodized: (u, v) => rgb(...mottled(u, v, 40, [0.1, 0.18, 0.32], [0.16, 0.3, 0.5], 6)),
  corrugated: (u, v) => {
    const ridge = 0.5 + 0.5 * Math.sin(u * 28 * Math.PI);
    const n = mottled(u, v, 43, [0.36, 0.38, 0.4], [0.5, 0.5, 0.48]);
    return rgb(n[0] + ridge * 0.1, n[1] + ridge * 0.1, n[2] + ridge * 0.08);
  },
  riveted: (u, v) => {
    const n = mottled(u, v, 46, [0.32, 0.34, 0.37], [0.44, 0.46, 0.48]);
    const gx = Math.floor(u * 8);
    const gy = Math.floor(v * 8);
    const d = Math.hypot(fract(u * 8) - 0.5, fract(v * 8) - 0.5);
    const rivet = d < 0.09 ? 0.16 : 0;
    const seam = Math.min(Math.abs(fract(u * 4) - 0.5), Math.abs(fract(v * 4) - 0.5)) < 0.02 ? -0.1 : 0;
    return rgb(n[0] + rivet + seam, n[1] + rivet + seam, n[2] + rivet + seam);
  },
  paint_peel: (u, v) => {
    const paint = mottled(u, v, 49, [0.28, 0.36, 0.22], [0.36, 0.44, 0.28]);
    const under = mottled(u, v, 50, [0.4, 0.3, 0.18], [0.5, 0.22, 0.1]);
    const peel = fbm(u, v, 2.2, 51);
    return rgb(...(peel > 0.58 ? under : paint));
  },
  enamel_white: (u, v) => {
    const n = mottled(u, v, 53, [0.78, 0.78, 0.76], [0.9, 0.9, 0.88], 3);
    return rgb(n[0], n[1], n[2] + grit(u, v, 54, 0.03));
  },
  enamel_black: (u, v) => rgb(...mottled(u, v, 56, [0.08, 0.08, 0.09], [0.16, 0.16, 0.17], 4)),
  hazard_yel: (u, v) => rgb(...mottled(u, v, 59, [0.72, 0.58, 0.08], [0.84, 0.7, 0.12]).map((c) => c + grit(u, v, 60, 0.04))),
  hazard_red: (u, v) => rgb(...mottled(u, v, 62, [0.55, 0.1, 0.08], [0.7, 0.16, 0.12])),
  primer: (u, v) => rgb(...mottled(u, v, 65, [0.5, 0.18, 0.12], [0.62, 0.24, 0.16])),
  camo_paint: (u, v) => {
    const n = fbm(u, v, 2.8, 68);
    if (n < 0.38) return rgb(0.22, 0.26, 0.16);
    if (n < 0.58) return rgb(0.36, 0.32, 0.2);
    if (n < 0.76) return rgb(0.18, 0.2, 0.14);
    return rgb(0.3, 0.28, 0.18);
  },
  rubber_coat: (u, v) => rgb(...mottled(u, v, 71, [0.1, 0.1, 0.11], [0.18, 0.18, 0.2], 3)),
  brick_wall: (u, v) => rgb(...bricks(u, v, 74, [0.42, 0.16, 0.12], [0.4, 0.38, 0.34])),
  brick_white: (u, v) => rgb(...bricks(u, v, 77, [0.72, 0.7, 0.66], [0.5, 0.48, 0.44])),
  cinder: (u, v) => rgb(...bricks(u, v, 80, [0.42, 0.42, 0.4], [0.32, 0.32, 0.3], 3, 6)),
  stucco: (u, v) => rgb(...mottled(u, v, 83, [0.62, 0.58, 0.5], [0.74, 0.7, 0.6], 9).map((c) => c + grit(u, v, 84, 0.06))),
  plaster: (u, v) => {
    const n = mottled(u, v, 86, [0.72, 0.7, 0.66], [0.84, 0.82, 0.76], 3);
    const crack = Math.abs(Math.sin((u * 8 + v * 2 + fbm(u, v, 2, 87) * 3) * Math.PI));
    const k = crack < 0.03 ? 0.16 : 0;
    return rgb(n[0] - k, n[1] - k, n[2] - k);
  },
  concrete_panel: (u, v) => {
    const n = mottled(u, v, 89, [0.46, 0.46, 0.44], [0.58, 0.58, 0.55]);
    const seam = Math.min(Math.abs(fract(u * 2) - 0.5), Math.abs(fract(v * 2) - 0.5)) < 0.012 ? 0.12 : 0;
    return rgb(n[0] - seam, n[1] - seam, n[2] - seam);
  },
  concrete_board: (u, v) => {
    const n = mottled(u, v, 92, [0.44, 0.43, 0.4], [0.54, 0.52, 0.48]);
    const board = Math.abs(fract(u * 5) - 0.5);
    return rgb(n[0] - (board < 0.03 ? 0.08 : 0), n[1] - (board < 0.03 ? 0.08 : 0), n[2] - (board < 0.03 ? 0.08 : 0));
  },
  tile_white: (u, v) => {
    const grout = Math.min(Math.abs(fract(u * 5) - 0.5), Math.abs(fract(v * 5) - 0.5)) < 0.04;
    const n = mottled(u, v, 95, [0.82, 0.82, 0.8], [0.92, 0.92, 0.9], 2);
    return grout ? rgb(0.55, 0.54, 0.5) : rgb(...n);
  },
  tile_dirty: (u, v) => {
    const grout = Math.min(Math.abs(fract(u * 4) - 0.5), Math.abs(fract(v * 4) - 0.5)) < 0.045;
    const n = mottled(u, v, 98, [0.55, 0.56, 0.52], [0.7, 0.68, 0.58], 3);
    const stain = fbm(u, v, 2, 99) * 0.12;
    return grout ? rgb(0.36, 0.34, 0.3) : rgb(n[0] - stain, n[1] - stain, n[2] - stain);
  },
  stone_block: (u, v) => rgb(...bricks(u, v, 101, [0.36, 0.34, 0.3], [0.22, 0.2, 0.18], 3, 5)),
  adobe: (u, v) => rgb(...mottled(u, v, 104, [0.52, 0.36, 0.22], [0.66, 0.46, 0.28], 3.2)),
  terrazzo: (u, v) => {
    const base = mottled(u, v, 107, [0.62, 0.6, 0.56], [0.72, 0.7, 0.66], 2);
    const chip = hash(Math.floor(u * 28), Math.floor(v * 28), 108);
    const spec = chip > 0.82 ? [0.3, 0.3, 0.32] : chip > 0.7 ? [0.7, 0.55, 0.4] : base;
    return rgb(...spec);
  },
  pine: (u, v) => rgb(...planks(u, v, 110, [0.55, 0.38, 0.18], [0.22, 0.16, 0.1], 7)),
  plywood: (u, v) => {
    const n = mottled(u, v, 113, [0.5, 0.38, 0.2], [0.62, 0.48, 0.26], 4);
    const knot = hash(Math.floor(u * 6), Math.floor(v * 6), 114);
    const d = Math.hypot(fract(u * 6) - 0.5, fract(v * 6) - 0.5);
    if (knot > 0.82 && d < 0.12) return rgb(0.32, 0.2, 0.1);
    return rgb(...n);
  },
  osb: (u, v) => {
    const flake = hash(Math.floor(u * 22), Math.floor(v * 16), 116);
    return rgb(0.48 + flake * 0.18, 0.36 + flake * 0.1, 0.18 + flake * 0.06);
  },
  crate_wood: (u, v) => rgb(...planks(u, v, 118, [0.48, 0.32, 0.16], [0.18, 0.12, 0.08], 5)),
  pallet: (u, v) => rgb(...planks(u, v, 121, [0.5, 0.4, 0.22], [0.16, 0.12, 0.08], 4)),
  teak: (u, v) => rgb(...planks(u, v, 124, [0.36, 0.22, 0.1], [0.12, 0.08, 0.04], 8)),
  charred: (u, v) => {
    const n = planks(u, v, 127, [0.16, 0.12, 0.1], [0.04, 0.03, 0.03], 6);
    const ash = fbm(u, v, 3, 128) * 0.12;
    return rgb(n[0] + ash, n[1] + ash, n[2] + ash);
  },
  laminate: (u, v) => rgb(...planks(u, v, 130, [0.42, 0.3, 0.18], [0.2, 0.16, 0.12], 10)),
  canvas: (u, v) => rgb(...weave(u, v, [0.55, 0.5, 0.36], [0.42, 0.38, 0.26], 28)),
  tarp_green: (u, v) => {
    const fold = fbm(u, v, 2, 134);
    return rgb(0.16 + fold * 0.08, 0.28 + fold * 0.1, 0.16 + fold * 0.04);
  },
  tarp_tan: (u, v) => {
    const fold = fbm(u, v, 2, 137);
    return rgb(0.5 + fold * 0.1, 0.42 + fold * 0.08, 0.26 + fold * 0.04);
  },
  camo_cloth: (u, v) => {
    const n = fbm(u, v, 3.4, 140);
    if (n < 0.4) return rgb(0.2, 0.24, 0.14);
    if (n < 0.62) return rgb(0.32, 0.28, 0.16);
    return rgb(0.14, 0.16, 0.1);
  },
  net: (u, v) => {
    const a = Math.abs(Math.sin(u * 22 * Math.PI));
    const b = Math.abs(Math.sin(v * 22 * Math.PI));
    const hole = a > 0.18 && b > 0.18;
    return hole ? rgb(0.12, 0.14, 0.1) : rgb(0.28, 0.3, 0.2);
  },
  sandbag: (u, v) => {
    const bag = Math.floor(v * 5);
    const g = Math.abs(fract(v * 5) - 0.5);
    const n = mottled(u, v, 143 + bag, [0.5, 0.44, 0.28], [0.62, 0.54, 0.34], 6);
    return g < 0.06 ? rgb(0.28, 0.24, 0.16) : rgb(...n);
  },
  leather: (u, v) => rgb(...mottled(u, v, 146, [0.28, 0.16, 0.1], [0.4, 0.22, 0.12], 4)),
  felt: (u, v) => rgb(...mottled(u, v, 149, [0.22, 0.2, 0.18], [0.32, 0.3, 0.26], 10).map((c) => c + grit(u, v, 150, 0.05))),
  hull_white: (u, v) => {
    const n = mottled(u, v, 152, [0.74, 0.76, 0.78], [0.86, 0.88, 0.9], 3);
    const panel = Math.min(Math.abs(fract(u * 3) - 0.5), Math.abs(fract(v * 2) - 0.5)) < 0.015 ? 0.1 : 0;
    return rgb(n[0] - panel, n[1] - panel, n[2] - panel);
  },
  hull_dark: (u, v) => {
    const n = mottled(u, v, 155, [0.1, 0.12, 0.16], [0.18, 0.2, 0.26], 4);
    const panel = Math.min(Math.abs(fract(u * 3) - 0.5), Math.abs(fract(v * 2) - 0.5)) < 0.015 ? 0.08 : 0;
    return rgb(n[0] + panel, n[1] + panel, n[2] + panel);
  },
  polymer_panel: (u, v) => {
    const n = mottled(u, v, 158, [0.2, 0.26, 0.32], [0.28, 0.34, 0.4], 3);
    const sheen = Math.pow(fbm(u, v, 1.2, 159), 2) * 0.12;
    return rgb(n[0] + sheen, n[1] + sheen, n[2] + sheen * 1.1);
  },
  carbon_panel: (u, v) => rgb(...weave(u, v, [0.08, 0.08, 0.1], [0.16, 0.17, 0.2], 42)),
  hex_panel: (u, v) => {
    const q = u * 8;
    const r = v * 9.2 + ((Math.floor(q) & 1) ? 0.5 : 0);
    const edge = Math.max(Math.abs(fract(q) - 0.5) * 1.15, Math.abs(fract(r) - 0.5));
    const cell = hash(Math.floor(q), Math.floor(r), 162);
    const g = 0.16 + cell * 0.08 + (edge > 0.42 ? 0.1 : 0);
    return rgb(g * 0.7, g * 0.9, g * 1.15);
  },
  insulation: (u, v) => {
    const n = mottled(u, v, 164, [0.72, 0.42, 0.12], [0.86, 0.54, 0.16], 7);
    return rgb(n[0] + grit(u, v, 165, 0.07), n[1] + grit(u, v, 166, 0.05), n[2]);
  },
  ceramic_heat: (u, v) => {
    const n = mottled(u, v, 168, [0.55, 0.42, 0.3], [0.7, 0.52, 0.36], 4);
    const tile = Math.min(Math.abs(fract(u * 4) - 0.5), Math.abs(fract(v * 4) - 0.5)) < 0.03 ? 0.12 : 0;
    return rgb(n[0] - tile, n[1] - tile, n[2] - tile);
  },
  server: (u, v) => {
    const slot = Math.floor(v * 10);
    const g = Math.abs(fract(v * 10) - 0.5);
    const vent = Math.abs(fract(u * 18) - 0.5) < 0.2 && g > 0.12;
    const base = 0.12 + hash(slot, 2, 171) * 0.06;
    if (g < 0.06) return rgb(0.08, 0.08, 0.1);
    if (vent) return rgb(0.06, 0.06, 0.07);
    const led = hash(slot, Math.floor(u * 8), 172) > 0.92;
    return led ? rgb(0.2, 0.7, 0.3) : rgb(base, base, base * 1.1);
  },
  plastic: (u, v) => rgb(...mottled(u, v, 174, [0.22, 0.36, 0.28], [0.3, 0.46, 0.34], 3)),
  pvc: (u, v) => rgb(...mottled(u, v, 177, [0.72, 0.74, 0.76], [0.84, 0.86, 0.88], 2)),
  grate_wall: (u, v) => {
    const barX = Math.abs(fract(u * 7) - 0.5);
    const barY = Math.abs(fract(v * 7) - 0.5);
    const hole = barX > 0.16 && barY > 0.16;
    const g = hole ? 0.07 : 0.32 + fbm(u, v, 5, 180) * 0.06;
    return rgb(g * 0.82, g, g * 1.05);
  },
  stripe_panel: (u, v) => {
    const stripe = fract(u + v * 0.15) < 0.5;
    const n = fbm(u, v, 4, 183);
    return stripe ? rgb(0.72 + n * 0.06, 0.58 + n * 0.04, 0.08) : rgb(0.1 + n * 0.03, 0.1, 0.09);
  },
};

function paint(fn) {
  const data = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const [r, g, b] = fn(x / TILE, y / TILE, x, y);
      const o = (y * TILE + x) * 4;
      data[o] = r * 255;
      data[o + 1] = g * 255;
      data[o + 2] = b * 255;
      data[o + 3] = 255;
    }
  }
  return data;
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

if (SURFS.length !== COLS * ROWS) throw new Error(`expected ${COLS * ROWS} surfs, got ${SURFS.length}`);
for (const s of SURFS) {
  if (!gens[s.id]) throw new Error(`missing gen ${s.id}`);
}

const tiles = SURFS.map((s) => paint(gens[s.id]));
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
const outDir = join(root, "content/textures/surf");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "atlas.png"), encodePng(COLS * TILE, ROWS * TILE, atlas));
writeFileSync(join(outDir, "atlas.json"), `${JSON.stringify({
  tile: TILE,
  cols: COLS,
  rows: ROWS,
  repeat: REPEAT,
  base: BASE,
  tiles: SURFS.map((s, i) => ({ ...s, index: i })),
}, null, 2)}\n`);

const cellW = 8;
const cellH = 9;
const gap = 2.2;
const margin = 5;
const mapW = margin * 2 + COLS * cellW + (COLS - 1) * gap;
const mapH = margin * 2 + ROWS * cellH + (ROWS - 1) * gap;
const places = [];
SURFS.forEach((s, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = margin + col * (cellW + gap) + cellW * 0.5;
  const y = mapH - margin - row * (cellH + gap) - cellH * 0.55;
  places.push({
    prop: "panel",
    id: `panel-${s.id}`,
    pos: [+x.toFixed(2), +y.toFixed(2)],
    surf: s.id,
    mat: s.mat,
    label: s.name,
  });
  places.push({
    prop: "block",
    id: `block-${s.id}`,
    pos: [+(x - 2.1).toFixed(2), +(y - 1.7).toFixed(2)],
    surf: s.id,
    mat: s.mat,
  });
});

mkdirSync(join(root, "content/maps"), { recursive: true });
mkdirSync(join(root, "content/scenarios"), { recursive: true });
mkdirSync(join(root, "content/props"), { recursive: true });
writeFileSync(join(root, "content/props/panel.json"), `${JSON.stringify({
  id: "panel",
  parts: [
    { min: [-1.25, -0.09], max: [1.25, 0.09], z0: 0, z1: 2.25, color: "#f3f1ec", mat: "default", cover: true, protection: 14, durability: 8 },
  ],
}, null, 2)}\n`);
writeFileSync(join(root, "content/props/block.json"), `${JSON.stringify({
  id: "block",
  parts: [
    { min: [-0.5, -0.5], max: [0.5, 0.5], z0: 0, z1: 1.05, color: "#f3f1ec", mat: "default", cover: true, protection: 12, durability: 6 },
  ],
}, null, 2)}\n`);
writeFileSync(join(root, "content/maps/materials_yard.json"), `${JSON.stringify({
  id: "materials_yard",
  name: "Materials yard",
  min: [0, 0],
  max: [+mapW.toFixed(2), +mapH.toFixed(2)],
  grid: 1,
  ground: "concrete",
  places,
}, null, 2)}\n`);
writeFileSync(join(root, "content/scenarios/materials_yard.json"), `${JSON.stringify({
  id: "materials_yard",
  name: "Materials yard",
  map: "materials_yard",
  seed: 5,
  skip_contact: true,
  look: true,
  sun: true,
  sun_az: 210,
  sun_el: 48,
  units: [],
}, null, 2)}\n`);
console.log(`surf atlas ${COLS * TILE}x${ROWS * TILE} tiles=${SURFS.length} yard ${mapW.toFixed(1)}x${mapH.toFixed(1)}`);
