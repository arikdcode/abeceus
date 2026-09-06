import { GROUND, MAX_SCENE_LIGHTS, WARM_LIGHT, hexRgb, matOf, texId } from "./theme.js";
import { pushBox, pushQuad } from "./mesh.js";
import { groundTexId } from "./grounds.js";

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

function matForGround(kind) {
  if (kind === "grass" || kind === "grass_dry" || kind === "moss" || kind === "leaf") return matOf("foliage");
  if (kind === "concrete" || kind === "concrete_worn" || kind === "brick" || kind === "cobble") return matOf("concrete");
  if (kind === "road" || kind === "asphalt" || kind === "tarmac") return matOf("rubber");
  if (kind === "gravel" || kind === "pebbles" || kind === "rock") return matOf("stone");
  if (kind === "wood" || kind === "wood_worn") return matOf("wood");
  if (kind === "snow") return matOf("default");
  if (kind === "metal" || kind === "rust" || kind === "tread" || kind === "hex" || kind === "polymer" || kind === "carbon" || kind === "grate" || kind === "hazard") {
    return matOf("metal");
  }
  if (kind === "tracks") return matOf("dirt");
  return matOf("dirt");
}

function snapXY(v) {
  return Math.round(v * 256) / 256;
}

function rectOf(min, max) {
  return { x0: snapXY(min.x), y0: snapXY(min.y), x1: snapXY(max.x), y1: snapXY(max.y) };
}

function cutRect(r, c) {
  const x0 = Math.max(r.x0, c.x0);
  const y0 = Math.max(r.y0, c.y0);
  const x1 = Math.min(r.x1, c.x1);
  const y1 = Math.min(r.y1, c.y1);
  if (x0 >= x1 || y0 >= y1) return [r];
  const out = [];
  if (r.y0 < y0) out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: y0 });
  if (y1 < r.y1) out.push({ x0: r.x0, y0: y1, x1: r.x1, y1: r.y1 });
  if (r.x0 < x0) out.push({ x0: r.x0, y0: y0, x1: x0, y1: y1 });
  if (x1 < r.x1) out.push({ x0: x1, y0: y0, x1: r.x1, y1: y1 });
  return out;
}

function cutAll(rects, cut) {
  const out = [];
  for (const r of rects) out.push(...cutRect(r, cut));
  return out;
}

function pushGroundQuad(out, r, kind, surface, fallback, z = 0) {
  if (r.x1 <= r.x0 || r.y1 <= r.y0) return;
  const hex = surface?.color || GROUND[kind] || GROUND[fallback];
  const mat = matForGround(kind);
  const tex = groundTexId(kind, surface?.tile);
  const rgb = tex ? [1, 1, 1] : tintGround(kind, hex, 0, 0);
  pushQuad(out, [
    { x: r.x0, y: r.y0, z }, { x: r.x1, y: r.y0, z },
    { x: r.x1, y: r.y1, z }, { x: r.x0, y: r.y1, z },
  ], rgb, 1, mat, tex);
}

export function pushGround(out, map) {
  if (!map?.min || !map?.max) return;
  const min = bounds(map.min);
  const max = bounds(map.max);
  const kind0 = map.ground || "dirt";
  const patches = [];
  let leftover = [rectOf(min, max)];
  for (const s of map.surfaces || []) {
    if (!s.min || !s.max) continue;
    const cut = rectOf(bounds(s.min), bounds(s.max));
    if (cut.x1 <= cut.x0 || cut.y1 <= cut.y0) continue;
    leftover = cutAll(leftover, cut);
    for (const patch of patches) patch.rects = cutAll(patch.rects, cut);
    patches.push({ kind: s.kind || kind0, surface: s, rects: [cut] });
  }
  pushGroundQuad(out, rectOf(min, max), kind0, null, kind0, -0.06);
  for (const r of leftover) pushGroundQuad(out, r, kind0, null, kind0);
  for (const patch of patches) {
    for (const r of patch.rects) pushGroundQuad(out, r, patch.kind, patch.surface, kind0);
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
      kind: dir.spot ? "spot" : "omni",
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      outerCos: dir.spot ? 0.42 : 0,
      innerCos: dir.spot ? 0.78 : 0,
    });
    if (lights.length >= MAX_SCENE_LIGHTS) break;
  }
  return lights;
}

export function mergeLights(boxes, placed) {
  const lights = [...(placed || [])];
  if (lights.length >= MAX_SCENE_LIGHTS) return lights.slice(0, MAX_SCENE_LIGHTS);
  const extra = collectLights(boxes);
  for (const L of extra) {
    lights.push(L);
    if (lights.length >= MAX_SCENE_LIGHTS) break;
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
    if (part.mat === "emit") continue;
    if (isPoleLike(part)) continue;
    pushBox(out, part.corners, [0, 0, 0], 1, matOf(part.mat), 0, 0);
  }
}
