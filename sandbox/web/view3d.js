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

function shade(hex, n, cam) {
  const light = { x: 0.35, y: 0.55, z: 0.76 };
  const ll = Math.hypot(light.x, light.y, light.z);
  const { r, u } = basis(cam);
  const wx = n.x * r.x + n.y * r.y;
  const wy = n.x * u.x + n.y * u.y + n.z * u.z;
  const wz = n.z;
  void wx; void wy; void wz;
  const nd = Math.max(0.5, 0.42 + 0.7 * (n.x * light.x + n.y * light.y + n.z * light.z) / ll);
  const c = parseInt(hex.slice(1), 16);
  const R = Math.min(255, ((c >> 16) & 255) * nd);
  const G = Math.min(255, ((c >> 8) & 255) * nd);
  const B = Math.min(255, (c & 255) * nd);
  return `rgb(${R | 0},${G | 0},${B | 0})`;
}

function faceNormal(b, fi, facing) {
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

export function drawFloor3(ctx, cam, w, h, map) {
  const g = map.grid || 1;
  const minx = map.min[0];
  const maxx = map.max[0];
  const miny = map.min[1];
  const maxy = map.max[1];
  const up = { x: 0, y: 0, z: 1 };
  const fill = shade("#2a333c", up, cam);
  const whole = [
    { x: minx, y: miny, z: 0 },
    { x: maxx, y: miny, z: 0 },
    { x: maxx, y: maxy, z: 0 },
    { x: minx, y: maxy, z: 0 },
  ].map((p) => project3(cam, w, h, p));
  if (whole.every(Boolean)) {
    fillPoly(ctx, whole, fill);
  } else {
    for (let x = minx; x < maxx - 1e-6; x += g) {
      const x1 = Math.min(maxx, x + g);
      for (let y = miny; y < maxy - 1e-6; y += g) {
        const y1 = Math.min(maxy, y + g);
        fillPoly(ctx, [
          project3(cam, w, h, { x, y, z: 0 }),
          project3(cam, w, h, { x: x1, y, z: 0 }),
          project3(cam, w, h, { x: x1, y: y1, z: 0 }),
          project3(cam, w, h, { x, y: y1, z: 0 }),
        ], fill);
      }
    }
  }
  const grid = "rgba(210, 220, 230, 0.12)";
  for (let x = minx; x <= maxx + 1e-6; x += g) {
    for (let y = miny; y < maxy - 1e-6; y += g) {
      drawPolyline3(ctx, cam, w, h, [{ x, y, z: 0.02 }, { x, y: Math.min(maxy, y + g), z: 0.02 }], grid);
    }
  }
  for (let y = miny; y <= maxy + 1e-6; y += g) {
    for (let x = minx; x < maxx - 1e-6; x += g) {
      drawPolyline3(ctx, cam, w, h, [{ x, y, z: 0.02 }, { x: Math.min(maxx, x + g), y, z: 0.02 }], grid);
    }
  }
}

export function drawScene3(ctx, cam, w, h, parts) {
  const faces = [];
  for (const part of parts) {
    const pts = part.corners.map((p) => project3(cam, w, h, p));
    for (let fi = 0; fi < 6; fi++) {
      const idx = FACE[fi];
      const poly = idx.map((i) => pts[i]);
      if (poly.some((p) => !p)) continue;
      const depth = (poly[0].z + poly[1].z + poly[2].z + poly[3].z) / 4;
      faces.push({ poly, depth, color: part.color, n: faceNormal(part, fi, part.facing), cam, ghost: !!part.ghost });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.poly[0].x, f.poly[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.poly[i].x, f.poly[i].y);
    ctx.closePath();
    if (f.ghost) ctx.globalAlpha = 0.5;
    ctx.fillStyle = shade(f.color, f.n, cam);
    ctx.fill();
    ctx.strokeStyle = f.ghost ? "rgba(215,177,90,0.9)" : "rgba(12,16,20,0.28)";
    ctx.lineWidth = f.ghost ? 1.4 : 1;
    ctx.stroke();
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
  cam.dist = Math.min(60, Math.max(8, cam.dist * factor));
}

export { eyeOf };
