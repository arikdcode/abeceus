import { Engine, loadCatalog, worldFromCatalog, silhouetteFor, unitHitboxes, coverBox, muzzleWorld, rayLocalBox, rayCover, nearestUse, useBounds, resolveCoverUse, CoverMode, partFamily, prettyPart } from "./engine/engine.js";
import { ActionType, Gait, ShotMode, AimRegion, Phase } from "./engine/model.js";
import { rotate } from "./engine/vec.js";
import { makeCam3, drawScene3, drawFloor3, drawPolyline3, drawLabel3, screenRay, hitGround, orbitCam, zoomCam, project3, eyeOf } from "./view3d.js";
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
let fog = false;
let owAim = false;
let mapMode = "3d";
const cam3 = makeCam3();
let camKind = "strategy";
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

function pickFromEvent(ev) {
  if (mapMode === "3d") {
    const { sx, sy } = canvasXY(ev);
    const ray = screenRay(cam3, canvas.width, canvas.height, sx, sy);
    let unit = null;
    let part = null;
    let best = 1e9;
    for (const vu of visibleUnits()) {
      const u = worldUnit(vu.id);
      if (!u) continue;
      for (const b of unitHitboxes(u)) {
        if (!b.flesh && !b.armor) continue;
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

function drawGrid() {
  const map = view.map;
  const g = map.grid || 1;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = map.min[0]; x <= map.max[0] + 1e-6; x += g) {
    const a = toScreen([x, map.min[1]]);
    const b = toScreen([x, map.max[1]]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = map.min[1]; y <= map.max[1] + 1e-6; y += g) {
    const a = toScreen([map.min[0], y]);
    const b = toScreen([map.max[0], y]);
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

function drawCover() {
  const hot = hotCoverIndex();
  view.map.cover.forEach((c, i) => {
    const a = toScreen([c.min[0], c.max[1]]);
    const b = toScreen([c.max[0], c.min[1]]);
    const frac = c.durability_max ? c.durability / c.durability_max : 1;
    ctx.globalAlpha = frac < 0.05 ? 1 : 0.45 + 0.5 * frac;
    ctx.fillStyle = frac < 0.05 ? "#2a2a2a" : (c.color || "#6a7b66");
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = i === hot ? "#d7b15a" : "#6d7c64";
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
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
  return { min, max, height: c.height || 1, durability: c.durability };
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

function drawShotGeom(prev) {
  if (!prev?.ok) return;
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

function reachRingColor() {
  return selectedGait() === Gait.Walk ? "rgba(110,168,255,0.5)" : "rgba(215,177,90,0.6)";
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
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
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
  return true;
}

function snapshotStrategyCam() {
  return { target: { ...cam3.target }, yaw: cam3.yaw, pitch: cam3.pitch, dist: cam3.dist };
}

function restoreStrategyCam() {
  cam3.fpv = false;
  cam3.fpvEye = null;
  cam3.fpvLook = null;
  if (!savedStrategy || !Number.isFinite(savedStrategy.yaw) || !Number.isFinite(savedStrategy.dist)) return;
  cam3.target = { ...savedStrategy.target };
  cam3.yaw = savedStrategy.yaw;
  cam3.pitch = savedStrategy.pitch;
  cam3.dist = savedStrategy.dist;
}

function resetCam3() {
  const fresh = makeCam3();
  cam3.target = { ...fresh.target };
  cam3.yaw = fresh.yaw;
  cam3.pitch = fresh.pitch;
  cam3.dist = fresh.dist;
  cam3.fpv = false;
  cam3.fpvEye = null;
  cam3.fpvLook = null;
  camKind = "strategy";
  savedStrategy = snapshotStrategyCam();
  syncModePairs();
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
}

function setCamKind(next) {
  if (next === camKind) return;
  if (next === "fpv") {
    if (mapMode !== "3d") return;
    savedStrategy = snapshotStrategyCam();
    if (!applyFpvCam()) return;
    camKind = "fpv";
  } else {
    camKind = "strategy";
    restoreStrategyCam();
  }
  syncModePairs();
  render();
}

function toggleCamKind() {
  setCamKind(camKind === "fpv" ? "strategy" : "fpv");
}

function render3() {
  if (camKind === "fpv") applyFpvCam();
  ctx.fillStyle = "#1a2228";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const map = view.map;
  const w = canvas.width;
  const h = canvas.height;
  drawFloor3(ctx, cam3, w, h, map);
  if (camKind !== "fpv") drawCoverUseRings3();
  const parts = [];
  for (const c of map.cover) {
    const box = coverBox({
      min: { x: c.min[0], y: c.min[1] },
      max: { x: c.max[0], y: c.max[1] },
      height: c.height,
    });
    const frac = c.durability_max ? c.durability / c.durability_max : 1;
    parts.push({ ...box, color: frac < 0.05 ? "#3a3a3a" : (c.color || "#6a7b66"), facing: 0 });
  }
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
    for (const b of unitHitboxes(drawn)) {
      const hot = hoverUnit && hoverUnit.id === vu.id && hoverPart === b.name;
      parts.push({
        ...b,
        color: partHex(b.name, vu.team, vu.downed || vu.dead, hot),
        facing: drawn.facing || 0,
        ghost: faded,
      });
    }
  }
  if (ghostMoved && ghost && camKind !== "fpv") {
    const vu = view.units.find((x) => x.id === ghost.id);
    for (const b of unitHitboxes(ghost)) {
      parts.push({
        ...b,
        color: partHex(b.name, vu?.team ?? 0, false, false),
        facing: ghost.facing || 0,
        ghost: true,
      });
    }
  }
  drawScene3(ctx, cam3, w, h, parts);
  const actor = view.units.find((x) => x.id === actorId());
  const wu = actor ? worldUnit(actor.id) : null;
  if (wu && camKind !== "fpv") drawReachRing3((ghost || wu).pos, gaitReach());
  if (actor) {
    let from = asXY(actor.pos);
    for (const q of view.queue || []) {
      if (q.type !== "move" || !q.dest) continue;
      const to = asXY(q.dest);
      drawPolyline3(ctx, cam3, w, h, [{ ...from, z: 0.06 }, { ...to, z: 0.06 }], MOVE_LINE, [5, 4]);
      from = to;
    }
  }
  if (movePreview?.ok) {
    drawPolyline3(ctx, cam3, w, h, [
      { ...asXY(movePreview.from), z: 0.07 },
      { ...asXY(movePreview.dest), z: 0.07 },
    ], MOVE_LINE, [5, 4]);
  }
  if (shotPreview?.ok && wu) {
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
  if (view.last_shot?.valid && !shotPreview?.ok) {
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
    for (const b of unitHitboxes(ghost)) drawBoxEdges3(b, "rgba(215,177,90,0.7)");
  }
  if (hoverUnit && hoverPart) {
    const hu = worldUnit(hoverUnit.id);
    const box = hu && unitHitboxes(hu).find((b) => b.name === hoverPart);
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
    const ringAt = ghostActor() || actor;
    drawCircle(ringAt.pos, gaitReach(), reachRingColor());
  }
  if (actor) {
    let from = asXY(actor.pos);
    for (const q of view.queue || []) {
      if (q.type !== "move" || !q.dest) continue;
      const to = asXY(q.dest);
      const s = toScreen(from);
      const e = toScreen(to);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
      ctx.strokeStyle = "rgba(110,207,154,0.7)";
      ctx.setLineDash([4, 3]);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(110,207,154,0.85)"; ctx.fill();
      from = to;
    }
  }
  if (movePreview?.ok) {
    const s = toScreen(movePreview.from);
    const e = toScreen(movePreview.dest);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = MOVE_LINE;
    ctx.setLineDash([5, 4]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fillStyle = MOVE_LINE; ctx.fill();
  }
  if (shotPreview?.ok) drawShotGeom(shotPreview);
  if (view.last_shot?.valid) {
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
      <div class="tl-track">${committed}${queued}${ghost}<div class="tl-clock" style="left:${(clock / 5) * 100}%"></div></div></div>`;
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
  shotPreview = ctxn
    ? eng.previewShot(ctxn.actor.id, ctxn.target.id, ctxn.mode, ctxn.aim, ctxn.offset, ctxn.overrides)
    : null;
  return ctxn;
}

function fmtHit(prev) {
  if (!prev?.ok) return "—";
  const cover = prev.p_cover > 0.02 ? `<div class="meta">cov ${Math.round(prev.p_cover * 100)}%</div>` : "";
  return `${Math.round(prev.p_hit * 100)}%${cover}`;
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
    actions = `<canvas id="sil" width="220" height="168"></canvas>`
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
  if (wu) bindSilhouette(document.getElementById("sil"), wu);
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

function silScale(sil, regions) {
  const maxZ = Math.max(...regions.map((r) => r.z1), 1.8);
  const maxX = Math.max(...regions.map((r) => Math.abs(r.x0)), ...regions.map((r) => Math.abs(r.x1)), 0.4);
  const pad = 14;
  const scale = Math.min((sil.width - pad * 2) / (maxX * 2), (sil.height - pad * 2) / maxZ);
  return {
    pad,
    scale,
    toP: (x, z) => ({ x: sil.width / 2 + x * scale, y: sil.height - pad - z * scale }),
    fromP: (px, py) => ({ x: (px - sil.width / 2) / scale, z: (sil.height - pad - py) / scale }),
  };
}

function coverAtX(profile, x) {
  if (!profile?.length) return 0;
  if (x <= profile[0].x) return profile[0].z;
  if (x >= profile[profile.length - 1].x) return profile[profile.length - 1].z;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (x <= b.x) {
      const t = (x - a.x) / Math.max(1e-6, b.x - a.x);
      return a.z + (b.z - a.z) * t;
    }
  }
  return 0;
}

function diskSampleKind(regions, profile, x, z) {
  if (z < coverAtX(profile, x) - 0.01) return "cover";
  for (const r of regions) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return "hit";
  }
  return "miss";
}

function drawSilhouette(sil, target, preview) {
  if (!sil) return;
  syncSilSize(sil);
  const sctx = sil.getContext("2d");
  const regions = (preview?.silhouette && preview.silhouette.length) ? preview.silhouette : silhouetteFor(target.posture);
  const { scale, toP } = silScale(sil, regions);
  sctx.clearRect(0, 0, sil.width, sil.height);
  sctx.fillStyle = "#0d1014";
  sctx.fillRect(0, 0, sil.width, sil.height);
  for (const r of regions) {
    const a = toP(r.x0, r.z1);
    const b = toP(r.x1, r.z0);
    const fam = partFamily(r.name);
    sctx.fillStyle = fam === "head" ? "#6e4a4a" : fam === "armor" ? "#8a9098"
      : fam === "arms" || fam === "hands" ? "#4a5a6e" : fam === "legs" ? "#4a6e5a" : "#5a5a4a";
    sctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    sctx.strokeStyle = "#c8d0da";
    sctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
  const profile = preview?.cover_profile || [];
  if (profile.some((p) => p.z > 0.02)) {
    sctx.beginPath();
    sctx.moveTo(toP(profile[0].x, 0).x, toP(profile[0].x, 0).y);
    for (const p of profile) {
      const q = toP(p.x, p.z);
      sctx.lineTo(q.x, q.y);
    }
    const last = profile[profile.length - 1];
    sctx.lineTo(toP(last.x, 0).x, toP(last.x, 0).y);
    sctx.closePath();
    sctx.fillStyle = "rgba(28, 36, 18, 0.62)";
    sctx.fill();
    sctx.strokeStyle = "#c4c47a";
    sctx.setLineDash([4, 3]);
    sctx.stroke();
    sctx.setLineDash([]);
  }
  const off = preview?.aim_offset || aimOffset || { x: 0, z: 1.15 };
  const c = toP(off.x, off.z);
  const radius = preview?.radius || preview?.sigma || 0.15;
  const rad = Math.max(2, radius * scale);
  const steps = 36;
  const cell = Math.max(1.2, (2 * rad) / steps);
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const dx = (i / steps) * radius;
      const dz = (j / steps) * radius;
      if (dx * dx + dz * dz > radius * radius) continue;
      const kind = diskSampleKind(regions, preview?.cover_profile, off.x + dx, off.z + dz);
      const p = toP(off.x + dx, off.z + dz);
      sctx.fillStyle = kind === "hit" ? "rgba(215,177,90,0.72)"
        : kind === "cover" ? "rgba(70, 78, 36, 0.7)"
        : "rgba(18, 20, 26, 0.72)";
      sctx.fillRect(p.x - cell / 2, p.y - cell / 2, cell + 0.4, cell + 0.4);
    }
  }
  sctx.beginPath();
  sctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
  sctx.strokeStyle = "#d7b15a";
  sctx.lineWidth = 2;
  sctx.stroke();
}

function bindSilhouette(sil, target) {
  if (!sil) return;
  sil.onmousedown = (ev) => {
    const regions = (shotPreview?.silhouette && shotPreview.silhouette.length)
      ? shotPreview.silhouette : silhouetteFor(target.posture);
    const { fromP } = silScale(sil, regions);
    const move = (e) => {
      const rect = sil.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (sil.width / rect.width);
      const py = (e.clientY - rect.top) * (sil.height / rect.height);
      aimOffset = fromP(px, py);
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
    : `Round ${view.round} · play · tape ${view.clock.toFixed(1)} / 5.0s`;
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

canvas.addEventListener("mousemove", (ev) => {
  if (!view) return;
  if (orbiting) {
    orbitCam(cam3, ev.movementX * 0.008, -ev.movementY * 0.008);
    didOrbit = true;
    render();
    return;
  }
  const pick = pickFromEvent(ev);
  const w = pick.ground;
  hoverWorld = w;
  hoverUnit = pick.unit;
  hoverPart = pick.part || null;
  const u = pick.unit;
  canvas.style.cursor = u ? "pointer" : "crosshair";
  const actor = view.units.find((x) => x.id === actorId());
  if (!u && actor && w) {
    window.clearTimeout(scanHold);
    const prev = eng.previewMove(actor.id, { x: w.x, y: w.y }, selectedGait(), view.phase === Phase.Play);
    if (prev?.ok && !prev.truncated) {
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
  updateInspectShots();
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
  if (mapMode === "2d" && camKind === "fpv") {
    camKind = "strategy";
    restoreStrategyCam();
  }
  syncModePairs();
  render();
});
bindPair("camPair", (v) => setCamKind(v));

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
        if (actor) movePreview = eng.previewMove(actor.id, { x: dest.x, y: dest.y }, toggleVal("gait"), view.phase === Phase.Play);
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
  return index.scenarios[0]?.id || "duel_2v2";
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
