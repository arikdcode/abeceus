import { LAMP_FACES, MAX_LAMP_SHADOWS, MAX_SPOT_SHADOWS, SPOT_HALF_TAN, SUN } from "./theme.js";

function bounds(p) {
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function basisFromForward(f, upHint = { x: 0, y: 0, z: 1 }) {
  const fwd = norm(f);
  let r = cross(fwd, upHint);
  if (Math.hypot(r.x, r.y, r.z) < 1e-4) r = cross(fwd, { x: 0, y: 1, z: 0 });
  r = norm(r);
  return { r, u: norm(cross(r, fwd)), f: fwd };
}

function mapCorners(map, z0 = 0, z1 = 10) {
  if (!map?.min || !map?.max) return [];
  const min = bounds(map.min);
  const max = bounds(map.max);
  const pad = 2;
  const corners = [];
  for (const x of [min.x - pad, max.x + pad]) {
    for (const y of [min.y - pad, max.y + pad]) {
      for (const z of [z0, z1]) corners.push({ x, y, z });
    }
  }
  return corners;
}

export function sunShadowCam(map, sun = SUN) {
  const f = norm({ x: -sun.x, y: -sun.y, z: -sun.z });
  const { r, u } = basisFromForward(f, { x: 0, y: 0, z: 1 });
  const pts = mapCorners(map);
  const mid = pts.length
    ? {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
    }
    : { x: 0, y: 0, z: 2 };
  const eye = { x: mid.x - f.x * 90, y: mid.y - f.y * 90, z: mid.z - f.z * 90 };
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    const vx = (p.x - eye.x) * r.x + (p.y - eye.y) * r.y + (p.z - eye.z) * r.z;
    const vy = (p.x - eye.x) * u.x + (p.y - eye.y) * u.y + (p.z - eye.z) * u.z;
    const vz = (p.x - eye.x) * f.x + (p.y - eye.y) * f.y + (p.z - eye.z) * f.z;
    if (vx < minX) minX = vx;
    if (vx > maxX) maxX = vx;
    if (vy < minY) minY = vy;
    if (vy > maxY) maxY = vy;
    if (vz < minZ) minZ = vz;
    if (vz > maxZ) maxZ = vz;
  }
  if (!pts.length) {
    minX = -20; maxX = 20; minY = -20; maxY = 20; minZ = 1; maxZ = 160;
  }
  const padX = (maxX - minX) * 0.04 + 1.2;
  const padY = (maxY - minY) * 0.04 + 1.2;
  const hx = Math.max(8, (maxX - minX) * 0.5 + padX);
  const hy = Math.max(8, (maxY - minY) * 0.5 + padY);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  return {
    r, u, f,
    eye: {
      x: eye.x + r.x * cx + u.x * cy,
      y: eye.y + r.y * cx + u.y * cy,
      z: eye.z + r.z * cx + u.z * cy,
    },
    hx,
    hy,
    near: Math.max(0.5, minZ - 4),
    far: maxZ + 8,
    perspective: false,
  };
}

export const CUBE_FACES = [
  { f: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { f: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { f: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { f: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 } },
  { f: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } },
  { f: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
];

export function cubeFaceCam(light, face) {
  const spec = CUBE_FACES[face];
  const { r, u, f } = basisFromForward(spec.f, spec.up);
  return {
    r, u, f,
    eye: { x: light.x, y: light.y, z: light.z },
    hx: 1,
    hy: 1,
    near: 0.08,
    far: Math.max(4, light.range || 12),
    perspective: true,
  };
}

export function projectShadow(p, cam) {
  const vx = (p.x - cam.eye.x) * cam.r.x + (p.y - cam.eye.y) * cam.r.y + (p.z - cam.eye.z) * cam.r.z;
  const vy = (p.x - cam.eye.x) * cam.u.x + (p.y - cam.eye.y) * cam.u.y + (p.z - cam.eye.z) * cam.u.z;
  const vz = (p.x - cam.eye.x) * cam.f.x + (p.y - cam.eye.y) * cam.f.y + (p.z - cam.eye.z) * cam.f.z;
  const den = cam.perspective ? Math.max(vz, 1e-4) * cam.hx : cam.hx;
  const denY = cam.perspective ? Math.max(vz, 1e-4) * cam.hy : cam.hy;
  return {
    u: vx / den * 0.5 + 0.5,
    v: vy / denY * 0.5 + 0.5,
    depth: (vz - cam.near) / Math.max(cam.far - cam.near, 1e-4),
    vz,
  };
}

export function spotShadowCam(light) {
  const { r, u, f } = basisFromForward({
    x: light.dx || 0,
    y: light.dy || 0,
    z: light.dz || 0,
  });
  return {
    r, u, f,
    eye: { x: light.x, y: light.y, z: light.z },
    hx: SPOT_HALF_TAN,
    hy: SPOT_HALF_TAN,
    near: 0.14,
    far: Math.max(3, light.range || 8),
    perspective: true,
  };
}

export function assignShadowLayers(lights, maxCubes = MAX_LAMP_SHADOWS) {
  const ranked = [...(lights || [])].sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
  for (const L of lights || []) {
    L.shadowLayer = -1;
    L.spotLayer = -1;
  }
  let cube = 0;
  for (const L of ranked) {
    if (cube >= maxCubes) break;
    if (L.z < 2.15 || L.intensity < 1.2) continue;
    L.shadowLayer = cube;
    cube += 1;
  }
  return (lights || []).filter((L) => L.shadowLayer >= 0);
}

export function assignSpotLayers(lights, maxSpots = MAX_SPOT_SHADOWS) {
  const ranked = [...(lights || [])]
    .filter((L) => (L.shadowLayer ?? -1) < 0
      && (L.intensity || 0) >= 1.2
      && (L.dx || 0) ** 2 + (L.dy || 0) ** 2 + (L.dz || 0) ** 2 > 0.05)
    .sort((a, b) => (b.intensity || 0) - (a.intensity || 0));
  let n = 0;
  for (const L of ranked) {
    if (n >= maxSpots) break;
    L.spotLayer = n;
    L.shadowLayer = -2 - n;
    n += 1;
  }
  return (lights || []).filter((L) => (L.spotLayer ?? -1) >= 0);
}

export { LAMP_FACES };
