import { Engine, worldFromScenario, defaultWorld, silhouetteFor } from "./engine/engine.js";
import { ActionType, Gait, ShotMode, AimRegion, Phase } from "./engine/model.js";
import { rotate } from "./engine/vec.js";

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
let hoverShotMode = null;
let movePreview = null;
let shotPreview = null;
let fog = false;
let owAim = false;

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
  if (inspected && inspected === view.active) inspected = 0;
  render();
  renderChrome();
}

function pushEvents(events) {
  if (!events) return;
  for (const e of events) eventLog.push(e.text);
}

function applyNow(action) {
  const r = eng.apply(action);
  pushEvents(r.events);
  refresh();
  return r;
}

function queueNow(action, ev) {
  action.overlap = !!(ev && (ev.ctrlKey || ev.metaKey));
  const r = eng.schedule(action);
  if (!r.ok) {
    eventLog.push(r.error || "could not queue");
  }
  refresh();
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

function worldFromEvent(ev) {
  const rect = syncCanvasSize();
  const sx = (ev.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
  const sy = (ev.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
  return {
    x: camera.x + (sx - canvas.width / 2) / camera.zoom,
    y: camera.y - (sy - canvas.height / 2) / camera.zoom,
  };
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

function drawCover() {
  for (const c of view.map.cover) {
    const a = toScreen([c.min[0], c.max[1]]);
    const b = toScreen([c.max[0], c.min[1]]);
    const frac = c.durability_max ? c.durability / c.durability_max : 1;
    ctx.fillStyle = frac < 0.05 ? "#2a2a2a" : `rgba(61,74,58,${0.35 + 0.5 * frac})`;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = "#6d7c64";
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}

function asXY(p) {
  if (!p) return { x: 0, y: 0 };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function drawCone(origin, aimPoint, half) {
  const o = asXY(origin);
  const a = asXY(aimPoint);
  const delta = { x: a.x - o.x, y: a.y - o.y };
  const dist = Math.max(0.4, Math.hypot(delta.x, delta.y));
  const ang = Math.atan2(delta.y, delta.x);
  const len = dist + 0.4;
  const os = toScreen(o);
  const l = toScreen([o.x + Math.cos(ang + half) * len, o.y + Math.sin(ang + half) * len]);
  const r = toScreen([o.x + Math.cos(ang - half) * len, o.y + Math.sin(ang - half) * len]);
  ctx.beginPath();
  ctx.moveTo(os.x, os.y); ctx.lineTo(l.x, l.y); ctx.lineTo(r.x, r.y); ctx.closePath();
  ctx.fillStyle = "rgba(215,177,90,0.14)";
  ctx.fill();
  ctx.strokeStyle = "rgba(215,177,90,0.55)";
  ctx.stroke();
}

function drawShotGeom(prev) {
  if (!prev?.ok) return;
  const origin = prev.origin;
  const aim = prev.aim_world || {
    x: asXY(origin).x + asXY(prev.aim_dir).x * (prev.distance || 8),
    y: asXY(origin).y + asXY(prev.aim_dir).y * (prev.distance || 8),
  };
  drawCone(origin, aim, prev.cone_half_rad || 0);
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

function drawUnits() {
  for (const u of visibleUnits()) {
    const p = toScreen(u.pos);
    const r = (u.posture === "prone" ? 0.22 : u.posture === "crouch" ? 0.28 : 0.32) * camera.zoom;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * (u.posture === "prone" ? 1.4 : 1), r, 0, 0, Math.PI * 2);
    ctx.fillStyle = u.downed || u.dead ? "#444" : teamColor(u.team);
    ctx.fill();
    ctx.lineWidth = u.active || u.id === inspected ? 3 : 1.5;
    ctx.strokeStyle = u.overwatch ? "#8b7cc4" : (u.active ? "#d7b15a" : "#0d1014");
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(u.facing) * r * 1.5, p.y - Math.sin(u.facing) * r * 1.5);
    ctx.strokeStyle = "#f4f7fb";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e8edf4";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${u.name}${u.contact_ready ? " ✓" : ""}`, p.x, p.y - r - 7);
  }
}

function render() {
  syncCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!view) return;
  const a = toScreen(view.map.min);
  const b = toScreen(view.map.max);
  ctx.fillStyle = "#161b22";
  ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
  ctx.strokeStyle = "#4b5a6c";
  ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
  drawGrid();
  drawCover();
  const actor = view.units.find((x) => x.id === actorId());
  const gait = toggleVal("gait");
  const gq = quoteOf(view.quotes?.gaits, gait);
  const walk = quoteOf(view.quotes?.gaits, "walk");
  if (actor && walk) drawCircle(actor.pos, walk.radius, "rgba(110,168,255,0.35)");
  if (actor && gq && gait !== "walk") drawCircle(actor.pos, gq.radius, "rgba(215,177,90,0.7)");
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
    ctx.strokeStyle = "#d7b15a";
    ctx.setLineDash(movePreview.truncated ? [5, 4] : []);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fillStyle = "#d7b15a"; ctx.fill();
  }
  if (shotPreview?.ok) drawShotGeom(shotPreview);
  if (view.last_shot?.valid) {
    const ls = view.last_shot;
    const aimPt = ls.aim_world || ls.end;
    drawCone(ls.origin, aimPt, ls.cone_half_rad);
    const s = toScreen(ls.origin);
    const e = toScreen(ls.end);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = ls.hit ? "#e8edf4" : "#8b96a6";
    ctx.setLineDash(ls.hit ? [] : [6, 4]);
    ctx.stroke(); ctx.setLineDash([]);
  }
  drawUnits();
}

function chBar(label, cur, max, kind) {
  const pct = Math.max(0, Math.min(100, (cur / Math.max(0.01, max)) * 100));
  return `<div class="meta">${label} ${cur.toFixed(1)} / ${max.toFixed(1)}s</div>
    <div class="bar ch ${kind}"><span style="width:${pct}%"></span></div>`;
}

function renderTimeline() {
  const tracks = ["hands", "legs", "focus", "voice"];
  const clock = view.clock || 0;
  const html = tracks.map((ch) => {
    const committed = (view.tape?.[ch] || []).map((iv) => blockHtml(iv, ch, false)).join("");
    const queued = (view.queue || []).filter((q) => q.cost[ch] > 0.01).map((q) =>
      blockHtml({ t0: q.t0, t1: q.t0 + q.cost[ch], label: q.label }, ch, true)
    ).join("");
    return `<div class="tl-row"><div class="tl-lab">${ch}</div>
      <div class="tl-track">${committed}${queued}<div class="tl-clock" style="left:${(clock / 5) * 100}%"></div></div></div>`;
  }).join("");
  document.getElementById("timeline").innerHTML = html;
  document.getElementById("clockLabel").textContent = view.phase === Phase.Play
    ? `· ${clock.toFixed(1)}s used · ${view.window.toFixed(1)}s left`
    : "";
  document.getElementById("queueList").innerHTML = (view.queue || []).map((q) =>
    `<li>${q.overlap ? "during" : "then"} ${q.label} ${q.t0.toFixed(1)}–${q.t1.toFixed(1)}s <button data-unq="${q.id}">x</button></li>`
  ).join("") || "<li>empty</li>";
  document.querySelectorAll("[data-unq]").forEach((btn) => {
    btn.onclick = () => { eng.unschedule(+btn.dataset.unq); refresh(); };
  });
}

function blockHtml(iv, ch, queued) {
  const left = (iv.t0 / 5) * 100;
  const width = Math.max(1.5, ((iv.t1 - iv.t0) / 5) * 100);
  return `<div class="tl-block ${ch} ${queued ? "queued" : ""}" style="left:${left}%;width:${width}%">${iv.label || ""}</div>`;
}

function inspectUnit(id) {
  if (!id || id === view?.active) {
    inspected = 0;
    aimOffset = null;
    preciseAim = false;
  } else {
    inspected = id;
    aimOffset = null;
    preciseAim = false;
  }
  refresh();
}

function inspectSubject() {
  if (!inspected || inspected === view.active) return null;
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
  const hoverU = hoverWorld ? unitAt(hoverWorld) : null;
  const pick = (u) => u && u.team !== actor.team && !u.downed ? u : null;
  const target = pick(hoverU) || pick(subject);
  if (!target) return null;
  const mode = hoverShotMode || fireMode();
  const aim = aimRegion();
  const offset = (subject && subject.id === target.id && preciseAim && aimOffset)
    ? aimOffset
    : eng.defaultAimOffset(target.id, aim);
  return { actor, target, mode, aim, offset };
}

function syncShotPreview() {
  const ctxn = shotContext();
  shotPreview = ctxn
    ? eng.previewShot(ctxn.actor.id, ctxn.target.id, ctxn.mode, ctxn.aim, ctxn.offset)
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
  const ally = actor && u.team === actor.team && u.id !== actor.id;
  const wu = worldUnit(u.id);
  const wounds = (u.wounds || []).map((w) =>
    `<tr><th>Wound</th><td>${w.region}: ${w.text}${w.treated ? " [bound]" : ""}</td></tr>`
  ).join("");
  let actions = "";
  if (enemy) {
    actions = `<canvas id="sil" width="220" height="168"></canvas>
    <table class="act-table">
      <tr><th></th><th>Hit</th><th>Dist</th><th></th></tr>
      <tr data-shot="snap"><td>Snap<span class="cost">${quoteOf(view.quotes?.shots, "snap")?.cost || ""}</span></td>
        <td class="num" id="hit-snap">—</td><td class="num" id="dist-snap">—</td>
        <td><button data-shot="snap">Do</button></td></tr>
      <tr data-shot="precise"><td>Precise<span class="cost">${quoteOf(view.quotes?.shots, "precise")?.cost || ""}</span></td>
        <td class="num" id="hit-precise">—</td><td class="num" id="dist-precise">—</td>
        <td><button data-shot="precise">Do</button></td></tr>
      <tr data-shot="burst"><td>Burst<span class="cost">${quoteOf(view.quotes?.shots, "burst")?.cost || ""}</span></td>
        <td class="num" id="hit-burst">—</td><td class="num" id="dist-burst">—</td>
        <td><button data-shot="burst">Do</button></td></tr>
    </table>`;
  } else if (ally && view.phase === Phase.Play) {
    const qb = quoteOf(view.quotes?.actions, "bandage");
    actions = `<table class="act-table"><tr><td>Bandage</td><td class="cost">${qb?.cost || ""}</td>
      <td><button data-aid="bandage" ${qb?.ok ? "" : "disabled"}>Do</button></td></tr></table>`;
  }
  box.innerHTML = `<h3 style="color:${teamColor(u.team)}">${u.name}</h3>
    <table class="stat-table">
      <tr><th>Posture</th><td>${u.posture}</td></tr>
      <tr><th>Initiative</th><td>${u.initiative}</td></tr>
      <tr><th>Mag</th><td>${u.mag} / ${u.mag_size} · reserve ${u.ammo}</td></tr>
      <tr><th>Weapon</th><td>${u.weapon_ready ? "ready" : "unready"}</td></tr>
      <tr><th>Blood</th><td>${u.blood.toFixed(0)}</td></tr>
      <tr><th>Pain</th><td>${u.pain.toFixed(0)} / ${u.pain_tolerance.toFixed(0)}</td></tr>
      <tr><th>Stress</th><td>${u.stress.toFixed(0)} / ${u.stress_tolerance.toFixed(0)}</td></tr>
      ${wounds}
    </table>${actions}`;
  box.querySelectorAll("button[data-shot]").forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const ctxn = shotContext();
      const off = (preciseAim && aimOffset) ? aimOffset : (ctxn?.offset || null);
      queueNow({
        type: ActionType.Shoot, actor: actorId(), target: u.id,
        shot: btn.dataset.shot, aim: aimRegion(), aimOffset: off,
      }, ev);
    };
  });
  box.querySelectorAll("tr[data-shot]").forEach((tr) => {
    tr.onmouseenter = () => {
      hoverShotMode = tr.dataset.shot;
      updateInspectShots();
      render();
    };
    tr.onmouseleave = () => {
      hoverShotMode = null;
      updateInspectShots();
      render();
    };
  });
  const aid = box.querySelector("[data-aid=bandage]");
  if (aid) aid.onclick = () => queueNow({ type: ActionType.Bandage, actor: actorId(), target: u.id });
  if (wu) bindSilhouette(document.getElementById("sil"), wu);
  updateInspectShots();
}

function updateInspectShots() {
  const u = inspectSubject();
  const actor = view?.units.find((x) => x.id === actorId());
  const enemy = actor && u && u.team !== actor.team && !u.downed && view.phase === Phase.Play;
  const ctxn = syncShotPreview();
  if (!enemy) return;
  const aim = aimRegion();
  const off = ctxn?.offset || ((preciseAim && aimOffset) ? aimOffset : eng.defaultAimOffset(u.id, aim));
  if (!preciseAim) aimOffset = off;
  const snap = eng.previewShot(actor.id, u.id, ShotMode.Snap, aim, off);
  const precise = eng.previewShot(actor.id, u.id, ShotMode.Precise, aim, off);
  const burst = eng.previewShot(actor.id, u.id, ShotMode.Burst, aim, off);
  const set = (id, prev) => {
    const hit = document.getElementById(`hit-${id}`);
    const dist = document.getElementById(`dist-${id}`);
    if (hit) hit.innerHTML = fmtHit(prev);
    if (dist) dist.textContent = prev?.ok ? `${prev.distance.toFixed(1)}m` : "—";
    const q = quoteOf(view.quotes?.shots, id);
    const btn = document.querySelector(`button[data-shot="${id}"]`);
    if (btn) btn.disabled = !q?.ok;
    document.querySelector(`tr[data-shot="${id}"]`)?.classList.toggle("hot", hoverShotMode === id);
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
  const regions = silhouetteFor(target.posture);
  const { scale, toP } = silScale(sil, regions);
  sctx.clearRect(0, 0, sil.width, sil.height);
  sctx.fillStyle = "#0d1014";
  sctx.fillRect(0, 0, sil.width, sil.height);
  for (const r of regions) {
    const a = toP(r.x0, r.z1);
    const b = toP(r.x1, r.z0);
    sctx.fillStyle = r.name === "head" ? "#6e4a4a" : r.name.includes("arm") ? "#4a5a6e" : r.name.includes("leg") ? "#4a6e5a" : "#5a5a4a";
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
    const peak = profile.reduce((m, p) => Math.max(m, p.z), 0);
    if (peak > 0.05) {
      const mid = toP(0, peak);
      sctx.fillStyle = "#c4c47a";
      sctx.font = "10px sans-serif";
      sctx.textAlign = "center";
      sctx.fillText("cover", mid.x, mid.y - 4);
    }
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
    const regions = silhouetteFor(target.posture);
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
  document.getElementById("fogToggle").textContent = fog ? "Player view" : "Dev view";
  document.getElementById("fogToggle").classList.toggle("player", fog);
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
  document.getElementById("turnInfo").innerHTML = !u ? "—" : `
    <strong>${u.name}</strong> · ${u.posture} · init ${u.initiative}<br>
    mag ${u.mag}/${u.mag_size} · reserve ${u.ammo}
    ${contact
      ? chBar("Reaction", u.reaction_left, u.reaction_max, "reaction")
      : `${chBar("Hands", u.hands, 5, "hands")}${chBar("Legs", u.legs, 5, "legs")}${chBar("Focus", u.focus, 5, "focus")}${chBar("Voice", u.voice, 5, "voice")}`}
    ${!contact ? `<div class="meta">Reaction reserve ${u.reaction_left.toFixed(1)} / ${u.reaction_max.toFixed(1)}s</div>` : ""}`;

  const ids = contact
    ? ["crouch", "prone", "stand", "ready", "contact_ready"]
    : ["crouch", "prone", "stand", "reload", "bandage", "ready", "overwatch"];
  document.getElementById("actionBtns").innerHTML = ids.map((id) => {
    const q = quoteOf(view.quotes.actions, id);
    if (!q) return "";
    return `<button class="act-btn" data-qid="${id}" ${q.ok ? "" : "disabled"} title="${q.reason || q.cost}">
      ${q.label}<span class="cost">${q.cost}</span></button>`;
  }).join("");
  document.querySelectorAll("#actionBtns [data-qid]").forEach((btn) => {
    btn.onclick = (ev) => {
      const id = btn.dataset.qid;
      if (id === "overwatch") {
        owAim = true;
        eventLog.push("click a direction for overwatch");
        refresh();
        return;
      }
      const body = id === "crouch" || id === "prone" || id === "stand"
        ? { type: ActionType.SetPosture, posture: id, actor: actorId() }
        : id === "bandage" ? { type: ActionType.Bandage, actor: actorId(), target: actorId() }
        : id === "contact_ready" ? { type: ActionType.ContactReady, actor: actorId() }
        : { type: id, actor: actorId() };
      if (view.phase === Phase.Play && id !== "overwatch") queueNow(body, ev);
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
  const evWrap = evBox.parentElement;
  const pinned = evWrap.scrollHeight - evWrap.scrollTop - evWrap.clientHeight < 24;
  const shown = eventLog.slice(-1000);
  evBox.start = Math.max(1, eventLog.length - shown.length + 1);
  evBox.innerHTML = shown.map((t) => `<li>${t}</li>`).join("");
  if (pinned) evWrap.scrollTop = evWrap.scrollHeight;
}

canvas.addEventListener("mousedown", (ev) => {
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ev.preventDefault();
});

canvas.addEventListener("click", (ev) => {
  if (!view || view.combat_over) return;
  if (view.pending_ow?.active || view.pending_react?.active) return;
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) ev.preventDefault();
  const w = worldFromEvent(ev);
  const u = unitAt(w);
  if (owAim) {
    owAim = false;
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
      const aim = aimRegion();
      const off = eng.defaultAimOffset(u.id, aim);
      inspected = u.id;
      preciseAim = false;
      aimOffset = off;
      queueNow({ type: ActionType.Shoot, actor: actor.id, target: u.id, shot: mode, aim, aimOffset: off }, ev);
      return;
    }
    inspectUnit(u.id);
    return;
  }
  const dest = { x: w.x, y: w.y };
  if (view.phase === Phase.Contact) {
    applyNow({ type: ActionType.Move, dest, gait: Gait.Walk, actor: actorId() });
  } else {
    queueNow({ type: ActionType.Move, dest, gait: toggleVal("gait"), actor: actorId() }, ev);
  }
});

canvas.addEventListener("mousemove", (ev) => {
  if (!view) return;
  const w = worldFromEvent(ev);
  hoverWorld = w;
  const u = unitAt(w);
  canvas.style.cursor = u ? "pointer" : "crosshair";
  const actor = view.units.find((x) => x.id === actorId());
  if (u || !actor) {
    movePreview = null;
  } else {
    movePreview = eng.previewMove(actor.id, { x: w.x, y: w.y }, view.phase === Phase.Contact ? Gait.Walk : toggleVal("gait"), view.phase === Phase.Play);
  }
  syncShotPreview();
  render();
  const hud = document.getElementById("hoverHud");
  if (u) {
    hud.classList.remove("hidden");
    const enemy = u.team !== actor?.team && !u.downed && view.phase === Phase.Play;
    let extra = u.id === view.active ? " · acting" : (enemy ? " · click to shoot · shift-click aim" : " · inspect");
    if (enemy && shotPreview?.ok) {
      extra = ` · ${Math.round(shotPreview.p_hit * 100)}% ${fireMode()}`
        + (shotPreview.p_cover > 0.02 ? ` · cov ${Math.round(shotPreview.p_cover * 100)}%` : "")
        + "<br>click to shoot · shift-click to aim · ctrl-click overlaps";
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

canvas.addEventListener("mouseleave", () => {
  hoverWorld = null;
  movePreview = null;
  syncShotPreview();
  render();
  document.getElementById("hoverHud").classList.add("hidden");
});

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  camera.zoom = Math.max(16, Math.min(80, camera.zoom * (ev.deltaY > 0 ? 0.92 : 1.08)));
  render();
}, { passive: false });

window.addEventListener("keydown", (ev) => {
  keys.add(ev.key);
  if (ev.key === " " || ev.code === "Space") {
    ev.preventDefault();
    if (view?.phase === Phase.Play) {
      pushEvents(eng.executeQueue().events);
      refresh();
    }
  }
  if (ev.key === "e" || ev.key === "E") {
    if (view?.phase === Phase.Contact) applyNow({ type: ActionType.ContactReady, actor: actorId() });
    else applyNow({ type: ActionType.EndTurn });
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    eng.clearQueue();
    refresh();
  }
});
window.addEventListener("keyup", (ev) => keys.delete(ev.key));

document.getElementById("execute").onclick = () => {
  pushEvents(eng.executeQueue().events);
  refresh();
};
document.getElementById("endTurn").onclick = () => {
  if (view?.phase === Phase.Contact) applyNow({ type: ActionType.ContactReady, actor: actorId() });
  else applyNow({ type: ActionType.EndTurn });
};
document.getElementById("clearQueue").onclick = () => { eng.clearQueue(); refresh(); };
document.getElementById("autoStep").onclick = () => { pushEvents(eng.autoStep()); refresh(); };
document.getElementById("skipContact").onclick = () => {
  inspected = 0;
  pushEvents(eng.skipContact());
  refresh();
};
document.getElementById("fogToggle").onclick = () => { fog = !fog; refresh(); };

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
      if (hoverWorld) {
        const actor = view?.units.find((x) => x.id === actorId());
        if (actor) movePreview = eng.previewMove(actor.id, { x: hoverWorld.x, y: hoverWorld.y }, toggleVal("gait"), view.phase === Phase.Play);
      }
      syncShotPreview();
      render();
    };
  });
});

function tickCam() {
  const speed = 8 / camera.zoom;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) camera.x -= speed;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) camera.x += speed;
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) camera.y += speed;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) camera.y -= speed;
  render();
  requestAnimationFrame(tickCam);
}

async function boot() {
  let world = defaultWorld();
  const paths = ["../scenarios/duel_2v2.json", "/scenarios/duel_2v2.json"];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) {
        world = worldFromScenario(await res.json());
        break;
      }
    } catch {
      /* use default */
    }
  }
  eng.loadWorld(world);
  refresh();
  tickCam();
}
boot();
