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
const OVERVIEW_FOV = 0.52;

const SUN_RAW = { x: -0.58, y: -0.34, z: 0.74 };
const SUN_LEN = Math.hypot(SUN_RAW.x, SUN_RAW.y, SUN_RAW.z);
const SUN = { x: SUN_RAW.x / SUN_LEN, y: SUN_RAW.y / SUN_LEN, z: SUN_RAW.z / SUN_LEN };

const FOG = { r: 92, g: 78, b: 62 };
const SKY_UP = { r: 28, g: 40, b: 50 };
const BOUNCE = { r: 1.08, g: 0.92, b: 0.72 };

const MAT = {
  default: { spec: 0.07, shine: 16, wrap: 0.04, metal: 0 },
  metal: { spec: 0.46, shine: 44, wrap: 0, metal: 0.55 },
  concrete: { spec: 0.11, shine: 14, wrap: 0.02, metal: 0 },
  canvas: { spec: 0.035, shine: 8, wrap: 0.16, metal: 0 },
  wood: { spec: 0.08, shine: 12, wrap: 0.05, metal: 0 },
  foliage: { spec: 0.05, shine: 9, wrap: 0.38, metal: 0 },
  paint: { spec: 0.22, shine: 30, wrap: 0.02, metal: 0.12 },
  rubber: { spec: 0.04, shine: 7, wrap: 0.1, metal: 0 },
  glass: { spec: 0.62, shine: 70, wrap: 0, metal: 0.2 },
  stone: { spec: 0.07, shine: 11, wrap: 0.08, metal: 0 },
  dirt: { spec: 0.025, shine: 6, wrap: 0.1, metal: 0 },
  emit: { spec: 0, shine: 1, wrap: 0, metal: 0, emit: 1 },
};

const RGB_CACHE = new Map();

export function makeCam3() {
  return { target: { x: 10, y: 7.5, z: 0 }, yaw: -Math.PI / 2, pitch: 1.02, dist: 21, fpv: false, overview: false };
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
  cam.overview = false;
}

export function frameOverview3(cam, map) {
  const min = Array.isArray(map.min) ? map.min : [map.min.x, map.min.y];
  const max = Array.isArray(map.max) ? map.max : [map.max.x, map.max.y];
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  cam.target = { x: (min[0] + max[0]) * 0.5, y: (min[1] + max[1]) * 0.5, z: 0 };
  cam.yaw = -Math.PI / 2 - 0.48;
  cam.pitch = 0.62;
  cam.dist = Math.max(42, Math.max(sx, sy) * 1.62);
  cam.fpv = false;
  cam.fpvEye = null;
  cam.fpvLook = null;
  cam.overview = true;
}

export const GROUND = {
  dirt: "#4a3d30",
  grass: "#35462a",
  gravel: "#5a5648",
  concrete: "#6e706a",
  road: "#2a2b30",
  tracks: "#3a3228",
};

function fovOf(cam) {
  if (cam.fpv) return FPV_FOV;
  if (cam.overview) return OVERVIEW_FOV;
  return FOV;
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

let basisCache = null;

function basis(cam) {
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

function parseRgb(hex) {
  let c = RGB_CACHE.get(hex);
  if (c) return c;
  if (!hex || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) {
    c = { r: 106, g: 123, b: 102 };
  } else if (hex.length === 4) {
    c = {
      r: parseInt(hex[1] + hex[1], 16),
      g: parseInt(hex[2] + hex[2], 16),
      b: parseInt(hex[3] + hex[3], 16),
    };
  } else {
    const n = parseInt(hex.slice(1), 16);
    c = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  RGB_CACHE.set(hex, c);
  return c;
}

function rgbStr(r, g, b) {
  return `rgb(${r < 0 ? 0 : r > 255 ? 255 : r | 0},${g < 0 ? 0 : g > 255 ? 255 : g | 0},${b < 0 ? 0 : b > 255 ? 255 : b | 0})`;
}

function hash2(ix, iy) {
  let n = (ix * 374761393 + iy * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function inferPartMat(name) {
  const n = name || "";
  if (n.includes("plate") || n.includes("helmet") || n.includes("armor")) return "paint";
  if (n.includes("eye")) return "glass";
  if (n.includes("boot") || n.includes("sole")) return "rubber";
  return null;
}

function matOf(name, fallback) {
  if (fallback && MAT[fallback]) return MAT[fallback];
  return MAT[inferPartMat(name)] || MAT.default;
}

function lightOf(cam) {
  const { f, eye } = basis(cam);
  return {
    eye,
    toward: { x: -f.x, y: -f.y, z: -f.z },
    sun: SUN,
    view: { x: -f.x, y: -f.y, z: -f.z },
  };
}

function shade(hex, n, cam, light = null, matName = null, depth = 18, emit = 0) {
  const L = light || lightOf(cam);
  if (n.x * L.toward.x + n.y * L.toward.y + n.z * L.toward.z < 0) {
    n = { x: -n.x, y: -n.y, z: -n.z };
  }
  const mat = matOf(null, matName);
  const c = parseRgb(hex);
  if (emit > 0 || mat.emit) {
    const boost = 1.15 + 0.35 * emit;
    let r = Math.min(255, c.r * boost + 40 * emit);
    let g = Math.min(255, c.g * boost + 28 * emit);
    let b = Math.min(255, c.b * boost + 8 * emit);
    const fog = Math.min(0.35, 1 - Math.exp(-(depth || 18) * 0.01));
    r = r * (1 - fog) + FOG.r * fog;
    g = g * (1 - fog) + FOG.g * fog;
    b = b * (1 - fog) + FOG.b * fog;
    return rgbStr(r, g, b);
  }
  const wrap = mat.wrap || 0;
  let ndot = n.x * L.sun.x + n.y * L.sun.y + n.z * L.sun.z;
  if (wrap > 0) ndot = (ndot + wrap) / (1 + wrap);
  const lambert = Math.max(0, ndot);
  const hemi = n.z * 0.5 + 0.5;
  const under = Math.max(0, -n.z);
  const ambient = 0.16 + 0.22 * hemi + 0.07 * under;
  const diffuse = 0.78 * lambert;
  const hx = L.sun.x + L.view.x;
  const hy = L.sun.y + L.view.y;
  const hz = L.sun.z + L.view.z;
  const hl = Math.hypot(hx, hy, hz) || 1;
  const spec = Math.pow(Math.max(0, n.x * hx / hl + n.y * hy / hl + n.z * hz / hl), mat.shine) * mat.spec;
  const warm = 0.55 * lambert;
  let r = c.r * (ambient * (0.72 + 0.28 * (SKY_UP.r / 50)) + diffuse * (0.92 + 0.16 * warm)) + spec * (180 + c.r * mat.metal);
  let g = c.g * (ambient * (0.78 + 0.22 * (SKY_UP.g / 50)) + diffuse * (0.90 + 0.08 * warm)) + spec * (150 + c.g * mat.metal);
  let b = c.b * (ambient * (0.88 + 0.18 * (SKY_UP.b / 50)) + diffuse * (0.82)) + spec * (120 + c.b * mat.metal);
  r *= BOUNCE.r;
  g *= BOUNCE.g;
  b *= BOUNCE.b;
  const fog = Math.min(0.62, 1 - Math.exp(-(depth || 18) * 0.0115));
  r = r * (1 - fog) + FOG.r * fog;
  g = g * (1 - fog) + FOG.g * fog;
  b = b * (1 - fog) + FOG.b * fog;
  return rgbStr(r, g, b);
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

function tintGround(kind, hex, ix, iy) {
  const t = hash2(ix, iy);
  const t2 = hash2(iy + 17, ix * 3 + 9);
  const c = parseRgb(hex);
  let k = 0.86 + t * 0.28;
  let r = c.r * k;
  let g = c.g * k;
  let b = c.b * k;
  if (kind === "grass") {
    g += 10 + t2 * 18;
    r -= 4 + t * 8;
    if (t > 0.82) { r += 18; g += 8; b -= 6; }
    if (t < 0.12) { r -= 8; g -= 14; b -= 6; }
  } else if (kind === "dirt") {
    r += (t - 0.5) * 22;
    g += (t2 - 0.5) * 10;
    if (t2 > 0.8) { r -= 12; g -= 8; }
  } else if (kind === "gravel") {
    const speck = (t * 40 - 16);
    r += speck; g += speck * 0.9; b += speck * 0.7;
  } else if (kind === "concrete") {
    const slab = ((ix + iy) & 1) ? -6 : 5;
    r += slab + (t - 0.5) * 10;
    g += slab + (t2 - 0.5) * 10;
    b += slab;
  } else if (kind === "road") {
    r += (t - 0.5) * 14;
    g += (t - 0.5) * 14;
    b += (t - 0.5) * 16;
    if (t2 > 0.88) { r += 18; g += 14; b += 8; }
  } else if (kind === "tracks") {
    r -= 10; g -= 8; b -= 6;
  }
  return rgbStr(r, g, b);
}

function groundMat(kind) {
  if (kind === "grass") return "foliage";
  if (kind === "concrete") return "concrete";
  if (kind === "road") return "rubber";
  if (kind === "gravel") return "stone";
  return "dirt";
}

function drawGroundQuad(ctx, cam, w, h, min, max, hex, z = 0, light = null, matName = "dirt", depthHint = 22) {
  const up = { x: 0, y: 0, z: 1 };
  const pts = [
    { x: min[0], y: min[1], z },
    { x: max[0], y: min[1], z },
    { x: max[0], y: max[1], z },
    { x: min[0], y: max[1], z },
  ].map((p) => project3(cam, w, h, p));
  if (pts.every(Boolean)) {
    const depth = (pts[0].z + pts[1].z + pts[2].z + pts[3].z) * 0.25;
    fillPoly(ctx, pts, shade(hex, up, cam, light, matName, depth));
    return true;
  }
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  if (sx <= 1.25 && sy <= 1.25) return false;
  const mx = (min[0] + max[0]) * 0.5;
  const my = (min[1] + max[1]) * 0.5;
  drawGroundQuad(ctx, cam, w, h, [min[0], min[1]], [mx, my], hex, z, light, matName, depthHint);
  drawGroundQuad(ctx, cam, w, h, [mx, min[1]], [max[0], my], hex, z, light, matName, depthHint);
  drawGroundQuad(ctx, cam, w, h, [min[0], my], [mx, max[1]], hex, z, light, matName, depthHint);
  drawGroundQuad(ctx, cam, w, h, [mx, my], [max[0], max[1]], hex, z, light, matName, depthHint);
  return false;
}

function drawTiledGround(ctx, cam, w, h, min, max, kind, hex, z, light, step) {
  const matName = groundMat(kind);
  const x0 = min[0];
  const x1 = max[0];
  const y0 = min[1];
  const y1 = max[1];
  for (let x = x0; x < x1 - 1e-9; x += step) {
    const xe = Math.min(x + step, x1);
    const ix = Math.round(x / step);
    for (let y = y0; y < y1 - 1e-9; y += step) {
      const ye = Math.min(y + step, y1);
      const iy = Math.round(y / step);
      const fill = kind ? tintGround(kind, hex, ix, iy) : hex;
      const hexFill = typeof fill === "string" && fill[0] === "#" ? fill : hex;
      if (fill[0] === "r") {
        const up = { x: 0, y: 0, z: 1 };
        const pts = [
          { x, y, z }, { x: xe, y, z }, { x: xe, y: ye, z }, { x, y: ye, z },
        ].map((p) => project3(cam, w, h, p));
        if (pts.every(Boolean)) {
          const depth = (pts[0].z + pts[1].z + pts[2].z + pts[3].z) * 0.25;
          const shaded = shade(hex, up, cam, light, matName, depth);
          const mixed = mixShade(shaded, fill, 0.55);
          fillPoly(ctx, pts, mixed);
        } else {
          drawGroundQuad(ctx, cam, w, h, [x, y], [xe, ye], hex, z, light, matName);
        }
      } else {
        drawGroundQuad(ctx, cam, w, h, [x, y], [xe, ye], hexFill, z, light, matName);
      }
    }
  }
}

function mixShade(shadedRgb, tintRgb, amt) {
  const a = shadedRgb.match(/\d+/g).map(Number);
  const b = tintRgb.match(/\d+/g).map(Number);
  return rgbStr(
    a[0] * (1 - amt) + b[0] * amt,
    a[1] * (1 - amt) + b[1] * amt,
    a[2] * (1 - amt) + b[2] * amt,
  );
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
  const y0 = min[1] + 0.18;
  const y1 = max[1] - 0.18;
  ctx.lineWidth = 1.6;
  drawSegmentedLine3(ctx, cam, w, h, { x: min[0] + 0.4, y: y0, z: 0.03 }, { x: max[0] - 0.4, y: y0, z: 0.03 }, "rgba(210, 210, 200, 0.28)", 8);
  drawSegmentedLine3(ctx, cam, w, h, { x: min[0] + 0.4, y: y1, z: 0.03 }, { x: max[0] - 0.4, y: y1, z: 0.03 }, "rgba(210, 210, 200, 0.28)", 8);
  ctx.lineWidth = 2.4;
  const mark = "rgba(220, 190, 55, 0.62)";
  for (let x = min[0] + 1.2; x < max[0] - 1.2; x += 4.2) {
    drawSegmentedLine3(ctx, cam, w, h, { x, y, z: 0.035 }, { x: Math.min(max[0] - 0.4, x + 1.7), y, z: 0.035 }, mark, 2);
  }
}

function drawConcreteJoints(ctx, cam, w, h, min, max) {
  ctx.lineWidth = 1;
  const ink = "rgba(30, 28, 24, 0.22)";
  for (let x = Math.ceil(min[0] / 2) * 2; x < max[0]; x += 2) {
    drawSegmentedLine3(ctx, cam, w, h, { x, y: min[1], z: 0.02 }, { x, y: max[1], z: 0.02 }, ink, 4);
  }
  for (let y = Math.ceil(min[1] / 2) * 2; y < max[1]; y += 2) {
    drawSegmentedLine3(ctx, cam, w, h, { x: min[0], y, z: 0.02 }, { x: max[0], y, z: 0.02 }, ink, 4);
  }
}

const GRID_STEP = 1;
const GRID_MAJOR = 5;

export function drawSky3(ctx, w, h, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#141e28");
  g.addColorStop(0.36, "#2a3c48");
  g.addColorStop(0.58, "#5a5348");
  g.addColorStop(0.78, "#b07440");
  g.addColorStop(1, "#d49252");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const sunP = {
    x: cam.target.x + SUN.x * 90,
    y: cam.target.y + SUN.y * 90,
    z: Math.max(4, cam.target.z + SUN.z * 90),
  };
  const s = project3(cam, w, h, sunP);
  if (!s) return;
  const rg = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, Math.max(w, h) * 0.42);
  rg.addColorStop(0, "rgba(255, 230, 170, 0.7)");
  rg.addColorStop(0.12, "rgba(255, 190, 90, 0.32)");
  rg.addColorStop(0.4, "rgba(255, 130, 50, 0.1)");
  rg.addColorStop(1, "rgba(255, 110, 40, 0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
}

export function drawFloor3(ctx, cam, w, h, map, opts = {}) {
  const minx = map.min[0];
  const maxx = map.max[0];
  const miny = map.min[1];
  const maxy = map.max[1];
  const light = lightOf(cam);
  const ground = GROUND[map.ground] || GROUND.dirt;
  const step = cam.dist > 38 ? 4 : 2;
  drawTiledGround(ctx, cam, w, h, [minx, miny], [maxx, maxy], map.ground || "dirt", ground, 0, light, step);
  for (const s of map.surfaces || []) {
    if (!s.min || !s.max) continue;
    const kind = s.kind || "dirt";
    const hex = s.color || GROUND[kind] || GROUND.dirt;
    const z = kind === "road" ? 0.018 : 0.012;
    drawTiledGround(ctx, cam, w, h, s.min, s.max, kind, hex, z, light, kind === "road" ? 2 : step);
    if (kind === "road") drawRoadMarks(ctx, cam, w, h, s.min, s.max);
    if (kind === "concrete") drawConcreteJoints(ctx, cam, w, h, s.min, s.max);
  }
  if (opts.grid === false) return;
  const minor = "rgba(210, 220, 230, 0.045)";
  const major = "rgba(210, 220, 230, 0.12)";
  for (let x = minx; x <= maxx + 1e-6; x += GRID_STEP) {
    const ink = Math.abs(x - minx) % GRID_MAJOR < 1e-6 ? major : minor;
    drawSegmentedLine3(ctx, cam, w, h, { x, y: miny, z: 0.02 }, { x, y: maxy, z: 0.02 }, ink);
  }
  for (let y = miny; y <= maxy + 1e-6; y += GRID_STEP) {
    const ink = Math.abs(y - miny) % GRID_MAJOR < 1e-6 ? major : minor;
    drawSegmentedLine3(ctx, cam, w, h, { x: minx, y, z: 0.02 }, { x: maxx, y, z: 0.02 }, ink);
  }
}

function boxXY(c) {
  const x0 = Array.isArray(c.min) ? c.min[0] : c.min.x;
  const y0 = Array.isArray(c.min) ? c.min[1] : c.min.y;
  const x1 = Array.isArray(c.max) ? c.max[0] : c.max.x;
  const y1 = Array.isArray(c.max) ? c.max[1] : c.max.y;
  return { x0, y0, x1, y1 };
}

export function drawContactShadows3(ctx, cam, w, h, boxes) {
  const sx = -SUN.x / Math.max(0.28, SUN.z);
  const sy = -SUN.y / Math.max(0.28, SUN.z);
  for (const c of boxes) {
    if (c.roof) continue;
    const z0 = c.z0 ?? 0;
    if (z0 > 0.45) continue;
    const { x0, y0, x1, y1 } = boxXY(c);
    const area = (x1 - x0) * (y1 - y0);
    if (area < 0.02 || area > 14) continue;
    const hgt = (c.z1 ?? c.height ?? 1) - z0;
    if (hgt < 0.28) continue;
    const stretch = Math.min(2.4, 0.22 + hgt * 0.48);
    const ox = sx * stretch;
    const oy = sy * stretch;
    const pad = 0.06;
    const pts = [
      { x: x0 - pad + ox * 0.12, y: y0 - pad + oy * 0.12, z: 0.04 },
      { x: x1 + pad + ox * 0.12, y: y0 - pad + oy * 0.12, z: 0.04 },
      { x: x1 + pad + ox, y: y1 + pad + oy, z: 0.04 },
      { x: x0 - pad + ox, y: y1 + pad + oy, z: 0.04 },
    ].map((p) => project3(cam, w, h, p));
    if (pts.some((p) => !p)) continue;
    fillPoly(ctx, pts, "rgba(10, 7, 5, 0.3)");
  }
}

export function drawEmitPools3(ctx, cam, w, h, boxes) {
  for (const c of boxes) {
    if (!(c.emit > 0)) continue;
    const { x0, y0, x1, y1 } = boxXY(c);
    const cx = (x0 + x1) * 0.5;
    const cy = (y0 + y1) * 0.5;
    const r = 2.6 * (0.7 + c.emit);
    const rings = [
      [r, "rgba(255, 190, 90, 0.14)"],
      [r * 0.55, "rgba(255, 210, 120, 0.18)"],
    ];
    for (const [rad, fill] of rings) {
      const pts = [
        { x: cx - rad, y: cy - rad, z: 0.05 },
        { x: cx + rad, y: cy - rad, z: 0.05 },
        { x: cx + rad, y: cy + rad, z: 0.05 },
        { x: cx - rad, y: cy + rad, z: 0.05 },
      ].map((p) => project3(cam, w, h, p));
      if (pts.some((p) => !p)) continue;
      fillPoly(ctx, pts, fill);
    }
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

function textureFace(ctx, poly, tex, depth) {
  if (!tex || depth > 36) return;
  let minx = poly[0].x, maxx = poly[0].x, miny = poly[0].y, maxy = poly[0].y;
  for (let i = 1; i < 4; i++) {
    minx = Math.min(minx, poly[i].x); maxx = Math.max(maxx, poly[i].x);
    miny = Math.min(miny, poly[i].y); maxy = Math.max(maxy, poly[i].y);
  }
  const bw = maxx - minx;
  const bh = maxy - miny;
  if (bw < 12 || bh < 10) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.clip();
  if (tex === "ribs") {
    const step = Math.max(3.5, bw / 16);
    ctx.strokeStyle = "rgba(20, 18, 12, 0.32)";
    ctx.lineWidth = 1.5;
    for (let x = minx; x < maxx; x += step) {
      ctx.beginPath(); ctx.moveTo(x, miny); ctx.lineTo(x, maxy); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(220, 220, 190, 0.08)";
    ctx.lineWidth = 1;
    for (let x = minx + step * 0.45; x < maxx; x += step) {
      ctx.beginPath(); ctx.moveTo(x, miny); ctx.lineTo(x, maxy); ctx.stroke();
    }
  } else if (tex === "planks") {
    const step = Math.max(5, bh / 6);
    ctx.strokeStyle = "rgba(40, 24, 10, 0.28)";
    ctx.lineWidth = 1.2;
    for (let y = miny; y < maxy; y += step) {
      ctx.beginPath(); ctx.moveTo(minx, y); ctx.lineTo(maxx, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(30, 18, 8, 0.2)";
    for (let x = minx + bw * 0.33; x < maxx; x += bw * 0.33) {
      ctx.beginPath(); ctx.moveTo(x, miny); ctx.lineTo(x, maxy); ctx.stroke();
    }
  } else if (tex === "bags") {
    const step = Math.max(6, bh / 3.2);
    ctx.strokeStyle = "rgba(40, 32, 18, 0.3)";
    ctx.lineWidth = 1.4;
    for (let y = miny + step * 0.4; y < maxy; y += step) {
      ctx.beginPath();
      ctx.ellipse((minx + maxx) * 0.5, y, bw * 0.42, step * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (tex === "siding") {
    const step = Math.max(4, bh / 10);
    ctx.strokeStyle = "rgba(30, 28, 22, 0.2)";
    ctx.lineWidth = 1;
    for (let y = miny; y < maxy; y += step) {
      ctx.beginPath(); ctx.moveTo(minx, y); ctx.lineTo(maxx, y); ctx.stroke();
    }
  } else if (tex === "canvas") {
    ctx.strokeStyle = "rgba(40, 28, 12, 0.16)";
    ctx.lineWidth = 1;
    const step = Math.max(7, bw / 8);
    for (let x = minx; x < maxx; x += step) {
      ctx.beginPath(); ctx.moveTo(x, miny); ctx.lineTo(x + bh * 0.08, maxy); ctx.stroke();
    }
  } else if (tex === "mesh") {
    ctx.strokeStyle = "rgba(18, 20, 22, 0.28)";
    ctx.lineWidth = 0.8;
    const step = Math.max(4, Math.min(bw, bh) / 9);
    for (let x = minx; x < maxx; x += step) {
      ctx.beginPath(); ctx.moveTo(x, miny); ctx.lineTo(x, maxy); ctx.stroke();
    }
    for (let y = miny; y < maxy; y += step) {
      ctx.beginPath(); ctx.moveTo(minx, y); ctx.lineTo(maxx, y); ctx.stroke();
    }
  } else if (tex === "stripe") {
    ctx.fillStyle = "rgba(210, 170, 40, 0.38)";
    ctx.fillRect(minx, miny + bh * 0.32, bw, bh * 0.22);
  } else if (tex === "leaves") {
    ctx.fillStyle = "rgba(20, 40, 16, 0.16)";
    const n = 5;
    for (let i = 0; i < n; i++) {
      const px = minx + bw * ((i * 37) % 100) / 100;
      const py = miny + bh * ((i * 53) % 100) / 100;
      ctx.fillRect(px, py, bw * 0.22, bh * 0.18);
    }
  }
  ctx.restore();
}

export function drawScene3(ctx, cam, w, h, parts) {
  const light = lightOf(cam);
  const faces = [];
  for (const part of parts) {
    const pts = part.corners.map((p) => project3(cam, w, h, p));
    const cover = part.name === "cover";
    const resolvedMat = part.mat || inferPartMat(part.name);
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
      faces.push({
        poly, depth, color: part.color, n,
        ghost: !!part.ghost, stroke: !cover || !!part.ghost,
        mat: resolvedMat, tex: part.tex || null, emit: part.emit || 0,
      });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.poly[0].x, f.poly[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(f.poly[i].x, f.poly[i].y);
    ctx.closePath();
    if (f.ghost) ctx.globalAlpha = 0.5;
    ctx.fillStyle = shade(f.color, f.n, cam, light, f.mat, f.depth, f.emit);
    ctx.fill();
    textureFace(ctx, f.poly, f.tex, f.depth);
    if (f.stroke) {
      ctx.strokeStyle = f.ghost ? "rgba(215,177,90,0.9)" : "rgba(28, 22, 16, 0.36)";
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
  cam.pitch = Math.min(1.52, Math.max(0.18, cam.pitch + dPitch));
}

export function zoomCam(cam, factor) {
  cam.dist = Math.min(120, Math.max(3.2, cam.dist * factor));
}

export { eyeOf };
