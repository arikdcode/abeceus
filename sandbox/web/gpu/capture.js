import { Engine, loadCatalog, worldFromCatalog, unitHitboxes, coverBox } from "../engine/engine.js";
import { frameOverview3, makeCam3 } from "./camera.js";
import { drawFrame, initRenderer, resizeCanvas } from "./renderer.js";

export const PRESETS = {
  overview: { scenario: "outpost", hideRoofs: true, cam: null },
  "overview-far": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 32, y: 24, z: 0 }, yaw: -Math.PI / 2 - 0.48, pitch: 0.62, dist: 120, overview: true },
  },
  "fence-near": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 22, y: 14, z: 1.05 }, yaw: Math.PI, pitch: 0.06, dist: 4.2, overview: false },
  },
  "fence-close": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 22, y: 14, z: 0.95 }, yaw: Math.PI, pitch: 0.08, dist: 1.1, overview: false },
  },
  bravo1: {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 28.6, y: 18.2, z: 0.35 }, yaw: -0.55, pitch: 0.52, dist: 8.5 },
  },
  "office-in": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 50, y: 34.2, z: 1.2 }, yaw: -Math.PI / 2, pitch: 0.22, dist: 5.6 },
  },
  "tent-in": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 38, y: 13, z: 1.05 }, yaw: 0.25, pitch: 0.38, dist: 5.2 },
  },
  "booth-in": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 25.6, y: 28.8, z: 1.05 }, yaw: 2.15, pitch: 0.36, dist: 3.1 },
  },
  "alpha2-lamp": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 8.3, y: 18.5, z: 0.55 }, yaw: 2.55, pitch: 0.68, dist: 7.8 },
  },
  bravo3: {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 47.4, y: 33.6, z: 0.35 }, yaw: 2.35, pitch: 0.48, dist: 9.2 },
  },
  "tent-wall": {
    scenario: "outpost",
    hideRoofs: true,
    cam: { target: { x: 37.6, y: 16.8, z: 0.2 }, yaw: 0.15, pitch: 0.58, dist: 6.8 },
  },
  "night-range": { scenario: "night_range", hideRoofs: true, cam: null },
  "night-street": {
    scenario: "night_range",
    hideRoofs: true,
    cam: { target: { x: 34.6, y: 22.2, z: 0.4 }, yaw: 2.9, pitch: 0.42, dist: 9.4 },
  },
};

function isRoof(c) {
  if (!c) return false;
  if (c.roof) return true;
  const id = c.id || "";
  return id === "roof" || id.endsWith("-roof");
}

function slabOf(c) {
  const x0 = Array.isArray(c.min) ? c.min[0] : c.min.x;
  const y0 = Array.isArray(c.min) ? c.min[1] : c.min.y;
  const x1 = Array.isArray(c.max) ? c.max[0] : c.max.x;
  const y1 = Array.isArray(c.max) ? c.max[1] : c.max.y;
  return { min: { x: x0, y: y0 }, max: { x: x1, y: y1 }, z0: c.z0 ?? 0, z1: c.z1 ?? c.height ?? 1 };
}

function partHex(name, team) {
  if (name === "gun" || (name && name.startsWith("gun_"))) return "#3a4048";
  const [r, g, b] = team === 0 ? [110, 168, 255] : [255, 138, 110];
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

async function readContent(path) {
  const res = await fetch(`/content/${path}`);
  if (!res.ok) throw new Error(`content ${path}: ${res.status}`);
  return res.text();
}

function applyCam(cam, spec, map) {
  if (!spec) {
    frameOverview3(cam, map);
    return cam;
  }
  cam.target = { ...spec.target };
  cam.yaw = spec.yaw;
  cam.pitch = spec.pitch;
  cam.dist = spec.dist;
  cam.fpv = false;
  cam.overview = spec.overview !== false;
  return cam;
}

export function buildFrame(eng, opts = {}) {
  const hideRoofs = opts.hideRoofs !== false;
  const view = eng.view({ fog: false });
  const map = view.map;
  const visible = [];
  const casters = [];
  const add = (c, color) => {
    const part = {
      ...coverBox(slabOf(c)),
      color,
      roof: isRoof(c),
      mat: c.mat || null,
      tex: c.tex || null,
      emit: c.emit || 0,
    };
    casters.push(part);
    if (!(hideRoofs && part.roof)) visible.push(part);
  };
  for (const c of map.decor || []) add(c, c.color || "#6a7b66");
  for (const c of map.cover || []) add(c, c.color || "#6a7b66");
  const bodies = [];
  for (const vu of view.units) {
    const u = eng.world.units.find((x) => x.id === vu.id);
    if (!u) continue;
    for (const b of unitHitboxes(u)) {
      bodies.push({ ...b, color: partHex(b.name, vu.team), mat: null });
    }
  }
  return {
    cam: opts.cam,
    sun: opts.sun !== false,
    map,
    solids: [...visible, ...bodies],
    casters: [...casters, ...bodies],
    marks: {
      grid: !!opts.grid,
      shadows: [...(map.decor || []), ...(map.cover || [])],
      paths: [],
      rings: [],
      lines: [],
      rects: [],
      labels: [],
      edges: [],
    },
  };
}

export async function renderShot(canvas, opts = {}) {
  const preset = opts.preset ? PRESETS[opts.preset] : null;
  if (opts.preset && !preset) throw new Error(`unknown preset ${opts.preset}`);
  const scenario = opts.scenario || preset?.scenario || "outpost";
  const hideRoofs = opts.hideRoofs ?? preset?.hideRoofs ?? true;
  const catalog = await loadCatalog(readContent);
  const eng = new Engine();
  if (!eng.loadWorld(worldFromCatalog(catalog, scenario))) throw new Error(`load ${scenario} failed`);
  const map = eng.view({ fog: false }).map;
  const cam = applyCam(makeCam3(), opts.cam || preset?.cam, map);
  if (!await initRenderer()) throw new Error("WebGL2 init failed");
  const w = opts.width || canvas.width || 1280;
  const h = opts.height || canvas.height || 720;
  resizeCanvas(canvas, w, h);
  const frame = buildFrame(eng, { cam, hideRoofs, grid: !!opts.grid, sun: opts.sun !== false });
  const warm = opts.warm || 4;
  for (let i = 0; i < warm; i++) {
    if (!drawFrame(canvas, frame)) throw new Error("drawFrame failed");
  }
  return { name: opts.name || opts.preset || "shot", cam, scenario, hideRoofs, sun: opts.sun !== false };
}
