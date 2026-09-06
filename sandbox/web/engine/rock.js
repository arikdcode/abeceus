/** Seeded boulder mesh. One local mesh per (seed, budget, extent); places instance it with pos/yaw. */

const cache = new Map();
const EPS = 1e-7;

function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm(a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function faceN(a, b, c) {
  return norm(cross(sub(b, a), sub(c, a)));
}

function centroid(verts) {
  let x = 0, y = 0, z = 0;
  for (const p of verts) {
    x += p.x; y += p.y; z += p.z;
  }
  const n = verts.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

function boundsOf(verts) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of verts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.z < z0) z0 = p.z;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
    if (p.z > z1) z1 = p.z;
  }
  return { x0, y0, z0, x1, y1, z1 };
}

function sitOnGround(verts) {
  let z0 = Infinity;
  for (const p of verts) if (p.z < z0) z0 = p.z;
  for (const p of verts) p.z -= z0;
}

function outwardFaces(verts, faces) {
  const mid = centroid(verts);
  return faces.map(([a, b, c]) => {
    const n = faceN(verts[a], verts[b], verts[c]);
    const fx = (verts[a].x + verts[b].x + verts[c].x) / 3 - mid.x;
    const fy = (verts[a].y + verts[b].y + verts[c].y) / 3 - mid.y;
    const fz = (verts[a].z + verts[b].z + verts[c].z) / 3 - mid.z;
    if (n.x * fx + n.y * fy + n.z * fz < 0) return [a, c, b];
    return [a, b, c];
  });
}

function onSphere(rand, rx, ry, rz) {
  const u = rand() * 2 - 1;
  const v = rand() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  return { x: s * Math.cos(v) * rx, y: s * Math.sin(v) * ry, z: u * rz };
}

function pointCloud(rand, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const stretch = 0.42 + rand() * 0.85;
    pts.push(onSphere(rand, stretch, 0.55 + rand() * 0.7, 0.48 + rand() * 0.55));
  }
  pts.push({ x: 0.12, y: 0.08, z: -0.48 - rand() * 0.12 });
  pts.push({ x: -0.08, y: -0.1, z: -0.46 - rand() * 0.1 });
  pts.push({ x: 0.42 + rand() * 0.12, y: 0.28 + rand() * 0.15, z: 0.52 + rand() * 0.18 });
  pts.push({ x: -0.4 - rand() * 0.1, y: 0.18, z: 0.48 + rand() * 0.16 });
  pts.push({ x: 0.08, y: -0.48 - rand() * 0.1, z: 0.42 + rand() * 0.14 });
  const facets = 3 + (rand() > 0.4 ? 1 : 0);
  for (let f = 0; f < facets; f++) {
    const nrm = norm({
      x: rand() - 0.5,
      y: rand() - 0.5,
      z: (rand() - 0.4) * 0.9,
    });
    const w = 0.32 + rand() * 0.28;
    const tangent = Math.abs(nrm.z) < 0.85 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const u = norm(cross(nrm, tangent));
    const v = norm(cross(nrm, u));
    const center = scale(nrm, w);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rand() * 0.3;
      const r = 0.22 + rand() * 0.18;
      pts.push(add(center, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r))));
    }
  }
  return pts;
}

function initialTetra(points) {
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.hypot(points[i].x, points[i].y, points[i].z) > Math.hypot(points[best].x, points[best].y, points[best].z)) best = i;
  }
  let far = 0;
  let farD = -1;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[best].x, points[i].y - points[best].y, points[i].z - points[best].z);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  let third = 0;
  let thirdD = -1;
  const ab = sub(points[far], points[best]);
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(...Object.values(cross(ab, sub(points[i], points[best]))));
    if (d > thirdD) {
      thirdD = d;
      third = i;
    }
  }
  const n = faceN(points[best], points[far], points[third]);
  let fourth = 0;
  let fourthD = -1;
  for (let i = 0; i < points.length; i++) {
    const d = Math.abs(dot(n, sub(points[i], points[best])));
    if (d > fourthD) {
      fourthD = d;
      fourth = i;
    }
  }
  const idx = [best, far, third, fourth];
  if (new Set(idx).size < 4) {
    return [0, 1, 2, 3];
  }
  return idx;
}

function convexHull(points) {
  const [i0, i1, i2, i3] = initialTetra(points);
  const verts = points.map((p) => ({ ...p }));
  let faces = outwardFaces(verts, [
    [i0, i1, i2], [i0, i2, i3], [i0, i3, i1], [i1, i3, i2],
  ]);
  const used = new Set([i0, i1, i2, i3]);
  for (let pi = 0; pi < verts.length; pi++) {
    if (used.has(pi)) continue;
    const p = verts[pi];
    const visible = [];
    for (let f = 0; f < faces.length; f++) {
      const [a, b, c] = faces[f];
      const n = faceN(verts[a], verts[b], verts[c]);
      if (dot(n, sub(p, verts[a])) > EPS) visible.push(f);
    }
    if (!visible.length) continue;
    const vis = new Set(visible);
    const edgeCount = new Map();
    const bump = (u, v) => {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    };
    for (const f of visible) {
      const [a, b, c] = faces[f];
      bump(a, b); bump(b, c); bump(c, a);
    }
    const horizon = [];
    for (const f of visible) {
      const [a, b, c] = faces[f];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        if (edgeCount.get(k) === 1) horizon.push([u, v]);
      }
    }
    faces = faces.filter((_, i) => !vis.has(i));
    for (const [u, v] of horizon) faces.push([u, v, pi]);
    used.add(pi);
  }
  const keep = new Set();
  for (const f of faces) for (const i of f) keep.add(i);
  const remap = new Map();
  const compact = [];
  for (const i of keep) {
    remap.set(i, compact.length);
    compact.push(verts[i]);
  }
  return {
    verts: compact,
    faces: outwardFaces(compact, faces.map((f) => f.map((i) => remap.get(i)))),
  };
}

function subdivide(verts, faces, rand, amount) {
  const mid = new Map();
  const outV = verts.map((p) => ({ ...p }));
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const midpoint = (a, b) => {
    const k = key(a, b);
    if (mid.has(k)) return mid.get(k);
    const idx = outV.length;
    const p = scale(add(verts[a], verts[b]), 0.5);
    const bump = (rand() - 0.35) * amount;
    outV.push(add(p, scale(norm(p), bump)));
    mid.set(k, idx);
    return idx;
  };
  const next = [];
  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { verts: outV, faces: outwardFaces(outV, next) };
}

function sculpt(seed, rand, budget) {
  const cloud = pointCloud(rand, 16 + Math.floor(rand() * 6));
  let mesh = convexHull(cloud);
  if (mesh.faces.length > 80 || mesh.faces.length < 8) {
    mesh = convexHull([
      { x: 0.9, y: 0.1, z: 0.2 }, { x: -0.8, y: 0.25, z: 0.15 },
      { x: 0.2, y: 0.85, z: 0.1 }, { x: 0.15, y: -0.8, z: 0.18 },
      { x: 0.35, y: 0.2, z: 0.75 }, { x: -0.2, y: -0.15, z: -0.7 },
      { x: 0.55, y: -0.45, z: 0.35 }, { x: -0.5, y: 0.4, z: 0.42 },
    ]);
  }
  sitOnGround(mesh.verts);
  let z1 = 0;
  for (const p of mesh.verts) if (p.z > z1) z1 = p.z;
  const flatten = z1 * 0.1;
  for (const p of mesh.verts) {
    if (p.z < flatten) p.z = 0;
  }
  sitOnGround(mesh.verts);
  if (budget >= 220 && mesh.faces.length <= 80 && mesh.faces.length * 4 <= budget) {
    mesh = subdivide(mesh.verts, mesh.faces, rand, 0.075);
  }
  return mesh;
}

function fitExtent(verts, extent) {
  const b = boundsOf(verts);
  const sx = (extent.x * 2) / Math.max(b.x1 - b.x0, 0.2);
  const sy = (extent.y * 2) / Math.max(b.y1 - b.y0, 0.2);
  const sz = extent.z / Math.max(b.z1 - b.z0, 0.2);
  const cx = (b.x0 + b.x1) * 0.5;
  const cy = (b.y0 + b.y1) * 0.5;
  for (const p of verts) {
    p.x = (p.x - cx) * sx;
    p.y = (p.y - cy) * sy;
    p.z = (p.z - b.z0) * sz;
  }
}

function parseExtent(raw) {
  if (Array.isArray(raw)) return { x: raw[0], y: raw[1], z: raw[2] };
  if (raw && raw.x != null) return { x: raw.x, y: raw.y, z: raw.z };
  return { x: 1.15, y: 0.98, z: 1.36 };
}

function rockKey(opts) {
  const e = parseExtent(opts.extent);
  return `${opts.seed | 0}|${opts.budget || 480}|${e.x.toFixed(3)},${e.y.toFixed(3)},${e.z.toFixed(3)}`;
}

function generateRock(opts = {}) {
  const seed = (opts.seed ?? 1) | 0;
  const budget = Math.max(80, Math.min(opts.budget ?? 480, 1400));
  const extent = parseExtent(opts.extent);
  const rand = mulberry(seed * 997 + 13);
  const main = sculpt(seed, rand, budget);
  const used = main.faces.length;
  const chipBudget = Math.min(120, budget - used);
  if (chipBudget >= 48 && (seed === 1 || rand() > 0.12)) {
    const chip = sculpt(seed + 91, rand, chipBudget);
    if (used + chip.faces.length <= budget) {
      const ox = (0.46 + rand() * 0.2) * extent.x * (rand() > 0.5 ? 1 : -1);
      const oy = (0.3 + rand() * 0.18) * extent.y * (rand() > 0.5 ? 1 : -1);
      fitExtent(chip.verts, {
        x: extent.x * (0.34 + rand() * 0.14),
        y: extent.y * (0.3 + rand() * 0.14),
        z: extent.z * (0.38 + rand() * 0.18),
      });
      const base = main.verts.length;
      for (const p of chip.verts) {
        p.x += ox;
        p.y += oy;
        main.verts.push(p);
      }
      for (const f of chip.faces) main.faces.push([f[0] + base, f[1] + base, f[2] + base]);
    }
  }
  fitExtent(main.verts, extent);
  sitOnGround(main.verts);
  return {
    key: rockKey(opts),
    seed,
    budget,
    verts: main.verts,
    faces: main.faces,
    bounds: boundsOf(main.verts),
  };
}

export function rockMesh(opts = {}) {
  const key = rockKey({ seed: opts.seed ?? 1, budget: opts.budget ?? 480, extent: opts.extent });
  let mesh = cache.get(key);
  if (!mesh) {
    mesh = generateRock({ ...opts, seed: opts.seed ?? 1 });
    cache.set(key, mesh);
  }
  return mesh;
}

export function transformMesh(mesh, pos, yaw) {
  const c = Math.cos(yaw || 0);
  const s = Math.sin(yaw || 0);
  const verts = mesh.verts.map((p) => ({
    x: p.x * c - p.y * s + (pos?.x || 0),
    y: p.x * s + p.y * c + (pos?.y || 0),
    z: p.z + (pos?.z || 0),
  }));
  return {
    key: mesh.key,
    seed: mesh.seed,
    budget: mesh.budget,
    verts,
    faces: mesh.faces,
    bounds: boundsOf(verts),
  };
}

export function rockOptsFrom(def, place) {
  const seed = place.seed != null
    ? place.seed
    : place.id
      ? hashSeed(place.id)
      : (def.seed ?? 1);
  return {
    seed,
    budget: place.budget ?? def.budget ?? 480,
    extent: place.extent || def.extent || [1.18, 1.02, 1.36],
  };
}
