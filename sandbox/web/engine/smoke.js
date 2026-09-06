import { Engine, actionCost, unitHitboxes, turnSeconds, assembleWorld } from "./engine.js";
import { ActionType, Gait, ShotMode, AimRegion, Posture } from "./model.js";
import { CoverMode } from "./cover.js";
import { localHitboxes, clipReport, formatClipReport } from "./body.js";
import { loadRepoCatalog, worldFromCatalog } from "./catalog-node.js";
import { pathFind } from "./path.js";

const catalog = loadRepoCatalog();
const courtyard = () => assembleWorld(catalog, {
  id: "smoke_courtyard",
  name: "Smoke courtyard",
  map: "courtyard",
  seed: 1,
  skip_contact: true,
  units: [
    { character: "alpha-1", pos: [3.0, 5.5], facing: 0.0 },
    { character: "alpha-2", pos: [3.2, 10.5], facing: 0.15 },
    { character: "bravo-1", pos: [17.0, 6.0], facing: 3.14 },
    { character: "bravo-2", pos: [16.5, 11.2], facing: 3.0 },
  ],
});

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function toPlay(eng) {
  if (!eng.loadWorld(courtyard())) fail("load failed");
  for (const u of eng.world.units) u.contact_ready = true;
  const start = [];
  eng.maybeFinishContact(start);
  return start;
}

{
  const skip = new Engine();
  if (!skip.loadWorld(courtyard())) fail("skip load failed");
  if (skip.world.phase !== "play") fail("skip_contact should start in play");
  const held = new Engine();
  const raw = courtyard();
  raw.skip_contact = false;
  if (!held.loadWorld(raw)) fail("contact load failed");
  if (held.world.phase !== "contact") fail("skip_contact false should start in contact");
  const posted = new Engine();
  if (!posted.loadWorld(worldFromCatalog(catalog, "posted_courtyard"))) fail("posted load failed");
  const modes = posted.world.units.map((u) => u.cover_use?.mode);
  if (modes[0] !== "post" || modes[1] !== "hide" || modes[2] !== "post" || modes[3] !== "hide") {
    fail(`posted courtyard starting cover: ${JSON.stringify(modes)}`);
  }
  if (posted.world.units[0].weapon_id !== "rifle") fail("characters should carry the catalog rifle");
  const chk = worldFromCatalog(catalog, "checkpoint");
  if (chk.map.cover.filter((c) => c.height > 2).length < 3) fail("checkpoint should have building-height walls");
  const fence = chk.map.cover.find((c) => c.id === "fence-south");
  if (!fence || fence.color === "#6a7b66") fail("fences should be a distinct color");
  if (!chk.map.cover.some((c) => c.id === "crate-lane" && c.height < 1.3)) fail("checkpoint should keep some postable crates");
  const chkB1 = chk.units.find((u) => u.name === "Bravo-1");
  const chkB2 = chk.units.find((u) => u.name === "Bravo-2");
  if (chkB1?.cover_use?.mode !== "hide" || chkB2?.cover_use?.mode !== "hide") {
    fail(`checkpoint Bravo should start hidden: ${JSON.stringify([chkB1?.cover_use, chkB2?.cover_use])}`);
  }
  const chkEng = new Engine();
  if (!chkEng.loadWorld(chk)) fail("checkpoint load failed");
  const firstTwo = chkEng.world.turn_order.slice(0, 2).map((id) => chkEng.world.units.find((u) => u.id === id));
  if (firstTwo.some((u) => !u || u.team !== 0)) fail("checkpoint should open on Alpha's breach");

  const op = worldFromCatalog(catalog, "outpost");
  if (op.sun !== true) fail("outpost should default the sun on");
  if ((op.sun_el ?? 48) > 16) fail("outpost sun should sit near the horizon");
  if ((op.sun_intensity ?? 1) > 0.62 || (op.sun_intensity ?? 1) < 0.3) fail("outpost sun should be sunset-dim");
  if (op.skip_units !== true) fail("outpost should skip characters");
  if (op.units.length) fail("outpost should load without characters");
  const opEng = new Engine();
  if (!opEng.loadWorld(op)) fail("outpost load");
  if (opEng.view({ fog: false }).units.length) fail("outpost view should stay empty");
  if ((op.map.max.x - op.map.min.x) < 50) fail("outpost should be a large map");
  if (!op.map.surfaces?.some((s) => s.kind === "road")) fail("outpost should have a road surface");
  if (!op.map.surfaces?.some((s) => s.kind === "tracks")) fail("outpost should have approach tracks");
  if (!op.map.cover.some((c) => (c.id || "").startsWith("fp-"))) fail("outpost should plant fence posts");
  if (!op.map.decor?.length) fail("outpost should place elevated decor");
  if (!op.map.cover.some((c) => c.id === "tower-cabin" && (c.z0 || 0) > 4)) fail("tower cabin should sit off the ground");
  if (!op.map.cover.some((c) => c.id === "crate-gate")) fail("outpost should keep a postable gate crate");
  const rocks = op.map.cover.filter((c) => (c.id || "").startsWith("boulder-"));
  if (rocks.length < 7) fail(`outpost should place boulders, got ${rocks.length}`);
  if (!rocks.every((c) => c.mesh?.faces?.length)) fail("outpost boulders should carry sculpted meshes");
  if (new Set(rocks.map((c) => c.mesh.seed)).size < 3) fail("placed boulders should vary by seed");
  if (!opEng.view({ fog: false }).map.cover.some((c) => (c.id || "").startsWith("boulder-") && c.mesh?.faces?.length)) {
    fail("outpost view should keep boulder meshes");
  }
  for (const [id, surf] of [["crate-gate", "crate_wood"], ["conex-south", "corrugated"], ["fence-south", "grate_wall"], ["tent-wall-n", "tarp_tan"]]) {
    const c = [...(op.map.cover || []), ...(op.map.decor || [])].find((x) => x.id === id);
    if (!c || c.surf !== surf) fail(`${id} should wear ${surf}`);
  }
  const postedYard = worldFromCatalog(catalog, "posted_courtyard");
  if (postedYard.skip_units) fail("skip_units should stay off unless a scenario asks for it");
  if (postedYard.units.length < 4) fail("posted courtyard should still load its fireteams");
  if (!op.map.decor.some((c) => c.roof && (c.id || "").includes("office"))) fail("office roof should stay in the map as hidden-by-default decor");

  const lightYard = worldFromCatalog(catalog, "light_yard");
  if ((lightYard.map.max.x - lightYard.map.min.x) < 120) fail("light yard should be the large stress map");
  if ((lightYard.map.lights || []).length < 80) fail(`light yard should be crowded, got ${lightYard.map.lights?.length}`);
  const lightKinds = new Set(lightYard.map.lights.map((L) => L.light));
  for (const id of ["street", "sodium", "mercury", "flood", "search", "work", "headlamp", "beacon", "chem", "hangar", "ruby", "azure", "violet", "ice", "rose", "rake"]) {
    if (!lightKinds.has(id)) fail(`light yard missing ${id}`);
  }
  const search = lightYard.map.lights.find((L) => L.id === "search-b");
  if (!search || search.kind !== "spot") fail("searchlights should stay cones");
  if (search.dy >= -0.55) fail(`searchlights should rake the yard, dy=${search.dy}`);
  const rake = lightYard.map.lights.find((L) => L.light === "rake");
  if (!rake || Math.abs(rake.dz) < 0.35 || Math.hypot(rake.dx, rake.dy) < 0.35) {
    fail("rake floods should hit the ground at an angle");
  }
  const ruby = lightYard.map.lights.find((L) => L.light === "ruby");
  if (!ruby || ruby.r < 0.7 || ruby.b > 0.45) fail("ruby should stay a saturated red");
  if (lightYard.map.cover.some((c) => (c.id || "").startsWith("search-box"))) fail("search housings should not float as bare cubes");
  if (lightYard.map.cover.some((c) => (c.id || "").startsWith("pole-") || (c.id || "").startsWith("mpole-"))) {
    fail("catalog lights should bring their own poles, not leftover sticks");
  }
  const fixtures = [...(lightYard.map.decor || []), ...(lightYard.map.cover || [])];
  if (!fixtures.some((c) => (c.id || "").includes("road-8") && (c.id || "").includes("head"))) {
    fail("street lamps should spawn a glowing head");
  }
  if (!fixtures.some((c) => (c.id || "").includes("chem-0"))) fail("chem lights should be visible sticks");
  if (lightYard.units.length) fail("light yard should have no characters");
  const range = worldFromCatalog(catalog, "night_range");
  if (range.units.length) fail("night range should have no characters");

  const ground = worldFromCatalog(catalog, "ground_yard");
  if (ground.units.length) fail("ground yard should have no characters");
  if (!ground.look) fail("ground yard should be a look-at map");
  if (ground.sun !== true) fail("ground yard should default the sun on");
  if ((ground.map.surfaces || []).length < 24) fail("ground yard should show a wide ground catalog");
  if (!ground.map.surfaces.every((s) => s.label)) fail("ground yard patches should be labeled");
  const groundEng = new Engine();
  if (!groundEng.loadWorld(ground)) fail("ground yard load");
  if (groundEng.view({ fog: false }).units.length) fail("ground yard view should stay empty");

  const mats = worldFromCatalog(catalog, "materials_yard");
  if (mats.units.length) fail("materials yard should have no characters");
  if (!mats.look) fail("materials yard should be a look-at map");
  if (mats.sun !== true) fail("materials yard should default the sun on");
  const matPanels = (mats.map.cover || []).filter((c) => (c.id || "").startsWith("panel-"));
  if (matPanels.length < 48) fail(`materials yard should show a wide surf catalog, got ${matPanels.length}`);
  if (!matPanels.every((c) => c.label && c.surf)) fail("materials panels should be labeled surfs");
  if (!matPanels.some((c) => c.surf === "boulder")) fail("materials yard should include the boulder surf");
  const matsEng = new Engine();
  if (!matsEng.loadWorld(mats)) fail("materials yard load");

  const yard = worldFromCatalog(catalog, "posted_courtyard");
  const around = pathFind(yard.map, { x: 6.4, y: 4.6 }, { x: 10.6, y: 4.6 });
  if (!around.ok || around.points.length < 3) fail("path should bend around the west crate instead of stopping at it");
  const crate = yard.map.cover.find((c) => c.id === "crate-west");
  if (crate) {
    const through = around.points.some((p) => p.x > crate.min.x + 0.15 && p.x < crate.max.x - 0.15 && p.y > crate.min.y + 0.15 && p.y < crate.max.y - 0.15);
    if (through) fail("path should not cut through the west crate");
  }
  const intoYard = pathFind(op.map, { x: 11, y: 23 }, { x: 40, y: 23 });
  if (!intoYard.ok || intoYard.dist < 22) fail("path should take the road through the outpost gate");
}

const eng = new Engine();
const start = toPlay(eng);
console.log("loaded", eng.world.scenario_name, "phase", eng.world.phase);
console.log("play", eng.world.phase, "active", eng.world.active, start.map((e) => e.text).join(" / "));

const actor = eng.world.active;
const me = eng.world.units.find((u) => u.id === actor);
const enemy = eng.world.units.find((u) => u.team !== me.team && !u.downed);
{
  const boxes = unitHitboxes(me);
  const names = new Set(boxes.map((b) => b.name));
  for (const need of ["l_pinky_dist", "r_index_prox", "l_knee", "skull", "front_plate", "abdomen_plate"]) {
    if (!names.has(need)) fail(`body is missing ${need}`);
  }
  if (!boxes.some((b) => b.armor && b.plate === "front_plate")) fail("front plate should be armor geometry");
  if (!names.has("l_eye") || !names.has("r_eye")) fail("head should have both eyes");
}

{
  const armor = [
    { id: "front_plate" }, { id: "back_plate" }, { id: "l_side_plate" },
    { id: "r_side_plate" }, { id: "abdomen_plate" }, { id: "l_shoulder_pad" },
    { id: "r_shoulder_pad" },
  ];
  const samples = [
    ["stand", Posture.Standing, null],
    ["crouch", Posture.Crouching, null],
    ["post", Posture.Crouching, { mode: CoverMode.Post, lip: 1.15 }],
    ["hide", Posture.Crouching, { mode: CoverMode.Hide, lip: 1.15 }],
    ["hide-sandbag", Posture.Crouching, { mode: CoverMode.Hide, lip: 0.72 }],
    ["prone", Posture.Prone, null],
    ["dead", Posture.Standing, null],
  ];
  for (const [label, posture, cover] of samples) {
    const parts = localHitboxes(posture, cover, { armor, downed: label === "dead" });
    console.log(formatClipReport(label, clipReport(parts)));
  }
  const sandbagHide = localHitboxes(Posture.Crouching, { mode: CoverMode.Hide, lip: 0.72 }, { armor });
  const sandbagSkull = sandbagHide.find((b) => b.name === "skull");
  const sandbagTop = sandbagSkull ? sandbagSkull.origin.z + sandbagSkull.hz : 0;
  if (sandbagTop < 0.72) fail(`short-cover hide should peek the skull: top=${sandbagTop}`);
  const corpse = unitHitboxes({ ...me, downed: true });
  const chest = corpse.find((b) => b.name === "chest");
  const zs = (chest?.corners || []).map((c) => c.z);
  if (!zs.length || Math.max(...zs) > 0.55) fail("downed chest should be lying on the back");
  if (Math.min(...zs) < -0.06) fail("downed chest should not sink through the floor");
}
const planned = eng.previewSchedule({ type: ActionType.Shoot, actor, target: enemy.id, shot: ShotMode.Snap });
if (!planned.ok) fail(`previewSchedule snap failed: ${planned.error}`);
if (eng.queue.length) fail("previewSchedule must not queue");

const standShot = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, null, { posture: Posture.Standing });
const proneShot = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, null, { posture: Posture.Prone });
if (!standShot.ok || !proneShot.ok) fail("posture preview shots failed");
if (Math.abs((standShot.origin3?.z || 0) - (proneShot.origin3?.z || 0)) < 0.4) {
  fail(`prone preview should drop the muzzle: stand ${standShot.origin3?.z} prone ${proneShot.origin3?.z}`);
}
const movedShot = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, null, { pos: { x: 8, y: 6 } });
if (!movedShot.ok) fail("moved preview shot failed");
if (Math.abs(movedShot.distance - standShot.distance) < 0.5) {
  fail("moved preview should change shot distance");
}
eng.schedule({ type: ActionType.SetPosture, posture: Posture.Prone, actor });
if (eng.plannedPosture(me) !== Posture.Prone) fail("queued prone should be planned posture");
eng.clearQueue();
const fromHere = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso);
eng.schedule({ type: ActionType.Move, actor, dest: { x: 8, y: 6 }, gait: Gait.Run });
eng.schedule({ type: ActionType.SetPosture, posture: Posture.Crouching, actor });
const fromQueue = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso);
if (Math.hypot((fromQueue.origin3?.x || 0) - 8, (fromQueue.origin3?.y || 0) - 6) > 1.5) {
  fail(`queued run should move the shot origin: ${JSON.stringify(fromQueue.origin3)}`);
}
if (Math.abs((fromQueue.origin3?.z || 0) - (fromHere.origin3?.z || 0)) < 0.15) {
  fail("queued crouch should lower the shot origin");
}
eng.clearQueue();
eng.schedule({ type: ActionType.Move, actor, dest: { x: 8, y: 6 }, gait: Gait.Sprint });
const afterSprint = eng.schedule({ type: ActionType.Shoot, actor, target: enemy.id, shot: ShotMode.Precise });
if (!afterSprint.ok) fail(`precise after sprint should queue: ${afterSprint.error}`);
eng.clearQueue();

if (Math.abs(turnSeconds(eng.world) - 3) > 1e-6) fail(`turn should be 3s from rules.json, got ${turnSeconds(eng.world)}`);
const crouchCost = actionCost(me, { type: ActionType.SetPosture, posture: Posture.Crouching }, eng.world);
const proneCost = actionCost(me, { type: ActionType.SetPosture, posture: Posture.Prone }, eng.world);
if (Math.abs(crouchCost.legs - 0.5) > 1e-6) fail(`crouch should be 0.5s, got ${crouchCost.legs}`);
if (Math.abs(proneCost.legs - 1) > 1e-6) fail(`prone should be 1s, got ${proneCost.legs}`);
const standFromProne = actionCost({ ...me, posture: Posture.Prone }, { type: ActionType.SetPosture, posture: Posture.Standing }, eng.world);
if (Math.abs(standFromProne.legs - 1) > 1e-6) fail(`stand from prone should be 1s, got ${standFromProne.legs}`);
const standFromCrouch = actionCost({ ...me, posture: Posture.Crouching }, { type: ActionType.SetPosture, posture: Posture.Standing }, eng.world);
if (Math.abs(standFromCrouch.legs - 0.5) > 1e-6) fail(`stand from crouch should be 0.5s, got ${standFromCrouch.legs}`);
const quotes = eng.view().quotes.actions.map((a) => a.id);
if (quotes.includes("stand")) fail("stand should be hidden while already standing");
if (!quotes.includes("crouch") || !quotes.includes("prone")) fail("crouch and prone should stay listed");
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
if (!Array.isArray(tight.breakdown) || !tight.breakdown.length) fail("preview should include a disk breakdown");
const hitParts = tight.breakdown.filter((r) => r.id !== "cover" && r.id !== "air");
const sumHit = hitParts.reduce((s, r) => s + r.p, 0);
if (Math.abs(sumHit - tight.p_hit) > 0.02) fail("breakdown parts should sum to p_hit");
const sumAll = tight.breakdown.reduce((s, r) => s + r.p, 0);
if (Math.abs(sumAll - 1) > 0.02) fail("breakdown should cover the whole disk");
me.weapon_spread = savedSpread;
eng.world.map.cover = savedCover;
const belly = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: 0, z: 0.80 });
console.log("abdomen", "hit", belly.p_hit.toFixed(2), "cover", belly.p_cover.toFixed(2));
if (belly.p_cover < 0.28) fail("abdomen behind courtyard cover should clip");
const center = eng.defaultAimOffset(enemy.id, AimRegion.Torso);
const head = eng.defaultAimOffset(enemy.id, AimRegion.Head);
console.log("centers", "torso", center.x.toFixed(2), center.z.toFixed(2), "head", head.x.toFixed(2), head.z.toFixed(2));
if (Math.abs(center.x) > 0.08 || Math.abs(head.x) > 0.08) fail("default aims should be near the midline");
if (head.z <= center.z) fail("head center should sit above torso center");
const left = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: -0.3, z: 1.25 });
const right = eng.previewShot(actor, enemy.id, ShotMode.Snap, AimRegion.Torso, { x: 0.3, z: 1.25 });
console.log("aim world L/R", left.aim_world.y.toFixed(3), right.aim_world.y.toFixed(3));
if (left.aim_world.y <= right.aim_world.y) fail("silhouette left should map to shooter-left");

{
  const openPost = eng.schedule({ type: ActionType.CoverPost, actor });
  if (openPost.ok) fail("post should require a cover ring");
  eng.clearQueue();
  eng.schedule({ type: ActionType.Move, actor, dest: { x: 7.1, y: 4.2 }, gait: Gait.Sprint });
  const post = eng.schedule({ type: ActionType.CoverPost, actor });
  if (!post.ok) fail(`post near crate should queue: ${post.error}`);
  const posted = eng.previewShot(actor, enemy.id, ShotMode.Precise, AimRegion.Head);
  const crate = eng.world.map.cover[0];
  if ((posted.origin3?.z || 0) < crate.height) fail(`posted muzzle should sit above the lip: ${posted.origin3?.z}`);
  if (posted.origin3.x >= crate.min.x && posted.origin3.x <= crate.max.x && posted.origin3.y >= crate.min.y && posted.origin3.y <= crate.max.y && posted.origin3.z < crate.height) {
    fail("posted muzzle must not start inside the crate");
  }
  const hide = eng.schedule({ type: ActionType.CoverHide, actor });
  if (!hide.ok) fail(`hide after post should queue: ${hide.error}`);
  const hidden = eng.previewActor(me);
  const skull = hidden && unitHitboxes(hidden).find((b) => b.name === "skull");
  const headTop = skull ? Math.max(...skull.corners.map((p) => p.z)) : 99;
  if (headTop > crate.height - 0.02) fail(`hidden head should be below the lip: ${headTop} vs ${crate.height}`);
  eng.clearQueue();
}

const walk = eng.schedule({ type: ActionType.Move, actor, dest: { x: 5, y: 5.5 }, gait: Gait.Walk });
const thenSnap = eng.schedule({ type: ActionType.Shoot, actor, target: enemy.id, shot: ShotMode.Snap });
console.log("then walk", walk.ok, walk.item && `${walk.item.t0.toFixed(2)}-${walk.item.t1.toFixed(2)}`);
console.log("then snap", thenSnap.ok, thenSnap.item && `${thenSnap.item.t0.toFixed(2)}-${thenSnap.item.t1.toFixed(2)}`);
if (!walk.ok || !thenSnap.ok) fail("sequential queue failed");
if (thenSnap.item.t0 + 1e-3 < walk.item.t1) fail("snap should wait until the walk ends");
eng.unschedule(walk.item.id);
if (eng.queue.length) fail("unschedule should drop the move and everything after");

eng.clearQueue();
const snap = eng.schedule({ type: ActionType.Shoot, actor, target: enemy.id, shot: ShotMode.Snap, overlap: true });
const move = eng.schedule({ type: ActionType.Move, actor, dest: { x: 5, y: 5.5 }, gait: Gait.Walk, overlap: true });
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
