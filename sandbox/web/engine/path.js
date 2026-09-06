import { add, sub, scale, length, normalize, pointInAabb } from "./vec.js";
import { coverBlocksMove } from "./cover.js";

const PERSON_R = 0.28;
const CLEAR = 0.12;
const HASH_CELL = 4;
const NAV_CELL = 0.5;
const REACH = 0.22;
const MAX_EXPAND = 14000;

const navCache = new WeakMap();
let lastQuery = null;

function coverHitsPoint(c, p) {
  return p.x >= c.min.x - CLEAR && p.x <= c.max.x + CLEAR
    && p.y >= c.min.y - CLEAR && p.y <= c.max.y + CLEAR;
}

function mapMin(map) {
  return { x: map.min.x ?? map.min[0], y: map.min.y ?? map.min[1] };
}

function mapMax(map) {
  return { x: map.max.x ?? map.max[0], y: map.max.y ?? map.max[1] };
}

function moveIndex(map) {
  const blockers = [];
  for (const c of map.cover) {
    if (coverBlocksMove(c)) blockers.push(c);
  }
  const grid = new Map();
  for (const c of blockers) {
    const x0 = Math.floor((c.min.x - CLEAR) / HASH_CELL);
    const x1 = Math.floor((c.max.x + CLEAR) / HASH_CELL);
    const y0 = Math.floor((c.min.y - CLEAR) / HASH_CELL);
    const y1 = Math.floor((c.max.y + CLEAR) / HASH_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const k = ix * 4096 + iy;
        let bin = grid.get(k);
        if (!bin) {
          bin = [];
          grid.set(k, bin);
        }
        bin.push(c);
      }
    }
  }
  return { blockers, grid };
}

function blockedAt(idx, map, p) {
  const min = mapMin(map);
  const max = mapMax(map);
  const insetMin = { x: min.x + PERSON_R, y: min.y + PERSON_R };
  const insetMax = { x: max.x - PERSON_R, y: max.y - PERSON_R };
  if (!pointInAabb(p, insetMin, insetMax)) return true;
  const bin = idx.grid.get(Math.floor(p.x / HASH_CELL) * 4096 + Math.floor(p.y / HASH_CELL));
  if (!bin) return false;
  for (const c of bin) {
    if (coverHitsPoint(c, p)) return true;
  }
  return false;
}

function slide(map, from, to, idx) {
  const delta = sub(to, from);
  const dist = length(delta);
  if (dist < 1e-5) return { ...from };
  const dir = scale(delta, 1 / dist);
  const steps = Math.max(6, Math.floor(dist / 0.08));
  let last = { ...from };
  for (let i = 1; i <= steps; i++) {
    const p = add(from, scale(dir, (dist * i) / steps));
    if (blockedAt(idx, map, p)) break;
    last = p;
  }
  return last;
}

function reachable(idx, map, a, b) {
  return length(sub(slide(map, a, b, idx), b)) < REACH;
}

function navStamp(map) {
  let h = (map.cover?.length || 0) * 1009;
  for (const c of map.cover || []) {
    if (!coverBlocksMove(c)) continue;
    h = (Math.imul(h, 33) + ((c.min.x * 10) | 0) + ((c.max.x * 7) | 0) + ((c.min.y * 5) | 0) + ((c.durability || 0) * 3 | 0)) | 0;
  }
  return h;
}

function navGrid(map) {
  const stamp = navStamp(map);
  const hit = navCache.get(map);
  if (hit && hit.stamp === stamp) return hit;
  const idx = moveIndex(map);
  const min = mapMin(map);
  const max = mapMax(map);
  const cols = Math.max(1, Math.ceil((max.x - min.x) / NAV_CELL));
  const rows = Math.max(1, Math.ceil((max.y - min.y) / NAV_CELL));
  const walk = new Uint8Array(cols * rows);
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const p = {
        x: min.x + (ix + 0.5) * NAV_CELL,
        y: min.y + (iy + 0.5) * NAV_CELL,
      };
      walk[iy * cols + ix] = blockedAt(idx, map, p) ? 0 : 1;
    }
  }
  const built = { stamp, idx, min, cols, rows, walk };
  navCache.set(map, built);
  return built;
}

function cellOf(nav, p) {
  const ix = Math.max(0, Math.min(nav.cols - 1, Math.floor((p.x - nav.min.x) / NAV_CELL)));
  const iy = Math.max(0, Math.min(nav.rows - 1, Math.floor((p.y - nav.min.y) / NAV_CELL)));
  return { ix, iy };
}

function cellCenter(nav, ix, iy) {
  return {
    x: nav.min.x + (ix + 0.5) * NAV_CELL,
    y: nav.min.y + (iy + 0.5) * NAV_CELL,
  };
}

function walkable(nav, ix, iy) {
  if (ix < 0 || iy < 0 || ix >= nav.cols || iy >= nav.rows) return false;
  return nav.walk[iy * nav.cols + ix] === 1;
}

function nearestWalkable(nav, p) {
  const seed = cellOf(nav, p);
  if (walkable(nav, seed.ix, seed.iy)) return seed;
  const cap = 16;
  for (let r = 1; r <= cap; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const cells = [
        { ix: seed.ix + dx, iy: seed.iy - r },
        { ix: seed.ix + dx, iy: seed.iy + r },
      ];
      for (const c of cells) if (walkable(nav, c.ix, c.iy)) return c;
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      const cells = [
        { ix: seed.ix - r, iy: seed.iy + dy },
        { ix: seed.ix + r, iy: seed.iy + dy },
      ];
      for (const c of cells) if (walkable(nav, c.ix, c.iy)) return c;
    }
  }
  return null;
}

function octile(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return (ax + ay) + (Math.SQRT2 - 2) * Math.min(ax, ay);
}

function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].f <= heap[i].f) break;
    const tmp = heap[p];
    heap[p] = heap[i];
    heap[i] = tmp;
    i = p;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (!heap.length) return top;
  heap[0] = last;
  let i = 0;
  for (;;) {
    let s = i;
    const l = i * 2 + 1;
    const r = l + 1;
    if (l < heap.length && heap[l].f < heap[s].f) s = l;
    if (r < heap.length && heap[r].f < heap[s].f) s = r;
    if (s === i) break;
    const tmp = heap[i];
    heap[i] = heap[s];
    heap[s] = tmp;
    i = s;
  }
  return top;
}

const NBR = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function astar(nav, start, goal) {
  const w = nav.cols;
  const n = w * nav.rows;
  const gScore = new Float32Array(n);
  gScore.fill(1e30);
  const parent = new Int32Array(n);
  parent.fill(-1);
  const si = start.iy * w + start.ix;
  const gi = goal.iy * w + goal.ix;
  gScore[si] = 0;
  const heap = [{ i: si, g: 0, f: octile(goal.ix - start.ix, goal.iy - start.iy) }];
  let expands = 0;
  let best = si;
  let bestH = octile(goal.ix - start.ix, goal.iy - start.iy);
  while (heap.length) {
    const cur = heapPop(heap);
    if (cur.g > gScore[cur.i] + 1e-4) continue;
    const cx = cur.i % w;
    const cy = (cur.i / w) | 0;
    const ch = octile(goal.ix - cx, goal.iy - cy);
    if (ch < bestH - 1e-6 || (Math.abs(ch - bestH) < 1e-6 && cur.g < gScore[best])) {
      best = cur.i;
      bestH = ch;
    }
    if (cur.i === gi) {
      best = gi;
      break;
    }
    const cg = cur.g;
    if (++expands > MAX_EXPAND) break;
    for (const [dx, dy, cost] of NBR) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(nav, nx, ny)) continue;
      if (dx && dy && (!walkable(nav, cx + dx, cy) || !walkable(nav, cx, cy + dy))) continue;
      const ni = ny * w + nx;
      const ng = cg + cost;
      if (ng + 1e-4 >= gScore[ni]) continue;
      gScore[ni] = ng;
      parent[ni] = cur.i;
      heapPush(heap, { i: ni, g: ng, f: ng + octile(goal.ix - nx, goal.iy - ny) });
    }
  }
  const end = parent[gi] >= 0 || gi === si ? gi : best;
  if (end !== si && parent[end] < 0) return null;
  const cells = [];
  let i = end;
  cells.push(i);
  while (i !== si && i >= 0) {
    i = parent[i];
    if (i < 0) return null;
    cells.push(i);
  }
  cells.reverse();
  return cells.map((id) => cellCenter(nav, id % w, (id / w) | 0));
}

function stringPull(idx, map, pts) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let best = i + 1;
    for (let j = i + 2; j < pts.length; j++) {
      if (!reachable(idx, map, pts[i], pts[j])) break;
      best = j;
    }
    out.push(pts[best]);
    i = best;
  }
  return out;
}

function pathLen(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += length(sub(pts[i], pts[i - 1]));
  return d;
}

export function walkAlong(points, maxDist) {
  if (!points?.length) return { pos: { x: 0, y: 0 }, dist: 0, points: [] };
  if (points.length === 1 || !(maxDist > 0)) {
    return { pos: { ...points[0] }, dist: 0, points: [{ ...points[0] }] };
  }
  let left = maxDist;
  const out = [{ ...points[0] }];
  let pos = { ...points[0] };
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const span = length(sub(points[i], pos));
    if (span <= 1e-6) continue;
    if (span <= left + 1e-6) {
      pos = { ...points[i] };
      left -= span;
      dist += span;
      out.push(pos);
      continue;
    }
    pos = add(pos, scale(normalize(sub(points[i], pos)), left));
    dist += left;
    out.push({ ...pos });
    break;
  }
  return { pos, dist, points: out };
}

export function pathFind(map, from, to) {
  if (lastQuery && lastQuery.map === map && lastQuery.stamp === navStamp(map)
    && Math.hypot(from.x - lastQuery.from.x, from.y - lastQuery.from.y) < 0.18
    && Math.hypot(to.x - lastQuery.to.x, to.y - lastQuery.to.y) < 0.28) {
    return lastQuery.result;
  }
  const nav = navGrid(map);
  const idx = nav.idx;
  const start = { x: from.x, y: from.y };
  const goal = { x: to.x, y: to.y };
  if (!blockedAt(idx, map, start) && reachable(idx, map, start, goal)) {
    const points = [start, goal];
    return { ok: true, points, dist: length(sub(goal, start)) };
  }
  const a = nearestWalkable(nav, start);
  const b = nearestWalkable(nav, goal);
  if (!a || !b) {
    const slid = slide(map, start, goal, idx);
    return { ok: length(sub(slid, start)) > 0.04, points: [start, slid], dist: length(sub(slid, start)) };
  }
  const cells = astar(nav, a, b);
  if (!cells || !cells.length) {
    const slid = slide(map, start, goal, idx);
    return { ok: length(sub(slid, start)) > 0.04, points: [start, slid], dist: length(sub(slid, start)) };
  }
  if (length(sub(cells[0], start)) > 0.04) cells.unshift(start);
  else cells[0] = start;
  const last = cells[cells.length - 1];
  if (!blockedAt(idx, map, goal) && reachable(idx, map, last, goal)) {
    if (length(sub(last, goal)) > 0.04) cells.push(goal);
    else cells[cells.length - 1] = goal;
  }
  const pulled = stringPull(idx, map, cells);
  const result = { ok: pulled.length > 1, points: pulled, dist: pathLen(pulled) };
  lastQuery = { map, stamp: nav.stamp, from: { ...start }, to: { ...goal }, result };
  return result;
}

export function followPath(map, from, to, maxDist = 1e9) {
  const found = pathFind(map, from, to);
  if (!found.ok) {
    return { pos: { ...from }, dist: 0, points: [{ ...from }], reached: false };
  }
  const walked = walkAlong(found.points, maxDist);
  walked.reached = length(sub(walked.pos, found.points[found.points.length - 1])) < 0.12;
  return walked;
}

export function pathMove(map, from, to, opts = {}) {
  const walked = followPath(map, from, to, opts.maxDist ?? 1e9);
  return walked.pos;
}
