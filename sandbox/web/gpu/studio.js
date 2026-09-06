import { instantiatePlace } from "../engine/props.js";
import { coverBox } from "../engine/body.js";
import { makeCam3, fovOf } from "./camera.js";
import { sunDir } from "./theme.js";

export const PHOTO_SKIP = new Set(["panel", "block"]);

export const PHOTO_ANGLES = [
  { id: "hero", name: "3/4", yaw: -2.35, pitch: 0.40 },
  { id: "front", name: "front", yaw: Math.PI, pitch: 0.26 },
  { id: "side", name: "side", yaw: -Math.PI / 2, pitch: 0.30 },
  { id: "high", name: "high", yaw: -2.55, pitch: 0.88 },
];

/** 4×4 orbit for a single object. Every cell is pitched; none sit on a cardinal. */
export const PHOTO_SHEET_ANGLES = (() => {
  const pitches = [0.22, 0.42, 0.68, 0.98];
  const yaws = [-2.48, -1.82, -0.72, 0.58];
  const out = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out.push({
        id: `r${r}c${c}`,
        name: `${r},${c}`,
        yaw: yaws[c] + (r - 1.5) * 0.12,
        pitch: pitches[r] + (c - 1.5) * 0.028,
      });
    }
  }
  return out;
})();

export function objectParts(def) {
  if (!def?.parts) throw new Error("studio needs a prop with parts");
  return instantiatePlace(def, { prop: def.id, id: def.id, pos: [0, 0] });
}

export function objectBounds(parts) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of parts || []) {
    const min = p.min;
    const max = p.max;
    const pz0 = p.z0 ?? 0;
    const pz1 = p.z1 ?? p.height ?? 1;
    x0 = Math.min(x0, min.x);
    y0 = Math.min(y0, min.y);
    z0 = Math.min(z0, pz0);
    x1 = Math.max(x1, max.x);
    y1 = Math.max(y1, max.y);
    z1 = Math.max(z1, pz1);
  }
  if (!Number.isFinite(x0)) {
    x0 = -0.5; y0 = -0.5; z0 = 0;
    x1 = 0.5; y1 = 0.5; z1 = 1;
  }
  const cx = (x0 + x1) * 0.5;
  const cy = (y0 + y1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  const r = Math.max(0.45, Math.hypot((x1 - x0) * 0.5, (y1 - y0) * 0.5, (z1 - z0) * 0.5));
  return { x0, y0, z0, x1, y1, z1, cx, cy, cz, r };
}

export function frameObjectCam(bounds, angle = PHOTO_ANGLES[0], cam = makeCam3()) {
  cam.target = { x: bounds.cx, y: bounds.cy, z: bounds.cz };
  cam.yaw = angle.yaw;
  cam.pitch = angle.pitch;
  cam.fpv = false;
  cam.overview = false;
  cam.dist = (bounds.r / fovOf(cam)) * 1.34;
  return cam;
}

export function photoLights(bounds) {
  const r = bounds.r;
  const { cx, cy, cz } = bounds;
  return [
    { x: cx + r * 1.55, y: cy - r * 0.75, z: cz + r * 1.85, range: r * 7, r: 1, g: 0.86, b: 0.68, intensity: 1.85, kind: "omni" },
    { x: cx - r * 1.7, y: cy + r * 1.15, z: cz + r * 0.85, range: r * 6.5, r: 0.55, g: 0.68, b: 0.92, intensity: 0.48, kind: "omni" },
    { x: cx - r * 0.35, y: cy + r * 1.85, z: cz + r * 1.45, range: r * 5.5, r: 1, g: 0.94, b: 0.86, intensity: 0.72, kind: "omni" },
  ];
}

export function photoObjects(catalog) {
  return Object.values(catalog?.props || {})
    .filter((def) => def?.id && def.parts && !PHOTO_SKIP.has(def.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function asSolid(part) {
  return {
    ...coverBox(part),
    color: part.color || "#f2f0ea",
    mat: part.mat || null,
    tex: part.tex || null,
    surf: part.surf || null,
    emit: part.emit || 0,
    roof: false,
  };
}

export function buildStudioFrame(def, opts = {}) {
  const parts = objectParts(def);
  const bounds = objectBounds(parts);
  const angle = opts.angle || PHOTO_ANGLES[0];
  const cam = frameObjectCam(bounds, angle, opts.cam || makeCam3());
  const pad = Math.max(8, bounds.r * 2.8);
  const solids = parts.map(asSolid);
  return {
    cam,
    sun: true,
    sunIntensity: 0.58,
    sunDir: sunDir(208, 36),
    lights: photoLights(bounds),
    map: {
      min: { x: bounds.cx - pad, y: bounds.cy - pad },
      max: { x: bounds.cx + pad, y: bounds.cy + pad },
      ground: "concrete",
      surfaces: [],
    },
    solids,
    casters: solids,
    marks: {
      labels: opts.label
        ? [{
          pos: { x: bounds.cx, y: bounds.cy, z: bounds.z1 + 0.28 },
          text: def.id,
          color: "#f4ecd4",
          scale: 1.15,
        }]
        : [],
    },
    exact: true,
  };
}
