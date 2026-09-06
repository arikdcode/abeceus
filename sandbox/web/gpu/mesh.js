export const LIT_STRIDE = 16;
export const OVERLAY_STRIDE = 8;
export const TEXT_STRIDE = 12;

const FACE = [
  [0, 2, 3, 1],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 4, 6, 2],
  [1, 3, 7, 5],
];

export class MeshWriter {
  constructor(stride) {
    this.stride = stride;
    this.data = new Float32Array(stride * 2048);
    this.n = 0;
  }

  reset() {
    this.n = 0;
  }

  vertexCount() {
    return this.n / this.stride;
  }

  view() {
    return this.data.subarray(0, this.n);
  }

  _room(floats) {
    if (this.n + floats <= this.data.length) return;
    const next = new Float32Array(Math.max(this.n + floats, this.data.length * 2));
    next.set(this.data.subarray(0, this.n));
    this.data = next;
  }

  push(values) {
    this._room(values.length);
    this.data.set(values, this.n);
    this.n += values.length;
  }
}

function faceNormal(a, b, c) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / l, y: ny / l, z: nz / l };
}

export function pushLit(out, p, n, rgb, alpha, mat, tex, emit) {
  out.push([
    p.x, p.y, p.z, tex,
    n.x, n.y, n.z, emit,
    rgb[0], rgb[1], rgb[2], alpha,
    mat.spec || 0, mat.shine || 16, mat.wrap || 0, 0,
  ]);
}

export function pushTri(out, a, b, c, n, rgb, alpha, mat, tex, emit) {
  pushLit(out, a, n, rgb, alpha, mat, tex, emit);
  pushLit(out, b, n, rgb, alpha, mat, tex, emit);
  pushLit(out, c, n, rgb, alpha, mat, tex, emit);
}

export function pushQuad(out, pts, rgb, alpha, mat, tex = 0, emit = 0, n = { x: 0, y: 0, z: 1 }) {
  pushTri(out, pts[0], pts[1], pts[2], n, rgb, alpha, mat, tex, emit);
  pushTri(out, pts[0], pts[2], pts[3], n, rgb, alpha, mat, tex, emit);
}

export function pushBox(out, corners, rgb, alpha, mat, tex = 0, emit = 0) {
  if (!corners || corners.length < 8) return;
  for (const idx of FACE) {
    const a = corners[idx[0]];
    const b = corners[idx[1]];
    const c = corners[idx[2]];
    const d = corners[idx[3]];
    const n = faceNormal(a, b, c);
    pushTri(out, a, b, c, n, rgb, alpha, mat, tex, emit);
    pushTri(out, a, c, d, n, rgb, alpha, mat, tex, emit);
  }
}

export function pushOverlay(out, p, rgba) {
  out.push([p.x, p.y, p.z, 0, rgba[0], rgba[1], rgba[2], rgba[3]]);
}

export function pushOverlayTri(out, a, b, c, rgba) {
  pushOverlay(out, a, rgba);
  pushOverlay(out, b, rgba);
  pushOverlay(out, c, rgba);
}

export function pushOverlayQuad(out, pts, rgba) {
  pushOverlayTri(out, pts[0], pts[1], pts[2], rgba);
  pushOverlayTri(out, pts[0], pts[2], pts[3], rgba);
}

export function pushLine(out, a, b, rgba, width, side) {
  const hx = side.x * width * 0.5;
  const hy = side.y * width * 0.5;
  const hz = side.z * width * 0.5;
  pushOverlayQuad(out, [
    { x: a.x - hx, y: a.y - hy, z: a.z - hz },
    { x: b.x - hx, y: b.y - hy, z: b.z - hz },
    { x: b.x + hx, y: b.y + hy, z: b.z + hz },
    { x: a.x + hx, y: a.y + hy, z: a.z + hz },
  ], rgba);
}

export function lineSideXY(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: -dy / l, y: dx / l, z: 0 };
}

function walkDashes(pts, dash = 0.38, gap = 0.22) {
  const segs = [];
  let carry = 0;
  let draw = true;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) continue;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let t = 0;
    while (t < len - 1e-5) {
      const span = draw ? dash : gap;
      const left = span - carry;
      const take = Math.min(left, len - t);
      const x0 = a.x + ux * t;
      const y0 = a.y + uy * t;
      const z0 = (a.z || 0) + uz * t;
      t += take;
      carry += take;
      if (draw) {
        segs.push([
          { x: x0, y: y0, z: z0 },
          { x: a.x + ux * t, y: a.y + uy * t, z: (a.z || 0) + uz * t },
        ]);
      }
      if (carry + 1e-6 >= span) {
        carry = 0;
        draw = !draw;
      }
    }
  }
  return segs;
}

export function pushPolyline(out, pts, rgba, width, dashed = false, sideOf) {
  if (!pts || pts.length < 2) return;
  const pairs = dashed ? walkDashes(pts) : pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
  for (const [a, b] of pairs) {
    const side = sideOf ? sideOf(a, b) : lineSideXY(a, b);
    pushLine(out, a, b, rgba, width, side);
  }
}

export function pushRing(out, origin, radius, rgba, width, z = 0.05) {
  const n = 40;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({
      x: origin.x + Math.cos(a) * radius,
      y: origin.y + Math.sin(a) * radius,
      z,
    });
  }
  pushPolyline(out, pts, rgba, width, true);
}

export function pushDisc(out, origin, radius, rgba, z = 0.04) {
  const n = 28;
  const c = { x: origin.x, y: origin.y, z };
  let prev = { x: origin.x + radius, y: origin.y, z };
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const next = { x: origin.x + Math.cos(a) * radius, y: origin.y + Math.sin(a) * radius, z };
    pushOverlayTri(out, c, prev, next, rgba);
    prev = next;
  }
}

export function pushBoxEdges(out, corners, rgba, width, basis) {
  if (!corners || corners.length < 8) return;
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const side = { x: basis.r.x, y: basis.r.y, z: basis.r.z };
  for (const [i, j] of edges) pushLine(out, corners[i], corners[j], rgba, width, side);
}

const GLYPH_W = 8;
const GLYPH_H = 12;
const ATLAS_COLS = 16;

export function pushLabel(out, screen, text, rgba, scale = 1) {
  if (!screen || !text) return;
  const w = GLYPH_W * scale;
  const h = GLYPH_H * scale;
  const x0 = screen.x - text.length * w * 0.5;
  const y0 = screen.y - h;
  const z = screen.z;
  for (let i = 0; i < text.length; i++) {
    const code = Math.max(32, Math.min(126, text.charCodeAt(i)));
    const idx = code - 32;
    const u0 = (idx % ATLAS_COLS) / ATLAS_COLS;
    const v0 = Math.floor(idx / ATLAS_COLS) / 6;
    const u1 = u0 + 1 / ATLAS_COLS;
    const v1 = v0 + 1 / 6;
    const x = x0 + i * w;
    const quad = [
      [x, y0, z, u0, v0],
      [x + w, y0, z, u1, v0],
      [x + w, y0 + h, z, u1, v1],
      [x, y0 + h, z, u0, v1],
    ];
    const order = [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      const q = quad[k];
      out.push([q[0], q[1], q[2], 0, q[3], q[4], 0, 0, rgba[0], rgba[1], rgba[2], rgba[3]]);
    }
  }
}
