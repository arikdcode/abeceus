const FOV = 0.40;
const FPV_FOV = 0.58;
const OVERVIEW_FOV = 0.52;

export function makeCam3() {
  return { target: { x: 10, y: 7.5, z: 0 }, yaw: -Math.PI / 2, pitch: 1.02, dist: 21, fpv: false, overview: false };
}

function mapXY(map) {
  const min = Array.isArray(map.min) ? map.min : [map.min.x, map.min.y];
  const max = Array.isArray(map.max) ? map.max : [map.max.x, map.max.y];
  return { min, max, sx: max[0] - min[0], sy: max[1] - min[1] };
}

export function frameCam3(cam, map) {
  const { min, max, sx, sy } = mapXY(map);
  cam.target = { x: (min[0] + max[0]) * 0.5, y: (min[1] + max[1]) * 0.5, z: 0 };
  cam.yaw = -Math.PI / 2;
  cam.pitch = sx > 40 ? 1.12 : 1.02;
  cam.dist = Math.max(20, Math.max(sx, sy) * (sx > 40 ? 1.02 : 0.88));
  cam.fpv = false;
  cam.fpvEye = null;
  cam.fpvLook = null;
  cam.overview = false;
}

export function frameOverview3(cam, map) {
  const { min, max, sx, sy } = mapXY(map);
  cam.target = { x: (min[0] + max[0]) * 0.5, y: (min[1] + max[1]) * 0.5, z: 0 };
  cam.yaw = -Math.PI / 2 - 0.48;
  cam.pitch = 0.62;
  cam.dist = Math.max(42, Math.max(sx, sy) * 1.62);
  cam.fpv = false;
  cam.fpvEye = null;
  cam.fpvLook = null;
  cam.overview = true;
}

export function fovOf(cam) {
  if (cam.fpv) return FPV_FOV;
  if (cam.overview) return OVERVIEW_FOV;
  return FOV;
}

export function eyeOf(cam) {
  if (cam.fpv && cam.fpvEye) return { ...cam.fpvEye };
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  return {
    x: cam.target.x + cam.dist * cp * Math.cos(cam.yaw),
    y: cam.target.y + cam.dist * cp * Math.sin(cam.yaw),
    z: Math.max(0.4, cam.target.z + cam.dist * sp),
  };
}

function lookOf(cam) {
  if (cam.fpv && cam.fpvLook) return cam.fpvLook;
  return cam.target;
}

let basisCache = null;

export function camBasis(cam) {
  const fpv = cam.fpv && cam.fpvEye ? `${cam.fpvEye.x},${cam.fpvEye.y},${cam.fpvEye.z}` : "0";
  const key = `${cam.yaw}|${cam.pitch}|${cam.dist}|${cam.target.x}|${cam.target.y}|${cam.target.z}|${cam.fpv}|${fpv}`;
  if (basisCache && basisCache.key === key) return basisCache.b;
  const eye = eyeOf(cam);
  const look = lookOf(cam);
  const fx = look.x - eye.x;
  const fy = look.y - eye.y;
  const fz = (look.z || 0) - eye.z;
  const fl = Math.max(1e-6, Math.hypot(fx, fy, fz));
  const f = { x: fx / fl, y: fy / fl, z: fz / fl };
  const rx = f.y;
  const ry = -f.x;
  const rl = Math.max(1e-6, Math.hypot(rx, ry));
  const r = { x: rx / rl, y: ry / rl, z: 0 };
  const u = {
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  const b = { eye, f, r, u };
  basisCache = { key, b };
  return b;
}

export function project3(cam, w, h, p) {
  const { eye, f, r, u } = camBasis(cam);
  const vx = p.x - eye.x;
  const vy = p.y - eye.y;
  const vz = (p.z || 0) - eye.z;
  const z = vx * f.x + vy * f.y + vz * f.z;
  if (z < 0.2) return null;
  const x = vx * r.x + vy * r.y + vz * r.z;
  const y = vx * u.x + vy * u.y + vz * u.z;
  const fov = fovOf(cam);
  return {
    x: w / 2 + (x / z) * (h * 0.5 / fov),
    y: h / 2 - (y / z) * (h * 0.5 / fov),
    z,
  };
}

export function screenRay(cam, w, h, sx, sy) {
  const { eye, f, r, u } = camBasis(cam);
  const fov = fovOf(cam);
  const nx = (sx - w / 2) / (h * 0.5 / fov);
  const ny = -(sy - h / 2) / (h * 0.5 / fov);
  const d = {
    x: f.x + r.x * nx + u.x * ny,
    y: f.y + r.y * nx + u.y * ny,
    z: f.z + r.z * nx + u.z * ny,
  };
  const l = Math.max(1e-6, Math.hypot(d.x, d.y, d.z));
  return { origin: eye, dir: { x: d.x / l, y: d.y / l, z: d.z / l } };
}

export function hitGround(ray) {
  if (Math.abs(ray.dir.z) < 1e-6) return null;
  const t = (0 - ray.origin.z) / ray.dir.z;
  if (t < 0.1) return null;
  return {
    x: ray.origin.x + ray.dir.x * t,
    y: ray.origin.y + ray.dir.y * t,
    z: 0,
  };
}

export function panCam(cam, dx, dy) {
  const alongX = Math.cos(cam.yaw + Math.PI);
  const alongY = Math.sin(cam.yaw + Math.PI);
  const rightX = Math.cos(cam.yaw + Math.PI * 0.5);
  const rightY = Math.sin(cam.yaw + Math.PI * 0.5);
  cam.target.x += rightX * dx + alongX * dy;
  cam.target.y += rightY * dx + alongY * dy;
}

export function orbitCam(cam, dYaw, dPitch) {
  cam.yaw += dYaw;
  cam.pitch = Math.min(1.52, Math.max(0.18, cam.pitch + dPitch));
}

export function zoomCam(cam, factor) {
  cam.dist = Math.min(120, Math.max(3.2, cam.dist * factor));
}

export { camBasis as basis };
