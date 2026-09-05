export const TURN_SECONDS = 5;

export const ActionType = {
  Move: "move",
  Shoot: "shoot",
  EndTurn: "end_turn",
  Reload: "reload",
  Bandage: "bandage",
  SetPosture: "posture",
  CoverPost: "cover_post",
  CoverHide: "cover_hide",
  Overwatch: "overwatch",
  ReadyWeapon: "ready",
  ContactReady: "contact_ready",
  ReactShift: "react_shift",
  ReactDrop: "react_drop",
  ReactTrack: "react_track",
  ReactBrace: "react_brace",
  ReactSkip: "react_skip",
  OverwatchFire: "ow_fire",
  OverwatchHold: "ow_hold",
};

export const Gait = { Walk: "walk", Run: "run", Sprint: "sprint" };
export const ShotMode = { Snap: "snap", Precise: "precise", Aimed: "aimed", Burst: "burst" };
export const AimRegion = { Torso: "torso", Head: "head", Legs: "legs" };
export const Posture = { Standing: "stand", Crouching: "crouch", Prone: "prone" };
export const CoverMode = { Post: "post", Hide: "hide" };
export const Phase = { Contact: "contact", Play: "play", Over: "over" };

export function findUnit(world, id) {
  return world.units.find((u) => u.id === id) || null;
}

export function unitAlive(u) {
  return u && !u.downed && !u.dead;
}

export function emptyChannels() {
  return { hands: TURN_SECONDS, legs: TURN_SECONDS, focus: TURN_SECONDS, voice: TURN_SECONDS };
}

export function emptyTape() {
  return { hands: [], legs: [], focus: [], voice: [] };
}

export function makeUnit(partial, id) {
  return {
    id,
    name: partial.name || `Unit-${id}`,
    team: partial.team || 0,
    pos: { x: partial.pos?.[0] ?? partial.pos?.x ?? 0, y: partial.pos?.[1] ?? partial.pos?.y ?? 0 },
    facing: partial.facing || 0,
    initiative_base: partial.initiative ?? partial.initiative_base ?? 3,
    loadout_init: partial.loadout_init || 0,
    initiative: 3,
    awareness: partial.awareness ?? 3,
    endurance: partial.endurance ?? 3,
    firearms: partial.firearms ?? 3,
    medicine: partial.medicine ?? 1,
    experience: partial.experience ?? 0.35,
    posture: partial.posture || Posture.Standing,
    ch: emptyChannels(),
    tape: emptyTape(),
    reaction_left: 2,
    reaction_max: 2,
    contact_ready: false,
    weapon_ready: true,
    ammo: partial.ammo ?? 24,
    ammo_max: 30,
    mag: partial.mag ?? 8,
    mag_size: partial.mag_size ?? 8,
    weapon_spread: partial.accuracy_deg != null ? partial.accuracy_deg * 0.01745329252 : 0.038,
    weapon_pen: partial.weapon_pen ?? 16,
    max_range: partial.max_range ?? 40,
    blood: 0,
    pain: 0,
    pain_tolerance: 70,
    stress: 0,
    stress_tolerance: 50,
    wounds: [],
    armor: [],
    downed: false,
    dead: false,
    panicked: false,
    last_gait: Gait.Walk,
    cover_use: null,
    overwatch: false,
    ow_origin: { x: 0, y: 0 },
    ow_dir: { x: 1, y: 0 },
    ow_half_rad: 0.45,
    ow_range: 18,
    sil_w: 0.55,
    sil_d: 0.35,
  };
}

export function makeWorld() {
  return {
    scenario_name: "unnamed",
    seed: 1,
    rng_state: 1,
    phase: Phase.Contact,
    map: {
      min: { x: 0, y: 0 },
      max: { x: 20, y: 16 },
      grid: 1,
      cover: [],
      surprise0: 1,
      surprise1: 1,
    },
    units: [],
    turn_order: [],
    turn_index: 0,
    round: 1,
    active: 0,
    clock: 0,
    skip_contact: false,
    combat_over: false,
    winner_team: -1,
    last_shot: { valid: false },
    history: [],
    pending_react: { active: false, reactor: 0, trigger: 0 },
    pending_ow: { active: false, watcher: 0, mover: 0 },
  };
}

export function worldFromScenario(data) {
  const src = data.scenario || data;
  const w = makeWorld();
  w.scenario_name = src.name || "unnamed";
  w.seed = src.seed || 1;
  w.skip_contact = !!(src.skip_contact || src.start_phase === "play");
  if (src.map) {
    const m = src.map;
    if (m.min) w.map.min = { x: m.min[0], y: m.min[1] };
    if (m.max) w.map.max = { x: m.max[0], y: m.max[1] };
    if (m.grid != null) w.map.grid = m.grid;
    if (m.surprise0 != null) w.map.surprise0 = m.surprise0;
    if (m.surprise1 != null) w.map.surprise1 = m.surprise1;
    if (m.cover) {
      w.map.cover = m.cover.map((c) => ({
        min: { x: c.min[0], y: c.min[1] },
        max: { x: c.max[0], y: c.max[1] },
        height: c.height ?? 1.1,
        protection: c.protection ?? 16,
        durability: c.durability ?? 10,
        durability_max: c.durability ?? 10,
      }));
    }
  }
  let next = 1;
  for (const u of src.units || []) {
    w.units.push(makeUnit(u, u.id || next++));
  }
  return w;
}

export function defaultWorld() {
  return worldFromScenario({
    name: "2v2 courtyard",
    seed: 1,
    skip_contact: true,
    map: {
      min: [0, 0],
      max: [20, 16],
      grid: 1,
      surprise0: 1,
      surprise1: 0.75,
      cover: [
        { min: [7.5, 3.0], max: [9.5, 6.5], height: 1.15, protection: 16, durability: 10 },
        { min: [11.0, 9.5], max: [13.2, 12.8], height: 1.2, protection: 16, durability: 10 },
        { min: [4.0, 11.0], max: [6.0, 13.0], height: 0.9, protection: 10, durability: 6 },
      ],
    },
    units: [
      { name: "Alpha-1", team: 0, pos: [3.0, 5.5], facing: 0, initiative: 4, firearms: 4, awareness: 4, endurance: 3, experience: 0.7 },
      { name: "Alpha-2", team: 0, pos: [3.2, 10.5], facing: 0.15, initiative: 3, firearms: 3, awareness: 3, endurance: 3, experience: 0.3 },
      { name: "Bravo-1", team: 1, pos: [17.0, 6.0], facing: 3.14, initiative: 4, firearms: 3, awareness: 3, endurance: 3, experience: 0.55 },
      { name: "Bravo-2", team: 1, pos: [16.5, 11.2], facing: 3.0, initiative: 2, firearms: 2, awareness: 2, endurance: 3, experience: 0.2 },
    ],
  });
}

export function surpriseFor(world, team) {
  return team === 0 ? world.map.surprise0 : world.map.surprise1;
}

export function clone(obj) {
  return structuredClone(obj);
}
