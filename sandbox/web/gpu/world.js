import { GROUND, MAT, SUN, hexRgb, matOf, texId } from "./theme.js";
import { pushBox, pushQuad } from "./mesh.js";

function hash2(ix, iy) {
  let n = (ix * 374761393 + iy * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function tintGround(kind, hex, ix, iy) {
  const t = hash2(ix, iy);
  const t2 = hash2(iy + 17, ix * 3 + 9);
  const c = hexRgb(hex);
  let k = 0.86 + t * 0.28;
  let r = c[0] * k;
  let g = c[1] * k;
  let b = c[2] * k;
  if (kind === "grass") {
    g += 0.04 + t2 * 0.07;
    r -= 0.02 + t * 0.03;
  } else if (kind === "dirt") {
    r += (t - 0.5) * 0.08;
    g += (t2 - 0.5) * 0.04;
  } else if (kind === "gravel") {
    const speck = (t - 0.5) * 0.12;
    r += speck; g += speck * 0.9; b += speck * 0.7;
  } else if (kind === "concrete") {
    const slab = ((ix + iy) & 1) ? -0.025 : 0.02;
    r += slab; g += slab; b += slab;
  } else if (kind === "road") {
    r += (t - 0.5) * 0.05;
    g += (t - 0.5) * 0.05;
    b += (t - 0.5) * 0.06;
  } else if (kind === "tracks") {
    r -= 0.04; g -= 0.03; b -= 0.02;
  }
  return [r, g, b];
}

function bounds(p) {
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function surfaceAt(map, x, y) {
  let hit = null;
  for (const s of map.surfaces || []) {
    if (!s.min || !s.max) continue;
    const a = bounds(s.min);
    const b = bounds(s.max);
    if (x >= a.x && x < b.x && y >= a.y && y < b.y) hit = s;
  }
  return hit;
}

function matForGround(kind) {
  if (kind === "grass") return matOf("foliage");
  if (kind === "concrete") return matOf("concrete");
  if (kind === "road") return matOf("rubber");
  if (kind === "gravel") return matOf("stone");
  if (kind === "tracks") return matOf("dirt");
  return matOf("dirt");
}

export function pushGround(out, map) {
  if (!map?.min || !map?.max) return;
  const min = bounds(map.min);
  const max = bounds(map.max);
  const step = 2;
  const kind0 = map.ground || "dirt";
  const dirt = matOf("dirt");
  for (let x = min.x; x < max.x - 1e-9; x += step) {
    const xe = Math.min(x + step, max.x);
    const ix = Math.round(x / step);
    for (let y = min.y; y < max.y - 1e-9; y += step) {
      const ye = Math.min(y + step, max.y);
      const iy = Math.round(y / step);
      const s = surfaceAt(map, (x + xe) * 0.5, (y + ye) * 0.5);
      const kind = s?.kind || kind0;
      const hex = s?.color || GROUND[kind] || GROUND[kind0];
      const mat = s ? matForGround(kind) : dirt;
      pushQuad(out, [
        { x, y, z: 0 }, { x: xe, y, z: 0 }, { x: xe, y: ye, z: 0 }, { x, y: ye, z: 0 },
      ], tintGround(kind, hex, ix, iy), 1, mat);
    }
  }
  pushRoadDashes(out, map);
}

function pushRoadDashes(out, map) {
  const mat = matOf("rubber");
  const rgb = [0.86, 0.75, 0.22];
  const hw = 0.07;
  const z = 0.02;
  for (const s of map.surfaces || []) {
    if (s.kind !== "road" || !s.min || !s.max) continue;
    const a = bounds(s.min);
    const b = bounds(s.max);
    const y = (a.y + b.y) * 0.5;
    for (let x = a.x + 1.2; x < b.x - 1.2; x += 4.2) {
      const xe = Math.min(b.x - 0.4, x + 1.7);
      pushQuad(out, [
        { x, y: y - hw, z }, { x: xe, y: y - hw, z },
        { x: xe, y: y + hw, z }, { x, y: y + hw, z },
      ], rgb, 1, mat);
    }
  }
}

function boxXY(c) {
  const min = bounds(c.min);
  const max = bounds(c.max);
  return { x0: min.x, y0: min.y, x1: max.x, y1: max.y };
}

export function pushShadows(out, boxes) {
  if (!boxes) return;
  const sx = -SUN.x / Math.max(0.28, SUN.z);
  const sy = -SUN.y / Math.max(0.28, SUN.z);
  const rgb = [0.04, 0.03, 0.02];
  const mat = matOf("dirt");
  for (const c of boxes) {
    if (c.roof) continue;
    const z0 = c.z0 ?? 0;
    if (z0 > 0.45) continue;
    const { x0, y0, x1, y1 } = boxXY(c);
    const area = (x1 - x0) * (y1 - y0);
    if (area < 0.02 || area > 14) continue;
    const hgt = (c.z1 ?? c.height ?? 1) - z0;
    if (hgt < 0.28) continue;
    const stretch = Math.min(2.4, 0.22 + hgt * 0.48);
    const ox = sx * stretch;
    const oy = sy * stretch;
    const pad = 0.06;
    pushQuad(out, [
      { x: x0 - pad + ox * 0.12, y: y0 - pad + oy * 0.12, z: 0.04 },
      { x: x1 + pad + ox * 0.12, y: y0 - pad + oy * 0.12, z: 0.04 },
      { x: x1 + pad + ox, y: y1 + pad + oy, z: 0.04 },
      { x: x0 - pad + ox, y: y1 + pad + oy, z: 0.04 },
    ], rgb, 0.35, mat);
  }
}

export function pushEmitPools(out, boxes) {
  if (!boxes) return;
  const mat = MAT.emit;
  for (const c of boxes) {
    if (!(c.emit > 0)) continue;
    const { x0, y0, x1, y1 } = boxXY(c);
    const cx = (x0 + x1) * 0.5;
    const cy = (y0 + y1) * 0.5;
    const r = 2.6 * (0.7 + c.emit);
    pushQuad(out, [
      { x: cx - r, y: cy - r, z: 0.05 }, { x: cx + r, y: cy - r, z: 0.05 },
      { x: cx + r, y: cy + r, z: 0.05 }, { x: cx - r, y: cy + r, z: 0.05 },
    ], [1, 0.75, 0.35], 0.16, mat, 0, 1);
    const r2 = r * 0.55;
    pushQuad(out, [
      { x: cx - r2, y: cy - r2, z: 0.055 }, { x: cx + r2, y: cy - r2, z: 0.055 },
      { x: cx + r2, y: cy + r2, z: 0.055 }, { x: cx - r2, y: cy + r2, z: 0.055 },
    ], [1, 0.82, 0.47], 0.2, mat, 0, 1);
  }
}

export function pushSolids(opaque, ghost, solids) {
  for (const part of solids || []) {
    const dest = part.ghost ? ghost : opaque;
    pushBox(
      dest,
      part.corners,
      hexRgb(part.color),
      part.ghost ? 0.5 : 1,
      matOf(part.mat),
      texId(part.tex),
      part.emit || (part.mat === "emit" ? 1 : 0),
    );
  }
}
