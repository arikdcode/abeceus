import { Engine, loadCatalog, worldFromCatalog, unitHitboxes, coverBox, muzzleWorld, rayLocalBox, rayCover, nearestUse, useBounds, resolveCoverUse, CoverMode, partFamily, prettyPart } from "./engine/engine.js";
import { ActionType, Gait, ShotMode, AimRegion, Phase } from "./engine/model.js";
import { rotate } from "./engine/vec.js";
import { makeCam3, frameCam3, frameOverview3, drawScene3, drawFloor3, drawSky3, drawContactShadows3, drawEmitPools3, drawPolyline3, drawLabel3, screenRay, hitGround, orbitCam, zoomCam, project3, eyeOf, GROUND, sliceBox3 } from "./view3d.js";
import { stepHeldCam, stepOrbitKey } from "./engine/camstep.js";

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const camera = { x: 10, y: 8, zoom: 34 };
const keys = new Set();
const eng = new Engine();
const eventLog = [];

let view = null;
let inspected = 0;
let aimOffset = null;
let preciseAim = false;
let hoverWorld = null;
let hoverUnit = null;
let hoverPart = null;
let hoverShotMode = null;
let tapePreview = null;
let posePreview = null;
let coverPreview = null;
let movePreview = null;
let scanHold = 0;
let shotPreview = null;
let shotPreviewKey = "";
let fog = false;
let owAim = false;
let mapMode = "3d";
let hideRoofs = localStorage.getItem("sandbox.hideRoofs") !== "show";
let hideGrid = localStorage.getItem("sandbox.hideGrid") === "hide";
const cam3 = makeCam3();
let camKind = "strategy";
let silView = null;
let savedStrategy = null;
let orbiting = false;
let didOrbit = false;

const MOVE_LINE = "rgba(110,207,154,0.9)";
const SHOT_CLEAR = "#5ad67a";
const SHOT_BLOCKED = "#e05656";

const teamColor = (t) => (t === 0 ? "#6ea8ff" : "#ff8a6e");

function toggleVal(id) {
  return document.getElementById(id).dataset.value;
}

function quoteOf(list, id) {
  return (list || []).find((q) => q.id === id);
}

function actorId() {
  return view?.active || 0;
}

function worldUnit(id) {
  return eng.world.units.find((u) => u.id === id) || null;
}

function refresh() {
  view = eng.view({ fog });
  tapePreview = null;
  posePreview = null;
  movePreview = null;
  shotPreviewKey = "";
  window.clearTimeout(scanHold);
  render();
  renderChrome();
}

function previewKeepsScan(el) {
  return !!(el && el.closest && el.closest("#map, #actionBtns, #inspect .act-table"));
}

function dropScanPreview() {
  window.clearTimeout(scanHold);
  if (!movePreview) return;
  movePreview = null;
  tapePreview = null;
  syncShotPreview();
  updateInspectShots();
  render();
  renderTimeline();
}

function holdScanOrDrop(el) {
  window.clearTimeout(scanHold);
  if (previewKeepsScan(el)) return;
  scanHold = window.setTimeout(dropScanPreview, 160);
}

function currentShotTarget() {
  if (!view) return null;
  const actor = view.units.find((x) => x.id === actorId());
  if (!actor) return null;
  const pick = (u) => (u && u.team !== actor.team && !u.downed ? u : null);
  return pick(hoverUnit) || pick(inspectSubject());
}

function actorOverrides() {
  const u = worldUnit(actorId());
  const o = {};
  if (movePreview?.ok) {
    o.pos = { x: movePreview.dest.x, y: movePreview.dest.y };
    o.last_gait = movePreview.gait;
  }
  if (posePreview) o.posture = posePreview;
  const pos = o.pos || (u ? eng.plannedPos(u) : null);
  if (coverPreview && u && pos) {
    const use = resolveCoverUse(eng.world, pos, coverPreview);
    if (use) {
      o.cover_use = use;
      o.pos = use.slot;
      o.facing = use.facing;
    } else {
      o.cover_use = null;
    }
  }
  const tgt = currentShotTarget();
  if (u && pos && tgt) {
    const tp = asXY(tgt.pos);
    o.facing = Math.atan2(tp.y - pos.y, tp.x - pos.x);
  } else if (movePreview?.ok) {
    const d = movePreview.dest;
    const f = movePreview.from;
    if (Math.hypot(d.x - f.x, d.y - f.y) > 0.05) o.facing = Math.atan2(d.y - f.y, d.x - f.x);
  } else if (u && pos && Math.hypot(pos.x - u.pos.x, pos.y - u.pos.y) > 0.05) {
    o.facing = Math.atan2(pos.y - u.pos.y, pos.x - u.pos.x);
  }
  return o;
}

function ghostActor() {
  const u = worldUnit(actorId());
  if (!u) return null;
  return eng.previewActor(u, actorOverrides());
}

function pushEvents(events) {
  if (!events) return;
  for (const e of events) eventLog.push(e.text);
}

function agentDump(reason) {
  const body = {
    ...eng.dumpState({ reason }),
    events: eventLog.slice(-80),
    fire: toggleVal("fire"),
    gait: toggleVal("gait"),
    aim: toggleVal("aim"),
  };
  window.__lastDump = body;
  fetch("/debug/dump", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
  return body;
}

function applyNow(action) {
  const r = eng.apply(action);
  pushEvents(r.events);
  refresh();
  agentDump(r.ok ? `apply ${action.type}` : `apply-fail ${action.type}`);
  return r;
}

function executeNow() {
  const queued = eng.dumpState({ reason: "pre-execute" }).queue;
  const r = eng.executeQueue();
  pushEvents(r.events);
  refresh();
  const body = agentDump(r.ok ? "execute" : "execute-fail");
  body.preExecuteQueue = queued;
  window.__lastDump = body;
  fetch("/debug/dump", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
  return r;
}

function queueNow(action, ev) {
  action.overlap = !!(ev && (ev.ctrlKey || ev.metaKey));
  const r = eng.schedule(action);
  if (!r.ok) {
    eventLog.push(r.error || "could not queue");
  }
  refresh();
  agentDump(r.ok ? `queue ${action.type}${action.shot ? ` ${action.shot}` : ""}` : `queue-fail ${action.type}: ${r.error || ""}`);
  return r;
}

function syncCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return rect;
}

function canvasXY(ev) {
  const rect = syncCanvasSize();
  return {
    sx: (ev.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
    sy: (ev.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
  };
}

function worldFromEvent(ev) {
  const { sx, sy } = canvasXY(ev);
  return {
    x: camera.x + (sx - canvas.width / 2) / camera.zoom,
    y: camera.y - (sy - canvas.height / 2) / camera.zoom,
  };
}

function aimRegionForPart(part) {
  const fam = partFamily(part);
  if (fam === "head") return AimRegion.Head;
  if (fam === "legs") return AimRegion.Legs;
  return AimRegion.Torso;
}

function partLabel(part) {
  return prettyPart(part);
}

const hitboxCache = new WeakMap();

function cachedHitboxes(u) {
  if (!u) return [];
  const cover = u.cover_use;
  let e = hitboxCache.get(u);
  if (
    e
    && e.x === u.pos.x && e.y === u.pos.y
    && e.facing === (u.facing || 0)
    && e.posture === u.posture
    && e.downed === !!u.downed
    && e.cover === cover
  ) return e.boxes;
  const boxes = unitHitboxes(u);
  hitboxCache.set(u, {
    boxes,
    x: u.pos.x, y: u.pos.y,
    facing: u.facing || 0,
    posture: u.posture,
    downed: !!u.downed,
    cover,
  });
  return boxes;
}

function keepDrawnPart(b, far) {
  if (!far) return true;
  if (b.armor || b.name === "skull" || b.name === "chest" || b.name === "abdomen" || b.name === "pelvis") return true;
  if (b.name === "gun" || b.name?.startsWith("gun_")) return true;
  return (b.hx || 0) + (b.hy || 0) + (b.hz || 0) > 0.18;
}

function pickFromEvent(ev) {
  if (mapMode === "3d") {
    const { sx, sy } = canvasXY(ev);
    const ray = screenRay(cam3, canvas.width, canvas.height, sx, sy);
    let unit = null;
    let part = null;
    let best = 1e9;
    const far = cam3.dist > 30;
    for (const vu of visibleUnits()) {
      const u = worldUnit(vu.id);
      if (!u) continue;
      for (const b of cachedHitboxes(u)) {
        if (!b.flesh && !b.armor) continue;
        if (!keepDrawnPart(b, far)) continue;
        const t = rayLocalBox(ray.origin, ray.dir, b, u.pos, u.facing || 0, 80);
        if (t != null && t < best) {
          best = t;
          unit = vu;
          part = b.name;
        }
      }
    }
    return { unit, part, ground: hitGround(ray) };
  }
  const w = worldFromEvent(ev);
  return { unit: unitAt(w), part: null, ground: w };
}

function placeHoverHud(ev) {
  const hud = document.getElementById("hoverHud");
  const stage = canvas.getBoundingClientRect();
  hud.style.left = `${ev.clientX - stage.left + 14}px`;
  hud.style.top = `${ev.clientY - stage.top + 14}px`;
}

function toScreen(p) {
  const x = Array.isArray(p) ? p[0] : p.x;
  const y = Array.isArray(p) ? p[1] : p.y;
  return {
    x: canvas.width / 2 + (x - camera.x) * camera.zoom,
    y: canvas.height / 2 - (y - camera.y) * camera.zoom,
  };
}

function visibleUnits() {
  return (view?.units || []).filter((u) => u.visible !== false);
}

function unitAt(w) {
  for (const u of visibleUnits()) {
    const dx = w.x - u.pos[0];
    const dy = w.y - u.pos[1];
    if (dx * dx + dy * dy < 0.45 * 0.45) return u;
  }
  return null;
}

function fillWorldRect(min, max, hex) {
  const a = toScreen([min[0], max[1]]);
  const b = toScreen([max[0], min[1]]);
  ctx.fillStyle = hex;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
}

function drawGrid() {
  const map = view.map;
  const step = 1;
  const majorEvery = 5;
  fillWorldRect(map.min, map.max, GROUND[map.ground] || GROUND.dirt);
  for (const s of map.surfaces || []) {
    if (!s.min || !s.max) continue;
    fillWorldRect(s.min, s.max, s.color || GROUND[s.kind] || GROUND.dirt);
    if (s.kind === "road") {
      const y = (s.min[1] + s.max[1]) * 0.5;
      ctx.strokeStyle = "rgba(210, 190, 70, 0.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 16]);
      const a = toScreen([s.min[0] + 1, y]);
      const b = toScreen([s.max[0] - 1, y]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (hideGrid) return;
  ctx.lineWidth = 1;
  for (let x = map.min[0]; x <= map.max[0] + 1e-6; x += step) {
    const a = toScreen([x, map.min[1]]);
    const b = toScreen([x, map.max[1]]);
    ctx.strokeStyle = Math.abs(x - map.min[0]) % majorEvery < 1e-6 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = map.min[1]; y <= map.max[1] + 1e-6; y += step) {
    const a = toScreen([map.min[0], y]);
    const b = toScreen([map.max[0], y]);
    ctx.strokeStyle = Math.abs(y - map.min[1]) % majorEvery < 1e-6 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

function hotCoverIndex() {
  const pts = [];
  if (hoverWorld) pts.push(hoverWorld);
  const ghost = ghostActor();
  if (ghost) pts.push(ghost.pos);
  const u = worldUnit(actorId());
  if (u) pts.push(eng.plannedPos(u));
  for (const p of pts) {
    const near = nearestUse(eng.world, p);
    if (near) return near.index;
  }
  return -1;
}

function drawBox2d(c, fill, stroke) {
  const a = toScreen([c.min[0], c.max[1]]);
  const b = toScreen([c.max[0], c.min[1]]);
  ctx.fillStyle = fill;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}

function isRoof(c) {
  if (!c) return false;
  if (c.roof) return true;
  const id = c.id || "";
  return id === "roof" || id.endsWith("-roof");
}

function drawCover() {
  const hot = hotCoverIndex();
  for (const c of view.map.decor || []) {
    if (hideRoofs && isRoof(c)) continue;
    ctx.globalAlpha = 0.55;
    drawBox2d(c, c.color || "#6a7b66", "rgba(40,32,24,0.35)");
    ctx.globalAlpha = 1;
  }
  view.map.cover.forEach((c, i) => {
    if (hideRoofs && isRoof(c)) return;
    const frac = c.durability_max ? c.durability / c.durability_max : 1;
    ctx.globalAlpha = frac < 0.05 ? 1 : 0.45 + 0.5 * frac;
    drawBox2d(c, frac < 0.05 ? "#2a2a2a" : (c.color || "#6a7b66"), i === hot ? "#d7b15a" : "#6d7c64");
    ctx.globalAlpha = 1;
    if (i === hot || coverPreview) {
      const raw = eng.world.map.cover[i];
      if (!raw) return;
      const zone = useBounds(raw);
      const za = toScreen([zone.min.x, zone.max.y]);
      const zb = toScreen([zone.max.x, zone.min.y]);
      ctx.strokeStyle = "rgba(215,177,90,0.7)";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(za.x, za.y, zb.x - za.x, zb.y - za.y);
      ctx.setLineDash([]);
    }
  });
}

function asXY(p) {
  if (!p) return { x: 0, y: 0 };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function coverAsRay(c) {
  const min = Array.isArray(c.min) ? { x: c.min[0], y: c.min[1] } : c.min;
  const max = Array.isArray(c.max) ? { x: c.max[0], y: c.max[1] } : c.max;
  return {
    min, max,
    z0: c.z0 ?? 0,
    z1: c.z1 ?? c.height ?? 1,
    height: c.z1 ?? c.height ?? 1,
    durability: c.durability,
  };
}

function coverClipT(origin, dir, maxT) {
  let best = maxT;
  for (const raw of view?.map?.cover || []) {
    const c = coverAsRay(raw);
    if (c.durability != null && c.durability <= 0) continue;
    const t = rayCover(origin, dir, c, maxT);
    if (t != null && t > 0.04 && t < best) best = t;
  }
  return best;
}

function add3(a, d, t) {
  return { x: a.x + d.x * t, y: a.y + d.y * t, z: (a.z || 0) + (d.z || 0) * t };
}

function drawCone(origin, aimPoint, half) {
  const o = asXY(origin);
  const a = asXY(aimPoint);
  const delta = { x: a.x - o.x, y: a.y - o.y };
  const dist = Math.max(0.4, Math.hypot(delta.x, delta.y));
  const ang = Math.atan2(delta.y, delta.x);
  const dir = { x: Math.cos(ang), y: Math.sin(ang), z: 0 };
  const z = origin?.z ?? 1.1;
  const len = coverClipT({ x: o.x, y: o.y, z }, dir, dist + 0.4);
  const os = toScreen(o);
  const l = toScreen([o.x + Math.cos(ang + half) * len, o.y + Math.sin(ang + half) * len]);
  const r = toScreen([o.x + Math.cos(ang - half) * len, o.y + Math.sin(ang - half) * len]);
  ctx.beginPath();
  ctx.moveTo(os.x, os.y); ctx.lineTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.closePath();
  ctx.fillStyle = "rgba(232,168,72,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(232,168,72,0.55)";
  ctx.stroke();
}

function drawShotLine2(origin, dest) {
  const o = { ...asXY(origin), z: origin.z ?? 1.2 };
  const dxy = asXY(dest);
  const end = { x: dxy.x, y: dxy.y, z: dest.z ?? 1.2 };
  const raw = { x: end.x - o.x, y: end.y - o.y, z: (end.z || 0) - (o.z || 0) };
  const len = Math.max(1e-6, Math.hypot(raw.x, raw.y, raw.z));
  const dir = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
  const tHit = coverClipT(o, dir, len);
  const s = toScreen(o);
  const mid = toScreen(add3(o, dir, Math.min(tHit, len)));
  const e = toScreen(end);
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(mid.x, mid.y);
  ctx.strokeStyle = SHOT_CLEAR; ctx.stroke();
  if (tHit < len - 0.04) {
    ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = SHOT_BLOCKED; ctx.stroke();
  }
}

function shotTargetDowned(shot) {
  const id = shot?.target || shot?.intended || shot?.struck;
  if (!id) return false;
  const u = worldUnit(id) || view?.units.find((x) => x.id === id);
  return !!(u && (u.downed || u.dead));
}

function drawShotGeom(prev) {
  if (!prev?.ok || shotTargetDowned(prev)) return;
  const origin = prev.origin;
  const aim = prev.aim_world || {
    x: asXY(origin).x + asXY(prev.aim_dir).x * (prev.distance || 8),
    y: asXY(origin).y + asXY(prev.aim_dir).y * (prev.distance || 8),
  };
  drawCone(origin, aim, prev.cone_half_rad || 0);
  drawShotLine2(origin, { ...asXY(aim), z: prev.aim_offset?.z ?? 1.2 });
  const dir = asXY(prev.aim_dir);
  const perp = rotate(dir, 1.5707963);
  const rad = prev.radius || prev.sigma || 0;
  if (rad > 0.02) {
    const a = { x: aim.x + perp.x * rad, y: aim.y + perp.y * rad };
    const b = { x: aim.x - perp.x * rad, y: aim.y - perp.y * rad };
    const sa = toScreen(a);
    const sb = toScreen(b);
    ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y);
    ctx.strokeStyle = "#d7b15a";
    ctx.setLineDash([3, 3]);
    ctx.stroke(); ctx.setLineDash([]);
    const c = toScreen(aim);
    ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#d7b15a"; ctx.fill();
  }
}

function selectedGait() {
  return view?.phase === Phase.Contact ? Gait.Walk : toggleVal("gait");
}

function gaitReach() {
  return quoteOf(view?.quotes?.gaits, selectedGait())?.radius || 0;
}

function reachOrigin() {
  const u = worldUnit(actorId());
  if (!u) return null;
  return eng.plannedPos(u);
}

function reachRingColor() {
  return selectedGait() === Gait.Walk ? "rgba(110,168,255,0.5)" : "rgba(215,177,90,0.6)";
}

function drawMovePath3(ctx, cam, w, h, pts, color) {
  if (!pts || pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i++) {
    drawPolyline3(ctx, cam, w, h, [pts[i], pts[i + 1]], color, [5, 4]);
  }
}

function drawMovePath2(pts, color) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  const a = toScreen(pts[0]);
  ctx.moveTo(a.x, a.y);
  for (let i = 1; i < pts.length; i++) {
    const p = toScreen(pts[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  const e = toScreen(pts[pts.length - 1]);
  ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

function drawGroundRect3(min, max, color) {
  const z = 0.03;
  drawPolyline3(ctx, cam3, canvas.width, canvas.height, [
    { x: min.x, y: min.y, z }, { x: max.x, y: min.y, z },
    { x: max.x, y: max.y, z }, { x: min.x, y: max.y, z },
    { x: min.x, y: min.y, z },
  ], color, [6, 4]);
}

function drawCoverUseRings3() {
  const hot = hotCoverIndex();
  view.map.cover.forEach((c, i) => {
    if (i !== hot && !coverPreview) return;
    const raw = eng.world.map.cover[i];
    if (!raw) return;
    const zone = useBounds(raw);
    drawGroundRect3(zone.min, zone.max, "rgba(215,177,90,0.75)");
    drawGroundRect3(raw.min, raw.max, i === hot ? "#d7b15a" : "#8a9a7a");
  });
}

function drawReachRing3(origin, radius) {
  if (!radius || radius < 0.05) return;
  const ring = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ring.push({ x: origin.x + Math.cos(a) * radius, y: origin.y + Math.sin(a) * radius, z: 0.04 });
  }
  drawPolyline3(ctx, cam3, canvas.width, canvas.height, ring, reachRingColor());
}

function drawCircle(origin, radius, color) {
  if (!radius || radius <= 0.05) return;
  const p = toScreen(origin);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius * camera.zoom, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawUnit2(u, opts = {}) {
  const p = toScreen(u.pos);
  const r = (u.posture === "prone" ? 0.22 : u.posture === "crouch" ? 0.28 : 0.32) * camera.zoom;
  ctx.globalAlpha = opts.ghost ? 0.45 : 1;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * (u.posture === "prone" ? 1.4 : 1), r, 0, 0, Math.PI * 2);
  ctx.fillStyle = u.downed || u.dead ? "#444" : teamColor(u.team);
  ctx.fill();
  ctx.lineWidth = opts.ghost ? 2 : (u.active || u.id === inspected ? 3 : 1.5);
  ctx.strokeStyle = opts.ghost ? "#d7b15a" : (u.overwatch ? "#8b7cc4" : (u.active ? "#d7b15a" : "#0d1014"));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(u.facing) * r * 1.5, p.y - Math.sin(u.facing) * r * 1.5);
  ctx.strokeStyle = "#f4f7fb";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = opts.ghost ? "#d7b15a" : "#e8edf4";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${u.name}${opts.ghost ? " …" : (u.contact_ready ? " ✓" : "")}`, p.x, p.y - r - 7);
}

function drawUnits() {
  const ghost = ghostActor();
  const real = worldUnit(actorId());
  const moved = ghost && real && Math.hypot(ghost.pos.x - real.pos.x, ghost.pos.y - real.pos.y) > 0.08;
  for (const u of visibleUnits()) {
    if (u.id === actorId() && ghost && !moved) {
      drawUnit2({ ...u, pos: ghost.pos, posture: ghost.posture, facing: ghost.facing });
    } else {
      drawUnit2(u);
    }
  }
  if (moved && ghost) drawUnit2({ ...visibleUnits().find((x) => x.id === actorId()), ...ghost, pos: ghost.pos }, { ghost: true });
}

function partHex(name, team, down, hot) {
  if (name === "gun" || name.startsWith("gun_")) return name === "gun" ? "#3a4048" : "#2c3238";
  const fam = partFamily(name);
  if (fam === "armor") return hot ? "#c4b48a" : (down ? "#3a3a3a" : "#7a828c");
  if (down) return "#3a3a3a";
  const [r, g, b] = team === 0 ? [110, 168, 255] : [255, 138, 110];
  const k = fam === "head" ? 0.62 : fam === "legs" ? 0.52 : fam === "hands" ? 0.72 : fam === "arms" ? 0.78
    : name === "abdomen" || name === "pelvis" ? 0.86 : 1;
  const mix = hot ? 0.45 : 0;
  const h = (n, gold) => Math.max(0, Math.min(255, Math.round(n * k * (1 - mix) + gold * mix))).toString(16).padStart(2, "0");
  return `#${h(r, 240)}${h(g, 215)}${h(b, 138)}`;
}

function drawBoxEdges3(box, color) {
  const c = box.corners;
  if (!c || c.length < 8) return;
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of edges) drawPolyline3(ctx, cam3, canvas.width, canvas.height, [c[a], c[b]], color);
}

function render() {
  syncCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!view) return;
  if (mapMode === "3d") {
    render3();
    return;
  }
  render2d();
}

function applyFpvCam() {
  const u = ghostActor() || worldUnit(actorId());
  if (!u) return false;
  const facing = u.facing || 0;
  const eye = shotPreview?.origin3 || muzzleWorld(u);
  const look = (shotPreview?.ok && shotPreview.aim_world)
    ? { x: shotPreview.aim_world.x, y: shotPreview.aim_world.y, z: shotPreview.aim_offset?.z ?? eye.z }
    : { x: eye.x + Math.cos(facing) * 12, y: eye.y + Math.sin(facing) * 12, z: eye.z };
  cam3.fpv = true;
  cam3.fpvEye = eye;
  cam3.fpvLook = look;
  cam3.overview = false;
  return true;
}

function snapshotStrategyCam() {
  return { target: { ...cam3.target }, yaw: cam3.yaw, pitch: cam3.pitch, dist: cam3.dist };
}

function restoreStrategyCam() {
  cam3.fpv = false;
  cam3.fpvEye = null;
  cam3.fpvLook = null;
  cam3.overview = false;
  if (!savedStrategy || !Number.isFinite(savedStrategy.yaw) || !Number.isFinite(savedStrategy.dist)) return;
  cam3.target = { ...savedStrategy.target };
  cam3.yaw = savedStrategy.yaw;
  cam3.pitch = savedStrategy.pitch;
  cam3.dist = savedStrategy.dist;
}

function applyOverviewCam() {
  cam3.fpv = false;
  cam3.fpvEye = null;
  cam3.fpvLook = null;
  if (view?.map) frameOverview3(cam3, view.map);
  else cam3.overview = true;
}

function frameCameras(map) {
  if (!map) return;
  const min = Array.isArray(map.min) ? map.min : [map.min.x, map.min.y];
  const max = Array.isArray(map.max) ? map.max : [map.max.x, map.max.y];
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  camera.x = (min[0] + max[0]) * 0.5;
  camera.y = (min[1] + max[1]) * 0.5;
  const fit = Math.min(canvas.width / (sx + 6), canvas.height / (sy + 6));
  camera.zoom = Math.max(10, Math.min(36, fit || 22));
  frameCam3(cam3, { min, max });
  camKind = "strategy";
  savedStrategy = snapshotStrategyCam();
  syncModePairs();
}

function resetCam3() {
  if (camKind === "overview" && view?.map) {
    applyOverviewCam();
    syncModePairs();
    return;
  }
  if (view?.map) frameCameras(view.map);
  else {
    const fresh = makeCam3();
    cam3.target = { ...fresh.target };
    cam3.yaw = fresh.yaw;
    cam3.pitch = fresh.pitch;
    cam3.dist = fresh.dist;
    cam3.fpv = false;
    cam3.fpvEye = null;
    cam3.fpvLook = null;
    cam3.overview = false;
    camKind = "strategy";
    savedStrategy = snapshotStrategyCam();
    syncModePairs();
  }
}

function setPair(id, value) {
  const group = document.getElementById(id);
  if (!group) return;
  group.dataset.value = value;
  group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.val === value));
}

function syncModePairs() {
  setPair("fogPair", fog ? "player" : "dev");
  setPair("projPair", mapMode);
  setPair("camPair", camKind);
  setPair("roofPair", hideRoofs ? "hide" : "show");
  setPair("gridPair", hideGrid ? "hide" : "show");
}

function setCamKind(next) {
  if (next === camKind) return;
  if (next === "fpv") {
    if (mapMode !== "3d") return;
    if (camKind === "strategy") savedStrategy = snapshotStrategyCam();
    if (!applyFpvCam()) return;
    camKind = "fpv";
  } else if (next === "overview") {
    if (mapMode !== "3d") return;
    if (camKind === "strategy") savedStrategy = snapshotStrategyCam();
    applyOverviewCam();
    camKind = "overview";
  } else {
    camKind = "strategy";
    restoreStrategyCam();
  }
  syncModePairs();
  render();
}

function toggleCamKind() {
  const order = ["strategy", "overview", "fpv"];
  const i = Math.max(0, order.indexOf(camKind));
  setCamKind(order[(i + 1) % order.length]);
}

function asCoverRay(c) {
  return {
    min: { x: c.min[0], y: c.min[1] },
    max: { x: c.max[0], y: c.max[1] },
    z0: c.z0 ?? 0,
    z1: c.z1 ?? c.height ?? 1,
  };
}

function occludersOf(map) {
  const list = [];
  for (const c of map.cover || []) {
    if (hideRoofs && isRoof(c)) continue;
    list.push(asCoverRay(c));
  }
  if (!hideRoofs) {
    for (const c of map.decor || []) {
      if (isRoof(c)) list.push(asCoverRay(c));
    }
  }
  return list;
}

function partCenter3(b) {
  const cs = b.corners;
  if (!cs?.length) return { x: 0, y: 0, z: 0 };
  let x = 0, y = 0, z = 0;
  for (const p of cs) {
    x += p.x; y += p.y; z += p.z;
  }
  const n = cs.length;
  return { x: x / n, y: y / n, z: z / n };
}

function hiddenByCover(eye, p, occluders) {
  const raw = { x: p.x - eye.x, y: p.y - eye.y, z: (p.z || 0) - (eye.z || 0) };
  const len = Math.hypot(raw.x, raw.y, raw.z);
  if (len < 0.08) return false;
  const dir = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
  const maxT = len - 0.05;
  for (const c of occluders) {
    const t = rayCover(eye, dir, c, maxT);
    if (t != null && t > 0.15) return true;
  }
  return false;
}

function render3() {
  if (camKind === "fpv") applyFpvCam();
  const map = view.map;
  const w = canvas.width;
  const h = canvas.height;
  drawSky3(ctx, w, h, cam3);
  drawFloor3(ctx, cam3, w, h, map, { grid: !hideGrid });
  const groundFx = [...(map.decor || []), ...(map.cover || [])];
  drawContactShadows3(ctx, cam3, w, h, groundFx);
  drawEmitPools3(ctx, cam3, w, h, groundFx);
  if (camKind !== "fpv") drawCoverUseRings3();
  const worldParts = [];
  const pushBox = (c, color) => {
    if (hideRoofs && isRoof(c)) return;
    for (const slab of sliceBox3(c)) {
      const box = coverBox(slab);
      worldParts.push({
        ...box,
        color,
        facing: 0,
        roof: isRoof(c),
        mat: c.mat || null,
        tex: c.tex || null,
        emit: c.emit || 0,
      });
    }
  };
  for (const c of map.decor || []) pushBox(c, c.color || "#6a7b66");
  for (const c of map.cover) {
    const frac = c.durability_max ? c.durability / c.durability_max : 1;
    pushBox(c, frac < 0.05 ? "#3a3a3a" : (c.color || "#6a7b66"));
  }
  drawScene3(ctx, cam3, w, h, worldParts);
  const eye = eyeOf(cam3);
  const occluders = occludersOf(map);
  const bodyParts = [];
  const pushUnitParts = (drawn, team, down, ghost, vu) => {
    const far = cam3.dist > 30;
    for (const b of cachedHitboxes(drawn)) {
      if (!keepDrawnPart(b, far)) continue;
      if (hiddenByCover(eye, partCenter3(b), occluders)) continue;
      const hot = vu && hoverUnit && hoverUnit.id === vu.id && hoverPart === b.name;
      bodyParts.push({
        ...b,
        color: partHex(b.name, team, down, hot),
        facing: drawn.facing || 0,
        ghost,
      });
    }
  };
  const ghost = ghostActor();
  const realActor = worldUnit(actorId());
  const ghostMoved = ghost && realActor
    && Math.hypot(ghost.pos.x - realActor.pos.x, ghost.pos.y - realActor.pos.y) > 0.08;
  for (const vu of visibleUnits()) {
    const u = worldUnit(vu.id);
    if (!u) continue;
    if (camKind === "fpv" && u.id === actorId()) continue;
    const drawn = (u.id === actorId() && ghost && !ghostMoved) ? ghost : u;
    const faded = u.id === actorId() && ghostMoved;
    pushUnitParts(drawn, vu.team, vu.downed || vu.dead, faded, vu);
  }
  if (ghostMoved && ghost && camKind !== "fpv") {
    const vu = view.units.find((x) => x.id === ghost.id);
    pushUnitParts(ghost, vu?.team ?? 0, false, true, vu);
  }
  drawScene3(ctx, cam3, w, h, bodyParts);
  const actor = view.units.find((x) => x.id === actorId());
  const wu = actor ? worldUnit(actor.id) : null;
  const ringAt = reachOrigin() || wu;
  if (ringAt && camKind !== "fpv") drawReachRing3(ringAt, gaitReach());
  if (actor) {
    let from = asXY(actor.pos);
    for (const q of view.queue || []) {
      if (q.type !== "move" || !q.dest) continue;
      const to = asXY(q.dest);
      const path = (q.path || [from, to]).map((p) => ({ ...asXY(p), z: 0.06 }));
      drawMovePath3(ctx, cam3, w, h, path, MOVE_LINE);
      from = to;
    }
  }
  if (movePreview?.ok) {
    const path = (movePreview.path || [movePreview.from, movePreview.dest])
      .map((p) => ({ ...asXY(p), z: 0.07 }));
    drawMovePath3(ctx, cam3, w, h, path, MOVE_LINE);
  }
  if (shotPreview?.ok && wu && !shotTargetDowned(shotPreview)) {
    const o = shotPreview.origin3 || muzzleWorld(ghost || wu);
    const aim = shotPreview.aim_world || {};
    const z = shotPreview.aim_offset?.z ?? 1.2;
    const dest = { x: aim.x ?? o.x, y: aim.y ?? o.y, z };
    const raw = { x: dest.x - o.x, y: dest.y - o.y, z: dest.z - o.z };
    const len = Math.max(0.4, Math.hypot(raw.x, raw.y, raw.z));
    const dir = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    const tHit = coverClipT(o, dir, len);
    const hit = add3(o, dir, Math.min(tHit, len));
    drawPolyline3(ctx, cam3, w, h, [o, hit], SHOT_CLEAR);
    if (tHit < len - 0.04) drawPolyline3(ctx, cam3, w, h, [hit, dest], SHOT_BLOCKED);
  }
  if (view.last_shot?.valid && !shotPreview?.ok && !shotTargetDowned(view.last_shot)) {
    const ls = view.last_shot;
    const a = ls.origin3 || { ...asXY(ls.origin), z: 1.2 };
    const b = ls.end3 || { ...asXY(ls.end), z: 1.0 };
    const raw = { x: b.x - a.x, y: b.y - a.y, z: (b.z || 0) - (a.z || 0) };
    const len = Math.max(0.2, Math.hypot(raw.x, raw.y, raw.z));
    const dir = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    const tHit = coverClipT(a, dir, len);
    const hit = add3(a, dir, Math.min(tHit, len));
    drawPolyline3(ctx, cam3, w, h, [a, hit], SHOT_CLEAR);
    if (tHit < len - 0.04) drawPolyline3(ctx, cam3, w, h, [hit, b], SHOT_BLOCKED);
  }
  for (const vu of visibleUnits()) {
    const u = worldUnit(vu.id);
    if (!u) continue;
    if (camKind === "fpv" && u.id === actorId()) continue;
    const shown = (vu.id === actorId() && ghost && !ghostMoved) ? ghost : u;
    const z = shown.posture === "prone" ? 0.45 : shown.posture === "crouch" ? 1.35 : 1.95;
    drawLabel3(ctx, cam3, w, h, { x: shown.pos.x, y: shown.pos.y, z }, `${vu.name}${vu.contact_ready ? " ✓" : ""}`, vu.active ? "#d7b15a" : "#e8edf4");
  }
  if (ghostMoved && ghost && camKind !== "fpv") {
    const z = ghost.posture === "prone" ? 0.45 : ghost.posture === "crouch" ? 1.35 : 1.95;
    drawLabel3(ctx, cam3, w, h, { x: ghost.pos.x, y: ghost.pos.y, z }, `${ghost.name} …`, "#d7b15a");
    for (const b of cachedHitboxes(ghost)) drawBoxEdges3(b, "rgba(215,177,90,0.7)");
  }
  if (hoverUnit && hoverPart) {
    const hu = worldUnit(hoverUnit.id);
    const box = hu && cachedHitboxes(hu).find((b) => b.name === hoverPart);
    if (box) drawBoxEdges3(box, "#f2d78a");
  }
}

function render2d() {
  const a = toScreen(view.map.min);
  const b = toScreen(view.map.max);
  ctx.fillStyle = "#161b22";
  ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
  ctx.strokeStyle = "#4b5a6c";
  ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
  drawGrid();
  drawCover();
  const actor = view.units.find((x) => x.id === actorId());
  if (actor) {
    const ringAt = reachOrigin() || actor;
    drawCircle(ringAt, gaitReach(), reachRingColor());
  }
  if (actor) {
    let from = asXY(actor.pos);
    for (const q of view.queue || []) {
      if (q.type !== "move" || !q.dest) continue;
      const to = asXY(q.dest);
      drawMovePath2(q.path || [from, to], "rgba(110,207,154,0.7)");
      from = to;
    }
  }
  if (movePreview?.ok) {
    drawMovePath2(movePreview.path || [movePreview.from, movePreview.dest], MOVE_LINE);
  }
  if (shotPreview?.ok) drawShotGeom(shotPreview);
  if (view.last_shot?.valid && !shotTargetDowned(view.last_shot)) {
    const ls = view.last_shot;
    const aimPt = ls.aim_world || ls.end;
    drawCone(ls.origin, aimPt, ls.cone_half_rad);
    drawShotLine2(ls.origin3 || ls.origin, ls.end3 || ls.end);
  }
  drawUnits();
}

function unitStatTable(u) {
  const wounds = (u.wounds || []).map((w) =>
    `<tr><th>Wound</th><td>${prettyPart(w.region)}: ${w.text}${w.treated ? " [bound]" : ""}</td></tr>`
  ).join("");
  const plates = (u.armor || []).map((p) => {
    const max = p.max || p.durability_max || p.dur || 0;
    const dur = p.dur ?? p.durability ?? 0;
    return `<tr><th>${p.name || prettyPart(p.id || p.region)}</th><td>${dur.toFixed(1)} / ${max.toFixed(1)}</td></tr>`;
  }).join("");
  return `<h3 style="color:${teamColor(u.team)}">${u.name}</h3>
    <table class="stat-table">
      <tr><th>Posture</th><td>${u.cover_use?.mode === "post" ? "posted" : u.cover_use?.mode === "hide" ? "hidden" : u.posture}</td></tr>
      <tr><th>Initiative</th><td>${u.initiative}</td></tr>
      <tr><th>Mag</th><td>${u.mag} / ${u.mag_size} · reserve ${u.ammo}</td></tr>
      <tr><th>Weapon</th><td>${u.weapon_ready ? "ready" : "unready"}</td></tr>
      <tr><th>Blood</th><td>${u.blood.toFixed(0)}</td></tr>
      <tr><th>Pain</th><td>${u.pain.toFixed(0)} / ${u.pain_tolerance.toFixed(0)}</td></tr>
      <tr><th>Stress</th><td>${u.stress.toFixed(0)} / ${u.stress_tolerance.toFixed(0)}</td></tr>
      ${plates}
      ${wounds}
    </table>`;
}

function actionTableHtml(rows, extraHeads = []) {
  const head = `<tr><th></th><th>Action</th><th>Cost</th>${extraHeads.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const body = rows.map((row) => {
    const extras = (row.extra || []).map((cell) =>
      `<td class="num"${cell.id ? ` id="${cell.id}"` : ""}>${cell.html}</td>`
    ).join("");
    return `<tr data-act="${row.key}" class="${row.ok ? "" : "off"}" title="${row.reason || ""}">
      <td><button data-act="${row.key}" ${row.ok ? "" : "disabled"}>Do</button></td>
      <td>${row.label}</td>
      <td class="cost">${row.cost || ""}</td>
      ${extras}
    </tr>`;
  }).join("");
  return `<table class="act-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function orderAction(id, targetId) {
  if (id === "crouch" || id === "prone" || id === "stand") {
    return { type: ActionType.SetPosture, posture: id, actor: actorId() };
  }
  if (id === "cover_post") return { type: ActionType.CoverPost, actor: actorId() };
  if (id === "cover_hide") return { type: ActionType.CoverHide, actor: actorId() };
  if (id === "bandage") return { type: ActionType.Bandage, actor: actorId(), target: targetId || actorId() };
  if (id === "contact_ready") return { type: ActionType.ContactReady, actor: actorId() };
  if (id === "overwatch") return { type: ActionType.Overwatch, dest: hoverWorld || { x: 0, y: 0 }, actor: actorId() };
  return { type: id, actor: actorId() };
}

function setTapePreview(action) {
  if (!view || view.phase !== Phase.Play || !action) {
    tapePreview = null;
    if (view) renderTimeline();
    return;
  }
  const r = eng.previewSchedule(action);
  tapePreview = r.ok ? r.item : null;
  renderTimeline();
}

function clearTapePreview() {
  tapePreview = null;
  if (view) renderTimeline();
}

function renderTimeline() {
  if (!view) return;
  const tracks = ["hands", "legs", "focus", "voice"];
  const clock = view.clock || 0;
  const html = tracks.map((ch) => {
    const committed = (view.tape?.[ch] || []).map((iv) => blockHtml(iv, ch, "")).join("");
    const queued = (view.queue || []).filter((q) => q.cost[ch] > 0.01).map((q) =>
      blockHtml({ t0: q.t0, t1: q.t0 + q.cost[ch], label: q.label, id: q.id }, ch, "queued")
    ).join("");
    const ghost = tapePreview && tapePreview.cost[ch] > 0.01
      ? blockHtml({ t0: tapePreview.t0, t1: tapePreview.t0 + tapePreview.cost[ch], label: tapePreview.cost.label }, ch, "preview")
      : "";
    return `<div class="tl-row"><div class="tl-lab">${ch}</div>
      <div class="tl-track">${committed}${queued}${ghost}<div class="tl-clock" style="left:${(clock / Math.max(0.01, view.turn_seconds || 3)) * 100}%"></div></div></div>`;
  }).join("");
  document.getElementById("timeline").innerHTML = html;
  document.getElementById("clockLabel").textContent = view.phase === Phase.Play
    ? `· ${clock.toFixed(1)}s used · ${view.window.toFixed(1)}s left`
    : "";
  document.querySelectorAll(".tl-block.queued[data-unq]").forEach((el) => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      eng.unschedule(+el.dataset.unq);
      refresh();
      agentDump("unschedule");
    };
  });
}

function blockHtml(iv, ch, kind) {
  const left = (iv.t0 / 5) * 100;
  const width = Math.max(1.5, ((iv.t1 - iv.t0) / 5) * 100);
  const unq = kind === "queued" && iv.id != null
    ? ` data-unq="${iv.id}" title="Drop this and everything after"`
    : "";
  return `<div class="tl-block ${ch} ${kind || ""}"${unq} style="left:${left}%;width:${width}%">${iv.label || ""}</div>`;
}

function inspectUnit(id) {
  inspected = id || 0;
  aimOffset = null;
  preciseAim = false;
  refresh();
}

function inspectSubject() {
  if (!inspected) return null;
  return view.units.find((x) => x.id === inspected) || null;
}

function fireMode() {
  const v = toggleVal("fire");
  if (v === "burst") return ShotMode.Burst;
  if (v === "precise") return ShotMode.Precise;
  return ShotMode.Snap;
}

function aimRegion() {
  const v = toggleVal("aim");
  if (v === "head") return AimRegion.Head;
  if (v === "legs") return AimRegion.Legs;
  return AimRegion.Torso;
}

function shotContext() {
  if (!view || view.phase !== Phase.Play) return null;
  const actor = view.units.find((x) => x.id === actorId());
  if (!actor) return null;
  const subject = inspectSubject();
  const hoverU = hoverUnit || (hoverWorld ? unitAt(hoverWorld) : null);
  const pick = (u) => u && u.team !== actor.team && !u.downed ? u : null;
  const target = pick(hoverU) || pick(subject);
  if (!target) return null;
  const mode = hoverShotMode || fireMode();
  const part = (hoverUnit && hoverUnit.id === target.id && hoverPart) ? hoverPart : null;
  const aim = part ? aimRegionForPart(part) : aimRegion();
  const ov = actorOverrides();
  const offset = part
    ? eng.partAimOffset(target.id, part, ov)
    : (subject && subject.id === target.id && preciseAim && aimOffset)
      ? aimOffset
      : eng.defaultAimOffset(target.id, aim, ov);
  return { actor, target, mode, aim, offset, part, overrides: ov };
}

function syncShotPreview() {
  const ctxn = shotContext();
  if (!ctxn) {
    shotPreview = null;
    shotPreviewKey = "";
    return null;
  }
  const o = ctxn.offset || {};
  const ov = ctxn.overrides || {};
  const key = [
    ctxn.actor.id, ctxn.target.id, ctxn.mode, ctxn.aim, ctxn.part || "",
    o.x, o.z, ov.pos?.x, ov.pos?.y, ov.posture,
  ].join(":");
  if (key === shotPreviewKey && shotPreview) return ctxn;
  shotPreviewKey = key;
  shotPreview = eng.previewShot(ctxn.actor.id, ctxn.target.id, ctxn.mode, ctxn.aim, ctxn.offset, ctxn.overrides);
  return ctxn;
}

function fmtHit(prev) {
  if (!prev?.ok) return "—";
  const cover = prev.p_cover > 0.02 ? `<div class="meta">cov ${Math.round(prev.p_cover * 100)}%</div>` : "";
  return `${Math.round(prev.p_hit * 100)}%${cover}`;
}

function fmtPct(p) {
  const n = Math.round((p || 0) * 100);
  if (n === 0 && p > 0) return "<1%";
  return `${n}%`;
}

function fillDiskBreak(preview) {
  const el = document.getElementById("diskBreak");
  if (!el) return;
  if (!preview?.ok || !preview.breakdown?.length) {
    el.innerHTML = "";
    return;
  }
  const rows = preview.breakdown.map((r) => {
    const cls = r.id === "cover" ? "cover" : r.id === "air" ? "air" : "";
    return `<tr class="${cls}"><td>${r.label}</td><td class="num">${fmtPct(r.p)}</td></tr>`;
  }).join("");
  el.innerHTML = `<div class="disk-total">hit ${fmtPct(preview.p_hit)} <span>of aim disk</span></div>
    <table class="disk-table">${rows}</table>`;
}

function renderInspect() {
  const box = document.getElementById("inspect");
  const u = inspectSubject();
  if (!u) {
    box.innerHTML = `<p class="empty">Nothing selected</p>`;
    return;
  }
  const actor = view.units.find((x) => x.id === actorId());
  const enemy = actor && u.team !== actor.team && !u.downed && view.phase === Phase.Play;
  const friendly = actor && u.team === actor.team;
  const wu = worldUnit(u.id);
  let actions = "";
  if (enemy) {
    const shotRow = (id, label) => {
      const q = quoteOf(view.quotes?.shots, id);
      return {
        key: id, label, cost: q?.cost || "", ok: !!q?.ok, reason: q?.reason || "",
        extra: [{ id: `hit-${id}`, html: "—" }, { id: `dist-${id}`, html: "—" }],
      };
    };
    actions = `<canvas id="sil" width="220" height="220"></canvas>`
      + `<div id="diskBreak" class="disk-break"></div>`
      + actionTableHtml([shotRow("snap", "Snap"), shotRow("precise", "Precise"), shotRow("burst", "Burst")], ["Hit", "Dist"]);
  } else if (friendly && view.phase === Phase.Play) {
    const qb = quoteOf(view.quotes?.actions, "bandage");
    actions = actionTableHtml([{
      key: "bandage", label: "Bandage", cost: qb?.cost || "", ok: !!qb?.ok, reason: qb?.reason || "",
    }]);
  }
  box.innerHTML = `${unitStatTable(u)}${actions}`;
  box.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const key = btn.dataset.act;
      if (key === "bandage") {
        queueNow({ type: ActionType.Bandage, actor: actorId(), target: u.id }, ev);
        return;
      }
      const ctxn = shotContext();
      const off = (preciseAim && aimOffset) ? aimOffset : (ctxn?.offset || null);
      queueNow({
        type: ActionType.Shoot, actor: actorId(), target: u.id,
        shot: key, aim: aimRegion(), aimOffset: off,
      }, ev);
    };
  });
  box.querySelectorAll("tr[data-act]").forEach((tr) => {
    tr.onmouseenter = () => {
      window.clearTimeout(scanHold);
      const key = tr.dataset.act;
      if (key === "bandage") {
        setTapePreview({ type: ActionType.Bandage, actor: actorId(), target: u.id });
      } else {
        hoverShotMode = key;
        const ctxn = shotContext();
        const off = (preciseAim && aimOffset) ? aimOffset : (ctxn?.offset || null);
        setTapePreview({
          type: ActionType.Shoot, actor: actorId(), target: u.id,
          shot: key, aim: aimRegion(), aimOffset: off,
        });
        updateInspectShots();
        render();
      }
      tr.classList.add("hot");
    };
    tr.onmouseleave = (ev) => {
      hoverShotMode = null;
      holdScanOrDrop(ev.relatedTarget);
      clearTapePreview();
      tr.classList.remove("hot");
      updateInspectShots();
      render();
    };
  });
  if (wu) bindSilhouette(document.getElementById("sil"));
  updateInspectShots();
}

function updateInspectShots() {
  const u = inspectSubject();
  const actor = view?.units.find((x) => x.id === actorId());
  const enemy = actor && u && u.team !== actor.team && !u.downed && view.phase === Phase.Play;
  const ctxn = syncShotPreview();
  if (!enemy) return;
  const ov = ctxn?.overrides || actorOverrides();
  const aim = aimRegion();
  const off = ctxn?.offset || ((preciseAim && aimOffset) ? aimOffset : eng.defaultAimOffset(u.id, aim, ov));
  if (!preciseAim) aimOffset = off;
  const snap = eng.previewShot(actor.id, u.id, ShotMode.Snap, aim, off, ov);
  const precise = eng.previewShot(actor.id, u.id, ShotMode.Precise, aim, off, ov);
  const burst = eng.previewShot(actor.id, u.id, ShotMode.Burst, aim, off, ov);
  const set = (id, prev) => {
    const hit = document.getElementById(`hit-${id}`);
    const dist = document.getElementById(`dist-${id}`);
    if (hit) hit.innerHTML = fmtHit(prev);
    if (dist) dist.textContent = prev?.ok ? `${prev.distance.toFixed(1)}m` : "—";
    const q = quoteOf(view.quotes?.shots, id);
    const btn = document.querySelector(`#inspect button[data-act="${id}"]`);
    if (btn) btn.disabled = !q?.ok;
    document.querySelector(`#inspect tr[data-act="${id}"]`)?.classList.toggle("hot", hoverShotMode === id);
  };
  set("snap", snap);
  set("precise", precise);
  set("burst", burst);
  const sil = document.getElementById("sil");
  const wu = worldUnit(u.id);
  const shown = hoverShotMode === "burst" ? burst : hoverShotMode === "precise" ? precise : hoverShotMode === "snap" ? snap : shotPreview;
  if (sil && wu) drawSilhouette(sil, wu, shown);
  fillDiskBreak(shown);
}

function syncSilSize(sil) {
  const rect = sil.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (sil.width !== w || sil.height !== h) {
    sil.width = w;
    sil.height = h;
  }
}

function boxBounds(boxes) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const b of boxes) {
    for (const p of b.corners || []) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); z1 = Math.max(z1, p.z);
    }
  }
  return { x0, y0, z0, x1, y1, z1 };
}

function shotAlongPerp(actor, target) {
  if (actor && target) {
    const dx = target.pos.x - actor.pos.x;
    const dy = target.pos.y - actor.pos.y;
    const dist = Math.max(0.15, Math.hypot(dx, dy));
    const along = { x: dx / dist, y: dy / dist };
    return { along, perp: rotate(along, -1.5707963) };
  }
  const yaw = target?.facing || 0;
  const along = { x: Math.cos(yaw), y: Math.sin(yaw) };
  return { along, perp: rotate(along, -1.5707963) };
}

function shotWorld(target, perp, lat, z) {
  return {
    x: target.pos.x + perp.x * lat,
    y: target.pos.y + perp.y * lat,
    z,
  };
}

function subjectCam(actor, target, boxes) {
  const b = boxBounds(boxes);
  const cam = makeCam3();
  cam.fpv = false;
  cam.target = {
    x: (b.x0 + b.x1) * 0.5,
    y: (b.y0 + b.y1) * 0.5,
    z: (b.z0 + b.z1) * 0.5,
  };
  if (actor && actor.id !== target.id) {
    cam.yaw = Math.atan2(actor.pos.y - target.pos.y, actor.pos.x - target.pos.x);
  } else {
    cam.yaw = target.facing || 0;
  }
  cam.pitch = 0.16;
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0, 0.9);
  cam.dist = Math.max(2.4, span * 2.15);
  return cam;
}

function fillProjected(ctx, pts, fill, stroke, dash) {
  if (pts.length < 3 || pts.some((p) => !p)) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCoverOverlay(ctx, cam, w, h, target, perp, profile) {
  if (!profile?.some((p) => p.z > 0.02)) return;
  const bottom = [];
  const top = [];
  for (const p of profile) {
    const a = project3(cam, w, h, shotWorld(target, perp, p.x, 0));
    const b = project3(cam, w, h, shotWorld(target, perp, p.x, p.z));
    if (!a || !b) continue;
    bottom.push(a);
    top.push(b);
  }
  if (bottom.length < 2) return;
  fillProjected(ctx, [...bottom, ...top.reverse()], "rgba(36, 48, 22, 0.46)", "#c4c47a", [4, 3]);
}

function drawAimDisk(ctx, cam, w, h, target, perp, off, radius) {
  const steps = 48;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    pts.push(project3(cam, w, h, shotWorld(
      target, perp,
      off.x + Math.cos(th) * radius,
      off.z + Math.sin(th) * radius,
    )));
  }
  fillProjected(ctx, pts, "rgba(215, 177, 90, 0.20)", "#d7b15a");
}

function aimFromSilPixel(sx, sy) {
  if (!silView) return null;
  const { cam, w, h, target, along, perp } = silView;
  const ray = screenRay(cam, w, h, sx, sy);
  const denom = ray.dir.x * along.x + ray.dir.y * along.y;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((target.pos.x - ray.origin.x) * along.x + (target.pos.y - ray.origin.y) * along.y) / denom;
  if (t < 0.05) return null;
  const px = ray.origin.x + ray.dir.x * t;
  const py = ray.origin.y + ray.dir.y * t;
  const pz = ray.origin.z + ray.dir.z * t;
  return {
    x: (px - target.pos.x) * perp.x + (py - target.pos.y) * perp.y,
    z: pz,
  };
}

function drawSilhouette(sil, target, preview) {
  if (!sil) return;
  syncSilSize(sil);
  const sctx = sil.getContext("2d");
  const w = sil.width;
  const h = sil.height;
  sctx.clearRect(0, 0, w, h);
  sctx.fillStyle = "#0d1014";
  sctx.fillRect(0, 0, w, h);
  const actor = (preview?.actor ? worldUnit(preview.actor) : null) || worldUnit(actorId());
  const vu = view?.units.find((x) => x.id === target.id);
  const boxes = unitHitboxes(target).map((b) => ({
    ...b,
    color: partHex(b.name, vu?.team ?? target.team ?? 1, !!(vu?.downed || vu?.dead), false),
    facing: target.facing || 0,
  }));
  const cam = subjectCam(actor, target, boxes);
  const { along, perp } = shotAlongPerp(actor, target);
  silView = { cam, w, h, target, actor, along, perp };
  const pad = 1.15;
  drawPolyline3(sctx, cam, w, h, [
    { x: target.pos.x - pad, y: target.pos.y - pad, z: 0.01 },
    { x: target.pos.x + pad, y: target.pos.y - pad, z: 0.01 },
    { x: target.pos.x + pad, y: target.pos.y + pad, z: 0.01 },
    { x: target.pos.x - pad, y: target.pos.y + pad, z: 0.01 },
    { x: target.pos.x - pad, y: target.pos.y - pad, z: 0.01 },
  ], "rgba(210, 220, 230, 0.16)");
  drawScene3(sctx, cam, w, h, boxes);
  if (preview?.ok) {
    drawCoverOverlay(sctx, cam, w, h, target, perp, preview.cover_profile);
    const off = preview.aim_offset || aimOffset || { x: 0, z: 1.15 };
    drawAimDisk(sctx, cam, w, h, target, perp, off, preview.radius || preview.sigma || 0.15);
  }
}

function bindSilhouette(sil) {
  if (!sil) return;
  sil.onmousedown = (ev) => {
    const move = (e) => {
      const rect = sil.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (sil.width / rect.width);
      const py = (e.clientY - rect.top) * (sil.height / rect.height);
      const off = aimFromSilPixel(px, py);
      if (!off) return;
      aimOffset = off;
      preciseAim = true;
      updateInspectShots();
      render();
    };
    move(ev);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
}

function renderChrome() {
  if (!view) return;
  document.getElementById("phaseLabel").textContent =
    view.phase === Phase.Contact ? "CONTACT — walk, posture, ready, then Ready-up"
    : view.combat_over ? `Fight over · winner team ${view.winner_team}`
    : `Round ${view.round} · play · tape ${view.clock.toFixed(1)} / ${(view.turn_seconds || 3).toFixed(1)}s`;
  syncModePairs();
  document.getElementById("skipContact").classList.toggle("hidden", view.phase !== Phase.Contact);

  const prompt = document.getElementById("prompt");
  if (view.pending_ow?.active) {
    const w = view.units.find((u) => u.id === view.pending_ow.watcher);
    const m = view.units.find((u) => u.id === view.pending_ow.mover);
    prompt.classList.remove("hidden");
    prompt.innerHTML = `<strong>Overwatch</strong><br>${w?.name} sees ${m?.name}<br>
      <button id="owFire">Fire</button> <button id="owHold">Hold</button>`;
    document.getElementById("owFire").onclick = () => applyNow({ type: ActionType.OverwatchFire });
    document.getElementById("owHold").onclick = () => applyNow({ type: ActionType.OverwatchHold });
  } else if (view.pending_react?.active) {
    const r = view.units.find((u) => u.id === view.pending_react.reactor);
    prompt.classList.remove("hidden");
    prompt.innerHTML = `<strong>Reaction</strong> — ${r?.name} (${r?.reaction_left.toFixed(1)}s)<br>` +
      (view.quotes.reactions || []).map((q) =>
        `<button ${q.ok ? "" : "disabled"} data-react="${q.id}">${q.label} <small>${q.cost}</small></button>`
      ).join(" ");
    prompt.querySelectorAll("[data-react]").forEach((btn) => {
      btn.onclick = () => applyNow({ type: btn.dataset.react });
    });
  } else {
    prompt.classList.add("hidden");
  }

  const u = view.units.find((x) => x.id === actorId());
  const contact = view.phase === Phase.Contact;
  document.getElementById("turnInfo").innerHTML = u ? unitStatTable(u) : "—";

  const ids = contact
    ? ["crouch", "prone", "stand", "ready", "contact_ready"]
    : ["crouch", "prone", "stand", "cover_post", "cover_hide", "reload", "bandage", "ready", "overwatch"];
  const orderRows = ids.map((id) => {
    const q = quoteOf(view.quotes.actions, id);
    if (!q) return null;
    return { key: id, label: q.label, cost: q.cost, ok: q.ok, reason: q.reason || "" };
  }).filter(Boolean);
  document.getElementById("actionBtns").innerHTML = actionTableHtml(orderRows);
  document.querySelectorAll("#actionBtns tr[data-act]").forEach((tr) => {
    tr.onmouseenter = () => {
      window.clearTimeout(scanHold);
      const id = tr.dataset.act;
      if (id === "crouch" || id === "prone" || id === "stand") posePreview = id;
      if (id === "cover_post") coverPreview = CoverMode.Post;
      if (id === "cover_hide") coverPreview = CoverMode.Hide;
      setTapePreview(orderAction(id));
      updateInspectShots();
      render();
      tr.classList.add("hot");
    };
    tr.onmouseleave = (ev) => {
      posePreview = null;
      coverPreview = null;
      holdScanOrDrop(ev.relatedTarget);
      clearTapePreview();
      updateInspectShots();
      render();
      tr.classList.remove("hot");
    };
  });
  document.querySelectorAll("#actionBtns button[data-act]").forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.act;
      if (id === "overwatch") {
        owAim = true;
        eventLog.push("click a direction for overwatch");
        refresh();
        return;
      }
      const body = orderAction(id);
      if (view.phase === Phase.Play) queueNow(body, ev);
      else applyNow(body);
    };
  });

  const order = view.turn_order.length ? view.turn_order : view.units.map((x) => x.id);
  document.getElementById("roster").innerHTML = order.map((id) => {
    const x = view.units.find((u) => u.id === id);
    if (!x) return "";
    if (fog && x.visible === false) return `<div class="unit"><strong>Unknown</strong></div>`;
    return `<div class="unit ${x.active ? "active" : ""} ${x.id === inspected ? "sel" : ""} ${x.downed ? "down" : ""}" data-id="${x.id}">
      <strong style="color:${teamColor(x.team)}">${x.name}</strong>
      <div class="meta">${x.posture}${x.contact_ready ? " · set" : ""}</div>
    </div>`;
  }).join("");
  document.querySelectorAll("#roster .unit[data-id]").forEach((el) => {
    el.onclick = () => inspectUnit(+el.dataset.id);
  });

  const hud = document.getElementById("hoverHud");
  if (movePreview) {
    hud.classList.remove("hidden");
    const gait = (movePreview.gait || "walk");
    hud.innerHTML = `<strong>${gait}</strong> ${movePreview.dist.toFixed(1)}m · ${movePreview.time.toFixed(1)}s / ${movePreview.budget.toFixed(1)}s`
      + (movePreview.note ? `<br>${movePreview.note}` : "")
      + (view.phase === Phase.Play ? "<br>click to queue" : "");
  } else {
    hud.classList.add("hidden");
  }

  renderTimeline();
  renderInspect();
  syncShotPreview();
  const evBox = document.getElementById("events");
  const pinned = evBox.scrollHeight - evBox.scrollTop - evBox.clientHeight < 24;
  const shown = eventLog.slice(-1000);
  evBox.start = Math.max(1, eventLog.length - shown.length + 1);
  evBox.innerHTML = shown.map((t) => `<li>${t}</li>`).join("");
  if (pinned) evBox.scrollTop = evBox.scrollHeight;
}

canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

canvas.addEventListener("mousedown", (ev) => {
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ev.preventDefault();
  if (mapMode === "3d" && ev.button === 2) {
    orbiting = true;
    didOrbit = false;
    ev.preventDefault();
  }
});

window.addEventListener("mouseup", () => {
  orbiting = false;
});

canvas.addEventListener("click", (ev) => {
  if (!view || view.combat_over) return;
  if (view.pending_ow?.active || view.pending_react?.active) return;
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ev.preventDefault();
  if (didOrbit) {
    didOrbit = false;
    return;
  }
  const pick = pickFromEvent(ev);
  const w = pick.ground;
  const u = pick.unit;
  if (!w && !u) return;
  if (owAim) {
    owAim = false;
    if (!w) return;
    if (view.phase === Phase.Play) queueNow({ type: ActionType.Overwatch, dest: { x: w.x, y: w.y }, actor: actorId() }, ev);
    else applyNow({ type: ActionType.Overwatch, dest: { x: w.x, y: w.y }, actor: actorId() });
    return;
  }
  if (u) {
    const actor = view.units.find((x) => x.id === actorId());
    const enemy = actor && u.team !== actor.team && !u.downed && view.phase === Phase.Play;
    if (ev.shiftKey) {
      inspectUnit(u.id);
      return;
    }
    if (enemy) {
      const mode = fireMode();
      const part = pick.part;
      const aim = part ? aimRegionForPart(part) : aimRegion();
      const ov = actorOverrides();
      const off = part ? eng.partAimOffset(u.id, part, ov) : eng.defaultAimOffset(u.id, aim, ov);
      inspected = u.id;
      preciseAim = false;
      aimOffset = off;
      queueNow({ type: ActionType.Shoot, actor: actor.id, target: u.id, shot: mode, aim, aimOffset: off }, ev);
      return;
    }
    inspectUnit(u.id);
    return;
  }
  if (!w) return;
  const dest = { x: w.x, y: w.y };
  if (view.phase === Phase.Contact) {
    applyNow({ type: ActionType.Move, dest, gait: Gait.Walk, actor: actorId() });
  } else {
    queueNow({ type: ActionType.Move, dest, gait: toggleVal("gait"), actor: actorId() }, ev);
  }
});

let hoverRaf = 0;
let hoverEv = null;

function handleHover(ev) {
  if (!view) return;
  if (orbiting) {
    orbitCam(cam3, ev.movementX * 0.008, -ev.movementY * 0.008);
    didOrbit = true;
    render();
    return;
  }
  const pick = pickFromEvent(ev);
  const w = pick.ground;
  const prevUnit = hoverUnit?.id || 0;
  const prevPart = hoverPart;
  hoverWorld = w;
  hoverUnit = pick.unit;
  hoverPart = pick.part || null;
  const u = pick.unit;
  canvas.style.cursor = u ? "pointer" : "crosshair";
  const actor = view.units.find((x) => x.id === actorId());
  if (!u && actor && w) {
    window.clearTimeout(scanHold);
    const prev = eng.previewMove(actor.id, { x: w.x, y: w.y }, selectedGait(), view.phase === Phase.Play, true);
    if (prev?.ok) {
      movePreview = prev;
      if (view.phase === Phase.Play) {
        const r = eng.previewSchedule({
          type: ActionType.Move, dest: { x: w.x, y: w.y }, gait: selectedGait(), actor: actor.id,
        });
        tapePreview = r.ok ? r.item : null;
      } else tapePreview = null;
    } else {
      movePreview = null;
      tapePreview = null;
    }
  } else if (u) {
    window.clearTimeout(scanHold);
    movePreview = null;
    tapePreview = null;
  } else {
    tapePreview = null;
  }
  syncShotPreview();
  const subject = inspectSubject();
  if (u && subject && u.id === subject.id && (u.id !== prevUnit || hoverPart !== prevPart)) {
    updateInspectShots();
  }
  render();
  renderTimeline();
  const hud = document.getElementById("hoverHud");
  if (u) {
    hud.classList.remove("hidden");
    const enemy = u.team !== actor?.team && !u.downed && view.phase === Phase.Play;
    const part = hoverPart ? partLabel(hoverPart) : "";
    let extra = u.id === view.active ? " · acting · click to inspect" : (enemy ? " · click to shoot · shift-click aim" : " · inspect");
    if (enemy && shotPreview?.ok) {
      extra = `${part ? ` · ${part}` : ""} · ${Math.round(shotPreview.p_hit * 100)}% hit`
        + ` · ${Math.round(shotPreview.p_cover * 100)}% cover · ${fireMode()}`
        + `<br>${shotPreview.distance?.toFixed?.(1) || "—"}m`
        + "<br>click to shoot · shift-click to aim · ctrl-click overlaps";
    } else if (part) {
      extra = ` · ${part}${extra}`;
    }
    hud.innerHTML = `<strong>${u.name}</strong>${extra}`;
    placeHoverHud(ev);
  } else if (movePreview) {
    hud.classList.remove("hidden");
    hud.innerHTML = `<strong>${movePreview.gait}</strong> ${movePreview.dist.toFixed(1)}m · ${movePreview.time.toFixed(1)}s / ${movePreview.budget.toFixed(1)}s`
      + (movePreview.note ? `<br>${movePreview.note}` : "");
    placeHoverHud(ev);
  } else hud.classList.add("hidden");
}

canvas.addEventListener("mousemove", (ev) => {
  if (orbiting) {
    handleHover(ev);
    return;
  }
  hoverEv = ev;
  if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    if (hoverEv) handleHover(hoverEv);
  });
});

canvas.addEventListener("mouseleave", (ev) => {
  hoverWorld = null;
  hoverUnit = null;
  hoverPart = null;
  tapePreview = null;
  holdScanOrDrop(ev.relatedTarget);
  syncShotPreview();
  updateInspectShots();
  render();
  renderTimeline();
  document.getElementById("hoverHud").classList.add("hidden");
});
window.addEventListener("pointerover", (ev) => {
  if (movePreview) holdScanOrDrop(ev.target);
}, true);

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  if (mapMode === "3d") zoomCam(cam3, ev.deltaY > 0 ? 1.08 : 0.92);
  else camera.zoom = Math.max(16, Math.min(80, camera.zoom * (ev.deltaY > 0 ? 0.92 : 1.08)));
  render();
}, { passive: false });

window.addEventListener("keydown", (ev) => {
  rememberKey(ev, true);
  if (ev.key === " " || ev.code === "Space") {
    ev.preventDefault();
    if (view?.phase === Phase.Play) {
      executeNow();
    }
  }
  if (ev.key === "Enter") {
    ev.preventDefault();
    if (view?.phase === Phase.Contact) applyNow({ type: ActionType.ContactReady, actor: actorId() });
    else applyNow({ type: ActionType.EndTurn });
  }
  if (orbitName(ev)) {
    ev.preventDefault();
    if (mapMode === "3d" && !ev.repeat) tickCamOnce();
  }
  if (ev.key === "v" || ev.key === "V") {
    ev.preventDefault();
    toggleCamKind();
  }
  if (ev.key === "Home") {
    ev.preventDefault();
    resetCam3();
    render();
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    eng.clearQueue();
    refresh();
    agentDump("clear-queue");
  }
}, true);
window.addEventListener("keyup", (ev) => rememberKey(ev, false), true);
window.addEventListener("blur", () => keys.clear());

document.getElementById("execute").onclick = () => {
  executeNow();
};
document.getElementById("endTurn").onclick = () => {
  if (view?.phase === Phase.Contact) applyNow({ type: ActionType.ContactReady, actor: actorId() });
  else applyNow({ type: ActionType.EndTurn });
};
document.getElementById("clearQueue").onclick = () => { eng.clearQueue(); refresh(); agentDump("clear-queue"); };
document.getElementById("autoStep").onclick = () => { pushEvents(eng.autoStep()); refresh(); agentDump("auto-step"); };
document.getElementById("skipContact").onclick = () => {
  inspected = 0;
  pushEvents(eng.skipContact());
  refresh();
};
function bindPair(id, onPick) {
  const group = document.getElementById(id);
  group.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      if (group.dataset.value === btn.dataset.val) return;
      onPick(btn.dataset.val);
    };
  });
}
bindPair("fogPair", (v) => {
  fog = v === "player";
  refresh();
});
bindPair("projPair", (v) => {
  mapMode = v;
  if (mapMode === "2d" && camKind !== "strategy") {
    camKind = "strategy";
    restoreStrategyCam();
  }
  syncModePairs();
  render();
});
bindPair("camPair", (v) => setCamKind(v));
bindPair("roofPair", (v) => {
  hideRoofs = v !== "show";
  localStorage.setItem("sandbox.hideRoofs", hideRoofs ? "hide" : "show");
  syncModePairs();
  render();
});
bindPair("gridPair", (v) => {
  hideGrid = v === "hide";
  localStorage.setItem("sandbox.hideGrid", hideGrid ? "hide" : "show");
  syncModePairs();
  render();
});

document.querySelectorAll(".icon-toggle").forEach((group) => {
  group.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      group.dataset.value = btn.dataset.val;
      group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
      if (group.id === "aim" || group.id === "fire") {
        preciseAim = false;
        aimOffset = null;
        if (inspectSubject()) updateInspectShots();
      }
      const dest = hoverWorld || (movePreview?.ok ? movePreview.dest : null);
      if (dest) {
        const actor = view?.units.find((x) => x.id === actorId());
        if (actor) movePreview = eng.previewMove(actor.id, { x: dest.x, y: dest.y }, toggleVal("gait"), view.phase === Phase.Play, true);
      }
      syncShotPreview();
      updateInspectShots();
      render();
    };
  });
});

function rememberKey(ev, down) {
  const names = [ev.key, ev.code];
  if (ev.code === "KeyQ") names.push("q", "Q");
  if (ev.code === "KeyE") names.push("e", "E");
  if (ev.code === "KeyW") names.push("w", "W");
  if (ev.code === "KeyA") names.push("a", "A");
  if (ev.code === "KeyS") names.push("s", "S");
  if (ev.code === "KeyD") names.push("d", "D");
  for (const n of names) {
    if (down) keys.add(n);
    else keys.delete(n);
  }
}

function orbitName(ev) {
  if (ev.key === "q" || ev.key === "Q" || ev.code === "KeyQ") return "q";
  if (ev.key === "e" || ev.key === "E" || ev.code === "KeyE") return "e";
  return null;
}

function tickCamOnce() {
  let moved = false;
  if (mapMode === "3d") {
    moved = stepHeldCam(cam3, keys, cam3.dist * 0.012);
  } else {
    const speed = 8 / camera.zoom;
    const x0 = camera.x;
    const y0 = camera.y;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || keys.has("KeyA")) camera.x -= speed;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D") || keys.has("KeyD")) camera.x += speed;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W") || keys.has("KeyW")) camera.y += speed;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S") || keys.has("KeyS")) camera.y -= speed;
    moved = camera.x !== x0 || camera.y !== y0;
  }
  if (moved) render();
  return moved;
}

function tickCam() {
  tickCamOnce();
  requestAnimationFrame(tickCam);
}

window.__sandbox = {
  snapshot() {
    const eye = eyeOf(cam3);
    return {
      yaw: cam3.yaw, pitch: cam3.pitch, dist: cam3.dist,
      tx: cam3.target.x, ty: cam3.target.y,
      eye: { x: eye.x, y: eye.y, z: eye.z },
      fpv: !!cam3.fpv, kind: camKind, mode: mapMode,
      keys: [...keys],
    };
  },
  dump: () => window.__lastDump || agentDump("manual"),
  state: () => eng.dumpState({ reason: "live" }),
  inspect(id) { inspectUnit(id); return inspectSubject(); },
  press(name) { keys.add(name); },
  release(name) { keys.delete(name); },
  tick: tickCamOnce,
  tapOrbit(which) { stepOrbitKey(cam3, which); render(); return cam3.yaw; },
};

const SCENARIO_KEY = "sandbox.lastScenario";
let catalog = null;

async function readContent(path) {
  const res = await fetch(`/content/${path}`);
  if (!res.ok) throw new Error(`content ${path}: ${res.status}`);
  return res.text();
}

function rememberedScenario(index) {
  const id = localStorage.getItem(SCENARIO_KEY);
  if (id && index.scenarios.some((s) => s.id === id)) return id;
  return index.scenarios[0]?.id || "outpost";
}

function fillScenarioSelect(index, selected) {
  const sel = document.getElementById("scenarioSelect");
  sel.innerHTML = index.scenarios.map((s) =>
    `<option value="${s.id}"${s.id === selected ? " selected" : ""}>${s.name}</option>`
  ).join("");
}

function loadScenario(id) {
  if (!catalog?.scenarios[id]) return false;
  localStorage.setItem(SCENARIO_KEY, id);
  eventLog.length = 0;
  tapePreview = null;
  posePreview = null;
  coverPreview = null;
  movePreview = null;
  shotPreview = null;
  inspected = 0;
  aimOffset = null;
  const world = worldFromCatalog(catalog, id);
  if (!eng.loadWorld(world)) return false;
  document.getElementById("scenarioSelect").value = id;
  refresh();
  if (view?.map) {
    frameCameras(view.map);
    render();
  }
  agentDump(`scenario ${id}`);
  return true;
}

async function boot() {
  catalog = await loadCatalog(readContent);
  fillScenarioSelect(catalog.index, rememberedScenario(catalog.index));
  document.getElementById("scenarioSelect").onchange = () => {
    loadScenario(document.getElementById("scenarioSelect").value);
  };
  loadScenario(rememberedScenario(catalog.index));
  tickCam();
}
boot();
