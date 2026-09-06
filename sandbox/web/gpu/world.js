import { GROUND, MAX_LIGHTS, WARM_LIGHT, hexRgb, matOf, texId } from "./theme.js";
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

function emitDir(c) {
  const d = c.emit_dir;
  if (!d) return { x: 0, y: 0, z: 0, spot: false };
  const x = Array.isArray(d) ? (d[0] || 0) : (d.x || 0);
  const y = Array.isArray(d) ? (d[1] || 0) : (d.y || 0);
  const z = Array.isArray(d) ? (d[2] || 0) : (d.z || 0);
  return { x, y, z, spot: x * x + y * y + z * z > 0.01 };
}

export function collectLights(boxes) {
  const lights = [];
  if (!boxes) return lights;
  for (const c of boxes) {
    if (!(c.emit > 0)) continue;
    const { x0, y0, x1, y1 } = boxXY(c);
    const z0 = c.z0 ?? 0;
    const z1 = c.z1 ?? c.height ?? 1;
    const rgb = hexRgb(c.color || "#e8c86a");
    const luma = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
    const color = luma < 0.28 ? WARM_LIGHT : rgb;
    const dir = emitDir(c);
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const inset = dir.spot ? 0.2 : 0;
    lights.push({
      x: (x0 + x1) * 0.5 + (dir.x / len) * inset,
      y: (y0 + y1) * 0.5 + (dir.y / len) * inset,
      z: (z0 + z1) * 0.5 + (dir.z / len) * inset,
      range: dir.spot ? 4.5 + c.emit * 5 : 7 + c.emit * 8,
      r: color[0],
      g: color[1],
      b: color[2],
      intensity: 0.7 + c.emit * 1.15,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
    });
    if (lights.length >= MAX_LIGHTS) break;
  }
  return lights;
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

function partSpan(part) {
  if (part.x0 != null && part.x1 != null) {
    return {
      x0: part.x0, x1: part.x1,
      y0: part.y0, y1: part.y1,
      z0: part.z0 ?? 0, z1: part.z1 ?? part.height ?? 0,
    };
  }
  const corners = part.corners;
  if (!corners?.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of corners) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  return { x0, x1, y0, y1, z0, z1 };
}

export function isPoleLike(part) {
  const e = partSpan(part);
  if (!e) return false;
  const area = (e.x1 - e.x0) * (e.y1 - e.y0);
  return area < 0.08 && (e.z1 - e.z0) > 1.8;
}

export function pushCasters(out, solids) {
  for (const part of solids || []) {
    if (part.ghost) continue;
    if ((part.emit || 0) > 0) continue;
    pushBox(out, part.corners, [0, 0, 0], 1, matOf(part.mat), 0, 0);
  }
}

export function pushLampCasters(out, solids) {
  for (const part of solids || []) {
    if (part.ghost) continue;
    if ((part.emit || 0) > 0) continue;
    if (isPoleLike(part)) continue;
    pushBox(out, part.corners, [0, 0, 0], 1, matOf(part.mat), 0, 0);
  }
}
