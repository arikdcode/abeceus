/**
 * ReSTIR-inspired many-light packing + AABB occupancy grid.
 * Visibility is a ray vs world AABBs (works for today's slabs; future meshes
 * can feed the same grid from their bounds).
 */
import { LIGHTS_PER_CELL, MAX_OCCLUDERS, MAX_SCENE_LIGHTS, OCCLUDER_CELL } from "./theme.js";
import { isPoleLike } from "./world.js";

export const LIGHT_TEXELS = 4;
export const OCC_TEXELS = 2;

function bounds(p) {
  if (!p) return { x: 0, y: 0 };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

export function partSpan(part) {
  if (part?.x0 != null && part.x1 != null) {
    return {
      x0: part.x0, x1: part.x1,
      y0: part.y0, y1: part.y1,
      z0: part.z0 ?? 0, z1: part.z1 ?? part.height ?? 0,
    };
  }
  const corners = part?.corners;
  if (!corners?.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of corners) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  return { x0, x1, y0, y1, z0, z1 };
}

export function packLights(lights, max = MAX_SCENE_LIGHTS) {
  const n = Math.min(lights?.length || 0, max);
  const data = new Float32Array(Math.max(1, n) * LIGHT_TEXELS * 4);
  for (let i = 0; i < n; i++) {
    const L = lights[i];
    const o = i * 16;
    data[o] = L.x;
    data[o + 1] = L.y;
    data[o + 2] = L.z;
    data[o + 3] = L.range;
    data[o + 4] = L.r;
    data[o + 5] = L.g;
    data[o + 6] = L.b;
    data[o + 7] = L.intensity;
    data[o + 8] = L.dx || 0;
    data[o + 9] = L.dy || 0;
    data[o + 10] = L.dz || 0;
    const spot = L.kind === "spot" || (L.dx || 0) ** 2 + (L.dy || 0) ** 2 + (L.dz || 0) ** 2 > 0.05;
    data[o + 11] = spot ? 1 : 0;
    data[o + 12] = spot ? 0.12 : 0.32;
    data[o + 13] = spot ? (L.outerCos ?? 0.42) : 0;
    data[o + 14] = spot ? (L.innerCos ?? 0.78) : 0;
    data[o + 15] = 0;
  }
  return { n, data, width: LIGHT_TEXELS, height: Math.max(1, n) };
}

export function collectOccluders(solids, max = MAX_OCCLUDERS) {
  const boxes = [];
  for (const part of solids || []) {
    if (part.ghost) continue;
    if ((part.emit || 0) > 0) continue;
    if (part.mat === "emit") continue;
    if (part.origin) continue;
    if (isPoleLike(part)) continue;
    const e = partSpan(part);
    if (!e) continue;
    const sx = e.x1 - e.x0;
    const sy = e.y1 - e.y0;
    const sz = e.z1 - e.z0;
    if (sx * sy * sz < 1e-4) continue;
    boxes.push(e);
    if (boxes.length >= max) break;
  }
  return boxes;
}

export function packOccluders(boxes) {
  const n = boxes.length;
  const data = new Float32Array(Math.max(1, n) * OCC_TEXELS * 4);
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    const o = i * 8;
    data[o] = b.x0;
    data[o + 1] = b.y0;
    data[o + 2] = b.z0;
    data[o + 3] = b.x1;
    data[o + 4] = b.y1;
    data[o + 5] = b.z1;
    data[o + 6] = 0;
    data[o + 7] = 0;
  }
  return { n, data, width: OCC_TEXELS, height: Math.max(1, n) };
}

export function buildOccluderGrid(boxes, map, cell = OCCLUDER_CELL) {
  const min = map?.min ? bounds(map.min) : { x: 0, y: 0 };
  const max = map?.max ? bounds(map.max) : { x: 64, y: 48 };
  const pad = 2;
  const x0 = min.x - pad;
  const y0 = min.y - pad;
  const cols = Math.max(1, Math.ceil((max.x - min.x + pad * 2) / cell));
  const rows = Math.max(1, Math.ceil((max.y - min.y + pad * 2) / cell));
  const buckets = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const c0 = Math.max(0, Math.floor((b.x0 - x0) / cell));
    const c1 = Math.min(cols - 1, Math.floor((b.x1 - x0) / cell));
    const r0 = Math.max(0, Math.floor((b.y0 - y0) / cell));
    const r1 = Math.min(rows - 1, Math.floor((b.y1 - y0) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) buckets[r * cols + c].push(i);
    }
  }
  let total = 0;
  for (const b of buckets) total += b.length;
  const header = new Uint32Array(cols * rows * 2);
  const indices = new Uint32Array(Math.max(1, total));
  let cursor = 0;
  for (let i = 0; i < buckets.length; i++) {
    header[i * 2] = cursor;
    header[i * 2 + 1] = buckets[i].length;
    for (const id of buckets[i]) indices[cursor++] = id;
  }
  return { cols, rows, cell, x0, y0, header, indices, count: boxes.length };
}

function cellTouchesLight(L, x0, y0, cell, c, r) {
  const reach = Math.max(L.range || 0, 0.5);
  const cx0 = x0 + c * cell;
  const cy0 = y0 + r * cell;
  const qx = Math.min(cx0 + cell, Math.max(cx0, L.x));
  const qy = Math.min(cy0 + cell, Math.max(cy0, L.y));
  return Math.hypot(L.x - qx, L.y - qy) <= reach;
}

export function buildLightGrid(lights, grid, maxPer = LIGHTS_PER_CELL) {
  const { cols, rows, cell, x0, y0 } = grid;
  const buckets = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    const reach = Math.max(L.range || 0, 0.5);
    const c0 = Math.max(0, Math.floor((L.x - reach - x0) / cell));
    const c1 = Math.min(cols - 1, Math.floor((L.x + reach - x0) / cell));
    const r0 = Math.max(0, Math.floor((L.y - reach - y0) / cell));
    const r1 = Math.min(rows - 1, Math.floor((L.y + reach - y0) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (cellTouchesLight(L, x0, y0, cell, c, r)) buckets[r * cols + c].push(i);
      }
    }
  }
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.length <= maxPer) continue;
    const r = Math.floor(i / cols);
    const c = i - r * cols;
    const mx = x0 + (c + 0.5) * cell;
    const my = y0 + (r + 0.5) * cell;
    b.sort((ia, ib) => {
      const da = Math.hypot(lights[ia].x - mx, lights[ia].y - my);
      const db = Math.hypot(lights[ib].x - mx, lights[ib].y - my);
      return da - db;
    });
    b.length = maxPer;
  }
  let total = 0;
  for (const b of buckets) total += b.length;
  const header = new Uint32Array(cols * rows * 2);
  const indices = new Uint32Array(Math.max(1, total));
  let cursor = 0;
  for (let i = 0; i < buckets.length; i++) {
    header[i * 2] = cursor;
    header[i * 2 + 1] = buckets[i].length;
    for (const id of buckets[i]) indices[cursor++] = id;
  }
  return { cols, rows, cell, x0, y0, header, indices, count: lights.length };
}

export function lightsInCell(lgrid, x, y) {
  const c = Math.floor((x - lgrid.x0) / lgrid.cell);
  const r = Math.floor((y - lgrid.y0) / lgrid.cell);
  if (c < 0 || r < 0 || c >= lgrid.cols || r >= lgrid.rows) return [];
  const cell = r * lgrid.cols + c;
  const off = lgrid.header[cell * 2];
  const n = lgrid.header[cell * 2 + 1];
  const out = [];
  for (let i = 0; i < n; i++) out.push(lgrid.indices[off + i]);
  return out;
}

export function rayAabb(o, d, b, maxT) {
  let t0 = 0;
  let t1 = maxT;
  const axes = [
    [o.x, d.x, b.x0, b.x1],
    [o.y, d.y, b.y0, b.y1],
    [o.z, d.z, b.z0, b.z1],
  ];
  for (const [p, dir, mn, mx] of axes) {
    const den = Math.abs(dir) < 1e-12 ? (dir < 0 ? -1e-12 : 1e-12) : dir;
    let a = (mn - p) / den;
    let c = (mx - p) / den;
    if (a > c) {
      const t = a;
      a = c;
      c = t;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t1 < t0) return null;
  }
  return t0 <= maxT ? t0 : null;
}

function lightOwnsBox(L, b) {
  const rad = 0.45;
  const cx = (b.x0 + b.x1) * 0.5;
  const cy = (b.y0 + b.y1) * 0.5;
  const cz = (b.z0 + b.z1) * 0.5;
  return Math.hypot(L.x - cx, L.y - cy, L.z - cz) < rad + Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0) * 0.15;
}

export function occluded(origin, light, boxes, grid) {
  const dx = light.x - origin.x;
  const dy = light.y - origin.y;
  const dz = light.z - origin.z;
  const maxT = Math.hypot(dx, dy, dz);
  if (maxT < 1e-4) return false;
  const d = { x: dx / maxT, y: dy / maxT, z: dz / maxT };
  const o = {
    x: origin.x + d.x * 0.10,
    y: origin.y + d.y * 0.10,
    z: origin.z + d.z * 0.10,
  };
  const reach = maxT - 0.16;
  if (!grid) {
    for (const b of boxes) {
      if (lightOwnsBox(light, b)) continue;
      const t = rayAabb(o, d, b, reach);
      if (t != null && t > 0.001) return true;
    }
    return false;
  }
  let t = 0;
  const invX = d.x !== 0 ? 1 / d.x : 1e12;
  const invY = d.y !== 0 ? 1 / d.y : 1e12;
  let cx = Math.floor((o.x - grid.x0) / grid.cell);
  let cy = Math.floor((o.y - grid.y0) / grid.cell);
  const stepX = d.x > 0 ? 1 : -1;
  const stepY = d.y > 0 ? 1 : -1;
  const seen = new Set();
  for (let hop = 0; hop < grid.cols + grid.rows + 2 && t < reach; hop++) {
    if (cx >= 0 && cy >= 0 && cx < grid.cols && cy < grid.rows) {
      const cell = cy * grid.cols + cx;
      const off = grid.header[cell * 2];
      const n = grid.header[cell * 2 + 1];
      for (let i = 0; i < n; i++) {
        const id = grid.indices[off + i];
        if (seen.has(id)) continue;
        seen.add(id);
        const b = boxes[id];
        if (lightOwnsBox(light, b)) continue;
        const hit = rayAabb(o, d, b, reach);
        if (hit != null && hit > 0.001) return true;
      }
    }
    const nx = grid.x0 + (cx + (stepX > 0 ? 1 : 0)) * grid.cell;
    const ny = grid.y0 + (cy + (stepY > 0 ? 1 : 0)) * grid.cell;
    const tx = d.x !== 0 ? (nx - o.x) * invX : 1e9;
    const ty = d.y !== 0 ? (ny - o.y) * invY : 1e9;
    if (tx < ty) {
      t = tx;
      cx += stepX;
    } else {
      t = ty;
      cy += stepY;
    }
  }
  return false;
}

export function makeReservoir() {
  return { y: -1, wsum: 0, m: 0, w: 0, phat: 0 };
}

export function reservoirUpdate(r, y, phat, w, u) {
  r.wsum += w;
  r.m += 1;
  if (r.wsum <= 0) return r;
  if (u * r.wsum < w || r.y < 0) {
    r.y = y;
    r.phat = phat;
  }
  r.w = r.phat > 0 ? r.wsum / (r.m * r.phat) : 0;
  return r;
}

export function reservoirCombine(a, b, u, mCap = 20) {
  if (b.m <= 0 || b.y < 0) return a;
  const merged = { ...a };
  const w = b.phat * b.w * b.m;
  reservoirUpdate(merged, b.y, b.phat, w, u);
  merged.m = Math.min(mCap, a.m + b.m);
  merged.w = merged.phat > 0 ? merged.wsum / (merged.m * merged.phat) : 0;
  return merged;
}
