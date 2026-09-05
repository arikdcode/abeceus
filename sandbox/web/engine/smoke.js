import { Engine, actionCost, defaultWorld } from "./engine.js";
import { ActionType, Gait, ShotMode, AimRegion } from "./model.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function toPlay(eng) {
  if (!eng.loadWorld(defaultWorld())) fail("load failed");
  for (const u of eng.world.units) u.contact_ready = true;
  const start = [];
  eng.maybeFinishContact(start);
  return start;
}

const eng = new Engine();
const start = toPlay(eng);
console.log("loaded", eng.world.scenario_name, "phase", eng.world.phase);
console.log("play", eng.world.phase, "active", eng.world.active, start.map((e) => e.text).join(" / "));

const actor = eng.world.active;
const me = eng.world.units.find((u) => u.id === actor);
const enemy = eng.world.units.find((u) => u.team !== me.team && !u.downed);
const snapCost = actionCost(me, { type: ActionType.Shoot, shot: ShotMode.Snap }, eng.world);
if (snapCost.voice > 1e-6 || Math.abs(snapCost.hands - snapCost.focus) > 1e-6) {
  fail(`snap cost should be hands=focus, no voice; got ${JSON.stringify(snapCost)}`);
}

const savedCover = eng.world.map.cover;
const savedSpread = me.weapon_spread;
eng.world.map.cover = [];
me.weapon_spread = 0.004;
const tight = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: 0, z: 1.25 });
console.log("tight open", tight.p_hit.toFixed(2), "r", tight.radius.toFixed(3));
if (tight.p_hit < 0.98) fail("tiny disk fully on torso should be ~100%");
me.weapon_spread = savedSpread;
eng.world.map.cover = savedCover;
const belly = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: 0, z: 0.88 });
console.log("abdomen", "hit", belly.p_hit.toFixed(2), "cover", belly.p_cover.toFixed(2));
if (belly.p_cover < 0.45) fail("abdomen behind courtyard cover should clip");
const center = eng.defaultAimOffset(enemy.id, AimRegion.Torso);
const head = eng.defaultAimOffset(enemy.id, AimRegion.Head);
console.log("centers", "torso", center.x.toFixed(2), center.z.toFixed(2), "head", head.x.toFixed(2), head.z.toFixed(2));
if (Math.abs(center.x) > 1e-6 || Math.abs(head.x) > 1e-6) fail("default aims should be on the midline");
if (head.z <= center.z) fail("head center should sit above torso center");
const left = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: -0.3, z: 1.25 });
const right = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: 0.3, z: 1.25 });
console.log("aim world L/R", left.aim_world.y.toFixed(3), right.aim_world.y.toFixed(3));
if (left.aim_world.y <= right.aim_world.y) fail("silhouette left should map to shooter-left");

const walk = eng.schedule({ type: ActionType.Move, actor, dest: { x: 8, y: 6 }, gait: Gait.Walk });
const thenSnap = eng.schedule({ type: ActionType.Shoot, actor, target: enemy.id, shot: ShotMode.Snap });
console.log("then walk", walk.ok, walk.item && `${walk.item.t0.toFixed(2)}-${walk.item.t1.toFixed(2)}`);
console.log("then snap", thenSnap.ok, thenSnap.item && `${thenSnap.item.t0.toFixed(2)}-${thenSnap.item.t1.toFixed(2)}`);
if (!walk.ok || !thenSnap.ok) fail("sequential queue failed");
if (thenSnap.item.t0 + 1e-3 < walk.item.t1) fail("snap should wait until the walk ends");

eng.clearQueue();
const snap = eng.schedule({ type: ActionType.Shoot, actor, target: enemy.id, shot: ShotMode.Snap, overlap: true });
const move = eng.schedule({ type: ActionType.Move, actor, dest: { x: 8, y: 6 }, gait: Gait.Walk, overlap: true });
console.log("overlap snap", snap.ok, snap.item && `${snap.item.t0.toFixed(2)}-${snap.item.t1.toFixed(2)}`);
console.log("overlap move", move.ok, move.item && `${move.item.t0.toFixed(2)}-${move.item.t1.toFixed(2)}`);
const overlap = snap.item && move.item && Math.abs(snap.item.t0 - move.item.t0) < 0.15;
console.log("overlap", overlap);
if (!snap.ok || !move.ok || !overlap) fail("overlap queue failed");

const prev = eng.previewMove(actor, { x: 40, y: 6 }, Gait.Walk);
console.log("far preview truncated", prev.truncated, "dist", prev.dist.toFixed(2), "time", prev.time.toFixed(2));
const ex = eng.executeQueue();
console.log("execute", ex.ok, "clock", eng.world.clock.toFixed(2));
console.log("events", ex.events.map((e) => e.text).join(" | "));
if (!prev.truncated || !ex.ok) fail("execute / truncate failed");
console.log("ok");
