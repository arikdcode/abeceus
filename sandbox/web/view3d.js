const FACE = [
  [0, 2, 3, 1],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 4, 6, 2],
  [1, 3, 7, 5],
];

const NORM = [
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
];

const FOV = 0.40;
const FPV_FOV = 0.58;

export function makeCam3() {
  return { target: { x: 10, y: 7.5, z: 0 }, yaw: -Math.PI / 2, pitch: 1.02, dist: 21, fpv: false };
}

export function frameCam3(cam, map) {
  const min = Array.isArray(map.min) ? map.min : [map.min.x, map.min.y];
  const max = Array.isArray(map.max) ? map.max : [map.max.x, map.max.y];
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  cam.target = { x: (min[0] + max[0]) * 0.5, y: (min[1] + max[1]) * 0.5, z: 0 };
  cam.yaw = -Math.PI / 2;
  cam.pitch = sx > 40 ? 1.12 : 1.02;
  cam.dist = Math.max(20, Math.max(sx, sy) * (sx > 40 ? 1.02 : 0.88));
  cam.fpv = false;
  cam.fpvEye = null;
  cam.fpvLook = null;
}

export const GROUND = {
  dirt: "#3a3228",
  grass: "#2f3d28",
  gravel: "#4a463c",
  concrete: "#5c5e5a",
  road: "#35363a",
};

function fovOf(cam) {
  return cam.fpv ? FPV_FOV : FOV;
}

function eyeOf(cam) {
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

function basis(cam) {
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
  return { eye, f, r, u };
}

export function project3(cam, w, h, p) {
  const { eye, f, r, u } = basis(cam);
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
  const { eye, f, r, u } = basis(cam);
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

function lightOf(cam) {
  const { f, r, u, eye } = basis(cam);
  const kn = Math.hypot(-f.x + 0.15 * r.x + 0.32 * u.x, -f.y + 0.15 * r.y + 0.32 * u.y, -f.z + 0.32 * u.z + 0.2) || 1;
  const fn = Math.hypot(u.x + 0.25 * r.x, u.y + 0.25 * r.y, u.z + 0.55) || 1;
  return {
    eye,
    toward: { x: -f.x, y: -f.y, z: -f.z },
    key: {
      x: (-f.x + 0.15 * r.x + 0.32 * u.x) / kn,
      y: (-f.y + 0.15 * r.y + 0.32 * u.y) / kn,
      z: (-f.z + 0.32 * u.z + 0.2) / kn,
    },
    fill: { x: (u.x + 0.25 * r.x) / fn, y: (u.y + 0.25 * r.y) / fn, z: (u.z + 0.55) / fn },
  };
}

function shade(hex, n, cam, light = null) {
  const L = light || lightOf(cam);
  if (n.x * L.toward.x + n.y * L.toward.y + n.z * L.toward.z < 0) {
    n = { x: -n.x, y: -n.y, z: -n.z };
  }
  const kd = Math.max(0, n.x * L.key.x + n.y * L.key.y + n.z * L.key.z);
  const fd = Math.max(0, n.x * L.fill.x + n.y * L.fill.y + n.z * L.fill.z);
  const nd = Math.min(1.35, 0.34 + 0.78 * kd + 0.26 * fd);
  const c = parseInt(hex.slice(1), 16);
  const R = Math.min(255, ((c >> 16) & 255) * nd);
  const G = Math.min(255, ((c >> 8) & 255) * nd);
  const B = Math.min(255, (c & 255) * nd);
  return `rgb(${R | 0},${G | 0},${B | 0})`;
}

function faceNormal(b, fi, facing) {
  if (b.corners && b.corners.length >= 8) {
    const idx = FACE[fi];
    const a = b.corners[idx[0]];
    const b1 = b.corners[idx[1]];
    const b2 = b.corners[idx[3]];
    const ux = b1.x - a.x, uy = b1.y - a.y, uz = b1.z - a.z;
    const vx = b2.x - a.x, vy = b2.y - a.y, vz = b2.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    return { x: -nx / l, y: -ny / l, z: -nz / l };
  }
  const n = NORM[fi];
  if (b.name === "cover") return n;
  const c = Math.cos(facing || 0);
  const s = Math.sin(facing || 0);
  return { x: n.y * c + n.x * s, y: n.y * s - n.x * c, z: n.z };
}

function fillPoly(ctx, pts, fill) {
  if (pts.some((p) => !p)) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawGroundQuad(ctx, cam, w, h, min, max, hex, z = 0, light = null) {
  const up = { x: 0, y: 0, z: 1 };
  const pts = [
    { x: min[0], y: min[1], z },
    { x: max[0], y: min[1], z },
    { x: max[0], y: max[1], z },
    { x: min[0], y: max[1], z },
  ].map((p) => project3(cam, w, h, p));
  if (pts.every(Boolean)) {
    fillPoly(ctx, pts, shade(hex, up, cam, light));
    return;
  }
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  if (sx <= 1.25 && sy <= 1.25) return;
  const mx = (min[0] + max[0]) * 0.5;
  const my = (min[1] + max[1]) * 0.5;
  drawGroundQuad(ctx, cam, w, h, [min[0], min[1]], [mx, my], hex, z, light);
  drawGroundQuad(ctx, cam, w, h, [mx, min[1]], [max[0], my], hex, z, light);
  drawGroundQuad(ctx, cam, w, h, [min[0], my], [mx, max[1]], hex, z, light);
  drawGroundQuad(ctx, cam, w, h, [mx, my], [max[0], max[1]], hex, z, light);
}

function drawSegmentedLine3(ctx, cam, w, h, a, b, color, step = 6) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = (b.z || 0) - (a.z || 0);
  const len = Math.hypot(dx, dy, dz) || 1;
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    drawPolyline3(ctx, cam, w, h, [
      { x: a.x + dx * t0, y: a.y + dy * t0, z: (a.z || 0) + dz * t0 },
      { x: a.x + dx * t1, y: a.y + dy * t1, z: (a.z || 0) + dz * t1 },
    ], color);
  }
}

function drawRoadMarks(ctx, cam, w, h, min, max) {
  const y = (min[1] + max[1]) * 0.5;
  const mark = "rgba(210, 190, 70, 0.55)";
  ctx.lineWidth = 2.2;
  for (let x = min[0] + 1.2; x < max[0] - 1.2; x += 4.2) {
    drawSegmentedLine3(ctx, cam, w, h, { x, y, z: 0.03 }, { x: Math.min(max[0] - 0.4, x + 1.7), y, z: 0.03 }, mark, 2);
  }
}

const GRID_STEP = 1;
const GRID_MAJOR = 5;

export function drawFloor3(ctx, cam, w, h, map) {
  const minx = map.min[0];
  const maxx = map.max[0];
  const miny = map.min[1];
  const maxy = map.max[1];
  const light = lightOf(cam);
  const ground = GROUND[map.ground] || GROUND.dirt;
  drawGroundQuad(ctx, cam, w, h, [minx, miny], [maxx, maxy], ground, 0, light);
  for (const s of map.surfaces || []) {
    if (!s.min || !s.max) continue;
    const hex = s.color || GROUND[s.kind] || GROUND.dirt;
    drawGroundQuad(ctx, cam, w, h, s.min, s.max, hex, 0.012, light);
    if (s.kind === "road") drawRoadMarks(ctx, cam, w, h, s.min, s.max);
  }
  const minor = "rgba(210, 220, 230, 0.08)";
  const major = "rgba(210, 220, 230, 0.18)";
  for (let x = minx; x <= maxx + 1e-6; x += GRID_STEP) {
    const ink = Math.abs(x - minx) % GRID_MAJOR < 1e-6 ? major : minor;
    drawSegmentedLine3(ctx, cam, w, h, { x, y: miny, z: 0.02 }, { x, y: maxy, z: 0.02 }, ink);
  }
  for (let y = miny; y <= maxy + 1e-6; y += GRID_STEP) {
    const ink = Math.abs(y - miny) % GRID_MAJOR < 1e-6 ? major : minor;
    drawSegmentedLine3(ctx, cam, w, h, { x: minx, y, z: 0.02 }, { x: maxx, y, z: 0.02 }, ink);
  }
}

export function sliceBox3(c, maxSpan = 1.15) {
  const x0 = Array.isArray(c.min) ? c.min[0] : c.min.x;
  const y0 = Array.isArray(c.min) ? c.min[1] : c.min.y;
  const x1 = Array.isArray(c.max) ? c.max[0] : c.max.x;
  const y1 = Array.isArray(c.max) ? c.max[1] : c.max.y;
  const z0 = c.z0 ?? 0;
  const z1 = c.z1 ?? c.height ?? 1;
  const nx = Math.max(1, Math.ceil((x1 - x0) / maxSpan));
  const ny = Math.max(1, Math.ceil((y1 - y0) / maxSpan));
  const nz = Math.max(1, Math.ceil((z1 - z0) / maxSpan));
  if (nx === 1 && ny === 1 && nz === 1) {
    return [{ min: { x: x0, y: y0 }, max: { x: x1, y: y1 }, z0, z1, height: z1 }];
  }
  const out = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const za = z0 + ((z1 - z0) * k) / nz;
        const zb = z0 + ((z1 - z0) * (k + 1)) / nz;
        out.push({
          min: { x: x0 + ((x1 - x0) * i) / nx, y: y0 + ((y1 - y0) * j) / ny },
          max: { x: x0 + ((x1 - x0) * (i + 1)) / nx, y: y0 + ((y1 - y0) * (j + 1)) / ny },
          z0: za,
          z1: zb,
          height: zb,
        });
      }
    }
  }
  return out;
}

export function drawScene3(ctx, cam, w, h, parts) {
  const light = lightOf(cam);
  const faces = [];
  for (const part of parts) {
    const pts = part.corners.map((p) => project3(cam, w, h, p));
    const cover = part.name === "cover";
    for (let fi = 0; fi < 6; fi++) {
      const idx = FACE[fi];
      const poly = idx.map((i) => pts[i]);
      if (poly.some((p) => !p)) continue;
      let minx = poly[0].x, maxx = poly[0].x, miny = poly[0].y, maxy = poly[0].y;
      for (let i = 1; i < 4; i++) {
        minx = Math.min(minx, poly[i].x); maxx = Math.max(maxx, poly[i].x);
        miny = Math.min(miny, poly[i].y); maxy = Math.max(maxy, poly[i].y);
      }
      if (maxx < 0 || maxy < 0 || minx > w || miny > h) continue;
      if (maxx - minx < 0.6 && maxy - miny < 0.6) continue;
      const n = faceNormal(part, fi, part.facing);
      const c0 = part.corners[idx[0]];
      if ((c0.x - light.eye.x) * n.x + (c0.y - light.eye.y) * n.y + (c0.z - light.eye.z) * n.z > 0.02) continue;
      const depth = (poly[0].z + poly[1].z + poly[2].z + poly[3].z) / 4
        + (part.name?.endsWith("_eye") ? -0.08 : part.name === "face" ? -0.02 : 0)
        + (part.roof ? -0.35 : 0);
      faces.push({ poly, depth, color: part.color, n, ghost: !!part.ghost, stroke: !cover || !!part.ghost });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.poly[0].x, f.poly[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.poly[i].x, f.poly[i].y);
    ctx.closePath();
    if (f.ghost) ctx.globalAlpha = 0.5;
    ctx.fillStyle = shade(f.color, f.n, cam, light);
    ctx.fill();
    if (f.stroke) {
      ctx.strokeStyle = f.ghost ? "rgba(215,177,90,0.9)" : "rgba(40, 32, 24, 0.42)";
      ctx.lineWidth = f.ghost ? 1.4 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawPolyline3(ctx, cam, w, h, pts, color, dash) {
  const proj = pts.map((p) => project3(cam, w, h, p.z != null ? p : { ...p, z: 0.04 }));
  if (proj.some((p) => !p)) return;
  ctx.beginPath();
  ctx.moveTo(proj[0].x, proj[0].y);
  for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
  ctx.strokeStyle = color;
  ctx.setLineDash(dash || []);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawFan3(ctx, cam, w, h, origin, ring, fill, stroke) {
  const o = project3(cam, w, h, origin);
  const pts = ring.map((p) => project3(cam, w, h, p));
  ctx.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    if (!pts[i] || !pts[i + 1]) continue;
    if (o) {
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    } else {
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    }
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  const rim = pts.filter(Boolean);
  if (rim.length > 1) {
    ctx.beginPath();
    ctx.moveTo(rim[0].x, rim[0].y);
    for (let i = 1; i < rim.length; i++) ctx.lineTo(rim[i].x, rim[i].y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
    if (o) {
      ctx.beginPath();
      ctx.moveTo(o.x, o.y); ctx.lineTo(rim[0].x, rim[0].y);
      ctx.moveTo(o.x, o.y); ctx.lineTo(rim[Math.floor(rim.length / 2)].x, rim[Math.floor(rim.length / 2)].y);
      ctx.stroke();
    }
  }
}

export function drawLabel3(ctx, cam, w, h, p, text, color) {
  const s = project3(cam, w, h, p);
  if (!s) return;
  ctx.fillStyle = color || "#e8edf4";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, s.x, s.y);
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
  cam.pitch = Math.min(1.35, Math.max(0.18, cam.pitch + dPitch));
}

export function zoomCam(cam, factor) {
  cam.dist = Math.min(60, Math.max(3.2, cam.dist * factor));
}

export { eyeOf };
