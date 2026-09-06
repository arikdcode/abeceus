import { Rng } from "./rng.js";
import {
  ActionType, Gait, ShotMode, AimRegion, Posture, Phase,
  findUnit, unitAlive, surpriseFor, emptyTape, makeWorld,
} from "./model.js";
import { rulesOf, turnSeconds, postureTime } from "./rules.js";
import {
  finalizeUnit, resetChannels, spendChannels, canSpend, channelStretch,
  gaitSpeed, gaitLegTime, pathMove, followPath, los2d,
  resolveConeSample, applyCoverHit, applyArmorHit, generateWound,
  previewDisk, sampleDiskOffset, accuracyRadius,
  resolveAimOffset, worldAimPoint,
} from "./combat.js";
import { add, sub, scale, length, normalize, angleOf, clampToAabb, dot } from "./vec.js";
import { partCenterOffset, prettyPart } from "./body.js";
import {
  CoverMode, resolveCoverUse, nearestUse, canPostOver, coverTransitionCost, coverUsable,
} from "./cover.js";

let nextQueueId = 1;

function livingOnTeam(w, team) {
  return w.units.filter((u) => u.team === team && unitAlive(u)).length;
}

function teamsPresent(w) {
  const teams = [...new Set(w.units.map((u) => u.team))];
  return teams.length >= 2 ? teams : null;
}

function rebuildTurnOrder(w, rng) {
  const tiers = [...new Set(w.units.map((u) => u.initiative))].sort((a, b) => b - a);
  w.turn_order = [];
  for (const tier of tiers) {
    const a = [];
    const b = [];
    for (const u of w.units) {
      if (u.initiative !== tier) continue;
      (u.team === 0 ? a : b).push(u.id);
    }
    const shuffle = (v) => {
      for (let i = v.length; i > 1; i--) {
        const j = Number(rng.u64() % BigInt(i));
        [v[i - 1], v[j]] = [v[j], v[i - 1]];
      }
    };
    shuffle(a);
    shuffle(b);
    let aFirst = rng.uniform() < 0.5;
    if (!a.length) aFirst = false;
    if (!b.length) aFirst = true;
    let ia = 0;
    let ib = 0;
    let takeA = aFirst;
    while (ia < a.length || ib < b.length) {
      if (takeA && ia < a.length) w.turn_order.push(a[ia++]);
      else if (!takeA && ib < b.length) w.turn_order.push(b[ib++]);
      takeA = !takeA;
      if (takeA && ia >= a.length) takeA = false;
      if (!takeA && ib >= b.length) takeA = true;
    }
  }
}

function nearestEnemy(w, self) {
  let best = null;
  let bestD = 1e30;
  for (const u of w.units) {
    if (u.team === self.team || !unitAlive(u)) continue;
    const d = length(sub(u.pos, self.pos));
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function nearestCoverPoint(w, from) {
  let best = { ...from };
  let bestD = 1e30;
  for (const c of w.map.cover) {
    if (!coverUsable(c)) continue;
    const cand = [
      { x: c.min.x - 0.45, y: (c.min.y + c.max.y) * 0.5 },
      { x: c.max.x + 0.45, y: (c.min.y + c.max.y) * 0.5 },
      { x: (c.min.x + c.max.x) * 0.5, y: c.min.y - 0.45 },
      { x: (c.min.x + c.max.x) * 0.5, y: c.max.y + 0.45 },
    ];
    for (let p of cand) {
      p = clampToAabb(p, add(w.map.min, { x: 0.3, y: 0.3 }), sub(w.map.max, { x: 0.3, y: 0.3 }));
      const d = length(sub(p, from));
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

function segmentInCone(origin, dir, half, range, a, b) {
  for (let i = 0; i <= 8; i++) {
    const p = add(a, scale(sub(b, a), i / 8));
    const v = sub(p, origin);
    const d = length(v);
    if (d < 0.2 || d > range) continue;
    const ang = Math.acos(Math.min(1, Math.max(-1, dot(dir, scale(v, 1 / d)))));
    if (ang <= half) return true;
  }
  return false;
}

export function actionCost(unit, action, world) {
  const stretch = channelStretch(unit);
  const rules = rulesOf(world);
  const acts = rules.actions;
  const c = { hands: 0, legs: 0, focus: 0, voice: 0, reaction: 0, duration: 0, label: action.type };
  const contact = world?.phase === Phase.Contact;
  if (action.type === ActionType.Move) {
    const gait = contact ? Gait.Walk : (action.gait || Gait.Walk);
    const from = action.from || unit.pos;
    const dest = action.dest || from;
    const dist = length(sub(dest, from));
    const time = gaitLegTime(dist, gait, unit);
    if (contact) c.reaction = time;
    else {
      c.legs = time;
      c.focus = gait === Gait.Sprint ? Math.min(turnSeconds(world), time) : gait === Gait.Run ? time * 0.25 : 0;
    }
    c.label = gait;
  } else if (action.type === ActionType.Shoot) {
    const shot = action.shot === ShotMode.Burst ? acts.burst
      : action.shot === ShotMode.Precise || action.shot === ShotMode.Aimed ? acts.precise
      : acts.snap;
    c.hands = shot.hands * stretch;
    c.focus = shot.focus * stretch;
    c.voice = 0;
    c.label = action.shot || "snap";
  } else if (action.type === ActionType.Reload) {
    c.hands = acts.reload.hands * stretch;
    c.focus = (unit.firearms >= acts.reload.firearms_skilled ? 0 : acts.reload.focus_if_unskilled) * stretch;
    c.label = "reload";
  } else if (action.type === ActionType.Bandage) {
    const skilled = unit.medicine >= acts.bandage.medicine_skilled;
    c.hands = (skilled ? acts.bandage.skilled_hands : acts.bandage.hands) * stretch;
    c.focus = (skilled ? acts.bandage.skilled_focus : acts.bandage.focus) * stretch;
    c.legs = acts.bandage.legs;
    c.voice = acts.bandage.voice;
    c.label = "bandage";
  } else if (action.type === ActionType.SetPosture) {
    const from = action.from_posture || unit.posture;
    const t = postureTime(from, action.posture, world);
    if (contact) c.reaction = t;
    else c.legs = t;
    c.label = action.posture || "posture";
  } else if (action.type === ActionType.CoverPost || action.type === ActionType.CoverHide) {
    const mode = action.type === ActionType.CoverPost ? CoverMode.Post : CoverMode.Hide;
    const t = coverTransitionCost(unit.cover_use?.mode || null, mode);
    if (t) {
      c.hands = t.hands * stretch;
      c.legs = t.legs;
      c.focus = t.focus * stretch;
      c.label = t.label;
    }
  } else if (action.type === ActionType.ReadyWeapon) {
    if (contact) c.reaction = acts.ready.contact_reaction;
    else {
      c.hands = acts.ready.hands * stretch;
      c.focus = acts.ready.focus * stretch;
    }
    c.label = "ready";
  } else if (action.type === ActionType.Overwatch) {
    c.hands = unit.ch.hands;
    c.focus = Math.max(acts.overwatch_min_focus, unit.ch.focus);
    c.label = "overwatch";
  } else if (action.type === ActionType.ContactReady) {
    c.label = "ready up";
  }
  c.duration = Math.max(c.hands, c.legs, c.focus, c.voice, c.reaction);
  return c;
}

function intervalsOverlap(a0, a1, b0, b1) {
  return a0 < b1 - 1e-4 && b0 < a1 - 1e-4;
}

function channelBusy(intervals, t0, t1) {
  return intervals.some((iv) => intervalsOverlap(iv.t0, iv.t1, t0, t1));
}

export class Engine {
  constructor() {
    this.world = makeWorld();
    this.initial = null;
    this.rng = new Rng(1);
    this.queue = [];
    this.lastExec = null;
    this.overlap = false;
    this.fog = false;
    this.viewer = 0;
    this._aimCache = null;
  }

  loadWorld(world) {
    const look = !!(world.look || world.skip_contact) || world.units.length === 0;
    if (!world.units.length && !look) return false;
    for (const u of world.units) finalizeUnit(u, turnSeconds(world));
    this.world = world;
    this.initial = structuredClone(world);
    this.rng = new Rng(world.seed);
    world.rng_state = Number(this.rng.s & 0xFFFFFFFFn);
    rebuildTurnOrder(world, this.rng);
    world.turn_index = 0;
    world.round = 1;
    world.clock = 0;
    world.combat_over = false;
    world.winner_team = -1;
    world.last_shot = { valid: false };
    world.history = [];
    world.pending_react = { active: false, reactor: 0, trigger: 0 };
    world.pending_ow = { active: false, watcher: 0, mover: 0 };
    this.queue = [];
    if (!world.units.length) {
      world.look = true;
      world.phase = Phase.Play;
      world.active = 0;
      world.turn_order = [];
      return true;
    }
    this.startContact();
    if (world.skip_contact) this.skipContact();
    return true;
  }

  startContact() {
    const w = this.world;
    w.phase = Phase.Contact;
    w.clock = 0;
    for (const u of w.units) {
      u.contact_ready = false;
      const sur = surpriseFor(w, u.team);
      const vr = 0.9 + this.rng.uniform() * 0.2;
      u.reaction_left = Math.max(0.35 + u.experience * 0.8, u.reaction_max * sur * vr);
      u.weapon_ready = sur >= 0.8;
    }
    this.advanceContact();
  }

  advanceContact() {
    const w = this.world;
    const order = w.turn_order;
    const start = Math.max(0, order.indexOf(w.active));
    const n = order.length;
    for (let i = 0; i < n; i++) {
      const id = order[(start + i) % n];
      const u = findUnit(w, id);
      if (u && unitAlive(u) && !u.contact_ready) {
        w.active = id;
        return;
      }
    }
    w.active = 0;
  }

  skipContact() {
    const events = [];
    if (this.world.phase !== Phase.Contact) return events;
    for (const u of this.world.units) u.contact_ready = true;
    this.maybeFinishContact(events);
    return events;
  }

  ev(kind, text) {
    return { kind, actor: this.world.active, other: 0, a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, n: 0, text };
  }

  reject(action, why) {
    return { ok: false, events: [{ kind: "rejected", actor: action?.actor || 0, other: 0, a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, n: 0, text: why }] };
  }

  maybeFinishContact(events) {
    const w = this.world;
    if (w.phase !== Phase.Contact) return;
    if (w.units.some((u) => unitAlive(u) && !u.contact_ready)) return;
    events.push(this.ev("contact", "Contact phase over — initiative begins"));
    w.phase = Phase.Play;
    for (const u of w.units) u.reaction_left = u.reaction_max;
    w.turn_index = 0;
    this.beginPlayTurn();
    const u = findUnit(w, w.active);
    if (u) events.push(this.ev("turn_started", `First turn: ${u.name}`));
  }

  beginPlayTurn() {
    const w = this.world;
    if (!w.turn_order.length) return;
    this.queue = [];
    for (let n = 0; n < w.turn_order.length; n++) {
      const id = w.turn_order[w.turn_index % w.turn_order.length];
      const u = findUnit(w, id);
      if (u && unitAlive(u) && !u.panicked) {
        w.active = id;
        resetChannels(u, turnSeconds(w));
        u.last_gait = Gait.Walk;
        u.overwatch = false;
        w.clock = 0;
        if (u.pain > u.pain_tolerance * 2) {
          u.downed = true;
          w.turn_index++;
          continue;
        }
        return;
      }
      w.turn_index++;
      if (w.turn_index % w.turn_order.length === 0) w.round++;
    }
    w.active = 0;
  }

  tickPhysiology(u, events) {
    let bleed = 0;
    for (const w of u.wounds) if (!w.treated) bleed += w.bleed_rate;
    if (bleed > 0) {
      u.blood = Math.min(100, u.blood + bleed);
      events.push({ ...this.ev("bleed", `${u.name} bleeds`), other: u.id, n: bleed });
    }
    u.pain = Math.max(0, u.pain - 6);
    u.stress = Math.max(0, u.stress - 3);
    if (u.blood >= 90) {
      u.downed = true;
      events.push(this.ev("downed", `${u.name} collapses from blood loss`));
    } else if (u.blood >= 70 && this.rng.uniform() < 0.25) {
      events.push(this.ev("bleed", `${u.name} nearly blacks out`));
      u.ch.legs *= 0.5;
      u.ch.focus *= 0.5;
    }
    if (u.stress > u.stress_tolerance * 1.35) {
      u.panicked = true;
      events.push(this.ev("wound", `${u.name} breaks and freezes`));
    }
  }

  advanceTurn(events) {
    const w = this.world;
    if (w.combat_over) return;
    w.turn_index++;
    if (w.turn_order.length && w.turn_index % w.turn_order.length === 0) {
      w.round++;
      for (const u of w.units) u.reaction_left = u.reaction_max;
    }
    this.beginPlayTurn();
    const u = findUnit(w, w.active);
    if (u) {
      this.tickPhysiology(u, events);
      if (!unitAlive(u)) {
        this.checkEnd(events);
        if (!w.combat_over) this.advanceTurn(events);
        return;
      }
      events.push(this.ev("turn_started", `Turn: ${u.name}`));
    }
    this.checkEnd(events);
  }

  checkEnd(events) {
    const w = this.world;
    const teams = teamsPresent(w);
    if (!teams) return;
    const [a, b] = teams;
    const la = livingOnTeam(w, a);
    const lb = livingOnTeam(w, b);
    if (la === 0 || lb === 0) {
      w.combat_over = true;
      w.phase = Phase.Over;
      w.winner_team = la > 0 ? a : lb > 0 ? b : -1;
      w.active = 0;
      events.push(this.ev("combat_ended", `Combat ended. Winner team ${w.winner_team}`));
    }
  }

  queueReactionFor(_reactor, _trigger) {
    return;
  }

  queueReactionsAfterMove(_mover) {
    return;
  }

  queueOverwatchAfterMove(mover, from, to) {
    for (const u of this.world.units) {
      if (!u.overwatch || !unitAlive(u) || u.team === mover.team) continue;
      if (segmentInCone(u.ow_origin, u.ow_dir, u.ow_half_rad, u.ow_range, from, to)) {
        this.world.pending_ow = { active: true, watcher: u.id, mover: mover.id };
        return;
      }
    }
  }

  recordTape(unit, t0, cost) {
    if (!unit.tape) unit.tape = emptyTape();
    for (const ch of ["hands", "legs", "focus", "voice"]) {
      if (cost[ch] > 0.01) unit.tape[ch].push({ t0, t1: t0 + cost[ch], label: cost.label });
    }
  }

  committedOccupancy(unit) {
    const occ = emptyTape();
    if (!unit?.tape) return occ;
    for (const ch of ["hands", "legs", "focus", "voice"]) occ[ch] = [...(unit.tape[ch] || [])];
    return occ;
  }

  plannedOccupancy(unit) {
    const occ = this.committedOccupancy(unit);
    for (const item of this.queue) {
      if (item.actor !== unit.id) continue;
      for (const ch of ["hands", "legs", "focus", "voice"]) {
        if (item.cost[ch] > 0.01) occ[ch].push({ t0: item.t0, t1: item.t0 + item.cost[ch], label: item.cost.label });
      }
    }
    return occ;
  }

  plannedPos(unit) {
    let pos = { ...unit.pos };
    for (const item of this.queue) {
      if (item.actor !== unit.id) continue;
      if ((item.action.type === ActionType.Move || item.action.type === ActionType.CoverPost || item.action.type === ActionType.CoverHide)
        && item.action.dest) {
        pos = { ...item.action.dest };
      }
    }
    return pos;
  }

  plannedCover(unit) {
    let use = unit.cover_use ? { ...unit.cover_use } : null;
    for (const item of this.queue) {
      if (item.actor !== unit.id) continue;
      if (item.action.type === ActionType.Move || item.action.type === ActionType.SetPosture) use = null;
      if (item.action.type === ActionType.CoverPost || item.action.type === ActionType.CoverHide) {
        use = item.action.cover_use ? { ...item.action.cover_use } : { mode: item.action.type === ActionType.CoverPost ? CoverMode.Post : CoverMode.Hide };
      }
    }
    return use;
  }

  plannedPosture(unit) {
    let p = unit.posture;
    for (const item of this.queue) {
      if (item.actor === unit.id && item.action.type === ActionType.SetPosture && item.action.posture) {
        p = item.action.posture;
      }
    }
    return p;
  }

  plannedGait(unit) {
    let g = unit.last_gait;
    for (const item of this.queue) {
      if (item.actor !== unit.id) continue;
      if (item.action.type === ActionType.Move && item.action.gait) g = item.action.gait;
      if (item.action.type === ActionType.CoverPost || item.action.type === ActionType.CoverHide || item.action.type === ActionType.SetPosture) {
        g = Gait.Walk;
      }
    }
    return g;
  }

  previewActor(unit, overrides = {}) {
    if (!unit) return null;
    const cover_use = overrides.cover_use !== undefined ? overrides.cover_use : this.plannedCover(unit);
    return {
      ...unit,
      pos: overrides.pos ? { x: overrides.pos.x, y: overrides.pos.y } : this.plannedPos(unit),
      posture: overrides.posture || this.plannedPosture(unit),
      facing: overrides.facing != null ? overrides.facing : (cover_use?.facing ?? unit.facing),
      last_gait: overrides.last_gait || this.plannedGait(unit),
      cover_use,
    };
  }

  earliestSlot(unit, cost, windowEnd = turnSeconds(this.world)) {
    const occ = this.plannedOccupancy(unit);
    const clock = this.world.clock;
    const d = Math.max(0.05, cost.duration);
    if (clock + d > windowEnd + 1e-3) return null;
    const step = 0.05;
    for (let t = clock; t + d <= windowEnd + 1e-4; t += step) {
      let ok = true;
      for (const ch of ["hands", "legs", "focus", "voice"]) {
        if (cost[ch] <= 0.01) continue;
        if (channelBusy(occ[ch], t, t + cost[ch])) {
          ok = false;
          break;
        }
      }
      if (ok) return t;
    }
    return null;
  }

  sequentialSlot(unit, cost, windowEnd = turnSeconds(this.world)) {
    const last = this.queue.filter((q) => q.actor === unit.id).reduce((m, q) => Math.max(m, q.t1), this.world.clock);
    const d = Math.max(0.05, cost.duration);
    if (last + d > windowEnd + 1e-3) return null;
    const occ = this.plannedOccupancy(unit);
    for (const ch of ["hands", "legs", "focus", "voice"]) {
      if (cost[ch] > 0.01 && channelBusy(occ[ch], last, last + cost[ch])) return null;
    }
    return last;
  }

  remainingWindow() {
    return Math.max(0, turnSeconds(this.world) - this.world.clock);
  }

  planQueueItem(raw) {
    const w = this.world;
    if (w.combat_over) return { ok: false, error: "combat is over" };
    if (w.pending_react.active || w.pending_ow.active) return { ok: false, error: "resolve interrupt first" };
    if (w.phase !== Phase.Play) return { ok: false, error: "queue is for play turns" };
    const actor = findUnit(w, raw.actor || w.active);
    if (!actor || actor.id !== w.active) return { ok: false, error: "not this unit's turn" };

    const action = { ...raw, actor: actor.id };
    if (action.type === ActionType.Move) {
      const preview = this.previewMove(actor.id, action.dest, action.gait || Gait.Walk, true);
      if (!preview.ok) return { ok: false, error: preview.note || "cannot move" };
      action.dest = preview.dest;
      action.from = preview.from;
      action.path = preview.path || null;
      action.gait = preview.gait;
    }
    if (action.type === ActionType.CoverPost || action.type === ActionType.CoverHide) {
      const mode = action.type === ActionType.CoverPost ? CoverMode.Post : CoverMode.Hide;
      const use = resolveCoverUse(w, this.plannedPos(actor), mode, {
        index: action.cover_index, face: action.face,
      });
      if (!use) return { ok: false, error: mode === CoverMode.Post ? "not near postable cover" : "not near cover" };
      action.dest = use.slot;
      action.cover_index = use.index;
      action.face = use.face;
      action.cover_use = use;
    }
    if (action.type === ActionType.SetPosture) action.from_posture = this.plannedPosture(actor);
    const costing = { ...actor, pos: this.plannedPos(actor), cover_use: this.plannedCover(actor), posture: this.plannedPosture(actor) };
    const cost = actionCost(costing, action, w);
    if (action.type === ActionType.Shoot && actor.mag <= 0) return { ok: false, error: "empty mag" };
    const overlap = !!(action.overlap ?? this.overlap);
    const t0 = overlap ? this.earliestSlot(actor, cost) : this.sequentialSlot(actor, cost);
    if (t0 == null) return { ok: false, error: "no room on the tape" };
    if (w.clock + cost.duration > turnSeconds(w) + 1e-3 && t0 + cost.duration > turnSeconds(w) + 1e-3) {
      return { ok: false, error: `past the ${turnSeconds(w)}s window` };
    }
    return {
      ok: true,
      item: {
        id: 0,
        actor: actor.id,
        action,
        cost,
        t0,
        t1: t0 + Math.max(0.05, cost.duration),
        overlap,
      },
    };
  }

  previewSchedule(raw) {
    return this.planQueueItem(raw);
  }

  schedule(raw) {
    const r = this.planQueueItem(raw);
    if (!r.ok) return r;
    r.item.id = nextQueueId++;
    this.queue.push(r.item);
    this.queue.sort((a, b) => a.t0 - b.t0 || a.id - b.id);
    return r;
  }

  unschedule(id) {
    const items = [...this.queue].sort((a, b) => a.t0 - b.t0 || a.id - b.id);
    const i = items.findIndex((q) => q.id === id);
    if (i < 0) return;
    const keep = new Set(items.slice(0, i).map((q) => q.id));
    this.queue = this.queue.filter((q) => keep.has(q.id));
  }

  clearQueue() {
    this.queue = [];
  }

  executeQueue() {
    const events = [];
    const ran = [];
    if (!this.queue.length) return { ok: true, events: [{ kind: "rejected", text: "queue empty", actor: 0, other: 0, a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, n: 0 }] };
    const items = [...this.queue];
    this.queue = [];
    let ok = true;
    for (const item of items) {
      if (this.world.pending_react.active || this.world.pending_ow.active) {
        this.queue.unshift(...items.slice(items.indexOf(item)));
        events.push(this.ev("reaction", "queue paused for interrupt"));
        break;
      }
      const r = this.apply(item.action, { fromQueue: true, item });
      events.push(...r.events);
      ran.push({
        id: item.id,
        type: item.action.type,
        shot: item.action.shot || null,
        gait: item.action.gait || null,
        posture: item.action.posture || null,
        t0: item.t0,
        t1: item.t1,
        ok: r.ok,
        text: (r.events || []).map((e) => e.text).join(" | "),
      });
      if (!r.ok) {
        ok = false;
        this.queue.unshift(...items.slice(items.indexOf(item) + 1));
        break;
      }
      this.world.clock = Math.max(this.world.clock, item.t1);
      this.recordTape(findUnit(this.world, item.actor), item.t0, item.cost);
    }
    this.lastExec = { ok, clock: this.world.clock, ran, leftover: this.queue.map((q) => q.action.type) };
    return { ok, events };
  }

  apply(action, opts = {}) {
    const w = this.world;
    if (w.combat_over) return this.reject(action, "combat is over");
    let r;
    if (w.pending_ow.active) {
      if (action.type !== ActionType.OverwatchFire && action.type !== ActionType.OverwatchHold) {
        return this.reject(action, "resolve overwatch first (fire or hold)");
      }
      r = this.doOwDecision(action);
    } else if (w.pending_react.active) {
      const react = [ActionType.ReactShift, ActionType.ReactDrop, ActionType.ReactTrack, ActionType.ReactBrace, ActionType.ReactSkip];
      if (!react.includes(action.type)) return this.reject(action, "resolve reaction first");
      r = this.doReact(action);
    } else if (w.phase === Phase.Contact) {
      const allowed = [ActionType.Move, ActionType.SetPosture, ActionType.ReadyWeapon, ActionType.ContactReady];
      if (!allowed.includes(action.type)) return this.reject(action, "contact phase: move, posture, ready, or ready-up only");
      if (action.type === ActionType.Move) r = this.doMove(action);
      else if (action.type === ActionType.SetPosture) r = this.doPosture(action);
      else if (action.type === ActionType.ReadyWeapon) r = this.doReady(action);
      else r = this.doContactReady(action);
    } else {
      if (action.actor && action.actor !== w.active && action.type !== ActionType.EndTurn) {
        return this.reject(action, "not this unit's turn");
      }
      switch (action.type) {
        case ActionType.Move: r = this.doMove(action); break;
        case ActionType.Shoot: r = this.doShoot(action); break;
        case ActionType.EndTurn: r = this.doEnd(action); break;
        case ActionType.Reload: r = this.doReload(action); break;
        case ActionType.Bandage: r = this.doBandage(action); break;
        case ActionType.SetPosture: r = this.doPosture(action); break;
        case ActionType.CoverPost:
        case ActionType.CoverHide: r = this.doCoverUse(action); break;
        case ActionType.Overwatch: r = this.doOverwatch(action); break;
        case ActionType.ReadyWeapon: r = this.doReady(action); break;
        default: return this.reject(action, "illegal during play");
      }
    }
    if (r.ok) {
      w.history.push(action);
      if (w.phase === Phase.Play && !opts.fromQueue && action.type !== ActionType.EndTurn) {
        const u = findUnit(w, action.actor || w.active);
        if (u) {
          const cost = opts.item?.cost || actionCost(u, { ...action, from: opts.from, dest: action.dest }, w);
          const t0 = w.clock;
          this.recordTape(u, t0, cost);
          w.clock = Math.min(turnSeconds(w), w.clock + Math.max(0.05, cost.duration));
        }
      }
    }
    return r;
  }

  doMove(action) {
    const w = this.world;
    const actor = findUnit(w, action.actor || w.active);
    if (!actor || !unitAlive(actor)) return this.reject(action, "actor down");
    if (w.phase === Phase.Play && actor.id !== w.active) return this.reject(action, "not your turn");
    const gait = w.phase === Phase.Contact ? Gait.Walk : (action.gait || Gait.Walk);
    if (w.phase === Phase.Play && gait === Gait.Sprint && actor.ch.focus < 2) {
      return this.reject(action, "sprint needs Focus");
    }
    const budget = w.phase === Phase.Contact
      ? actor.reaction_left
      : Math.min(actor.ch.legs, this.remainingWindow());
    const maxd = gaitSpeed(gait, actor) * Math.max(0, budget);
    const walked = followPath(w.map, actor.pos, action.dest, maxd);
    let dest = walked.pos;
    let dist = walked.dist;
    if (dist < 0.05) return this.reject(action, "path blocked");
    let time = gaitLegTime(dist, gait, actor);
    if (time > budget + 1e-3 && dist >= 0.05) time = budget;
    if (w.phase === Phase.Contact) {
      actor.reaction_left -= time;
    } else {
      const focus = gait === Gait.Sprint ? Math.min(3, time) : gait === Gait.Run ? time * 0.25 : 0;
      const err = spendChannels(actor, 0, time, focus, 0);
      if (err) return this.reject(action, err);
      actor.last_gait = gait;
      actor.overwatch = false;
    }
    const from = { ...actor.pos };
    actor.pos = dest;
    const faceFrom = walked.points?.length > 1 ? walked.points[walked.points.length - 2] : from;
    actor.facing = angleOf(sub(dest, faceFrom));
    actor.cover_use = null;
    const e = this.ev("moved", `${actor.name} ${gait}s`);
    e.actor = actor.id;
    e.a = from;
    e.b = dest;
    e.n = dist;
    if (w.phase === Phase.Play) {
      this.queueOverwatchAfterMove(actor, from, dest);
      if (!w.pending_ow.active) this.queueReactionsAfterMove(actor);
    }
    return { ok: true, events: [e] };
  }

  fireShot(actor, target, mode, aim, fromOw, aimOffset) {
    const w = this.world;
    let samples = mode === ShotMode.Burst ? 3 : 1;
    if (actor.mag < samples) samples = actor.mag;
    if (samples <= 0) return this.reject({}, "empty mag");
    const gait = fromOw ? Gait.Walk : actor.last_gait;
    const dist = length(sub(target.pos, actor.pos));
    const { acc, radius } = accuracyRadius(actor, mode, dist, gait);
    const aimOff = resolveAimOffset(aim, target.posture, aimOffset);
    actor.facing = angleOf(sub(target.pos, actor.pos));
    actor.weapon_ready = true;
    const ls = {
      valid: true,
      attacker: actor.id,
      intended: target.id,
      struck: 0,
      origin: { ...actor.pos },
      aim_dir: normalize(sub(worldAimPoint(actor, target, aimOff), actor.pos)),
      aim_world: worldAimPoint(actor, target, aimOff),
      shot_dir: { x: 1, y: 0 },
      cone_half_rad: acc,
      radius,
      t: 0,
      hit: false,
      blocked_cover: false,
      result: "",
      region: "",
    };
    const events = [];
    for (let i = 0; i < samples; i++) {
      if (actor.mag <= 0) break;
      actor.mag--;
      const off = sampleDiskOffset(this.rng, radius);
      const s = resolveConeSample(w, actor, target, mode, aim, off.x, off.z, acc, aimOff);
      ls.shot_dir = s.shot_dir;
      ls.t = s.t;
      ls.region = s.region;
      if (s.origin3) ls.origin3 = s.origin3;
      if (s.dir3) ls.dir3 = s.dir3;
      if (s.point3) ls.end3 = s.point3;
      if (s.hit_cover && s.cover_index >= 0) {
        applyCoverHit(w.map.cover[s.cover_index], actor.weapon_pen);
        ls.result = "cover";
        ls.blocked_cover = true;
        events.push({ ...this.ev("shot", `${actor.name} ${mode} hits cover`), actor: actor.id, other: target.id, a: actor.pos, b: s.point });
        continue;
      }
      if (s.hit_unit) {
        const struck = findUnit(w, s.unit);
        if (!struck) continue;
        applyArmorHit(struck, s, actor.weapon_pen);
        const wr = generateWound(struck, s);
        struck.wounds.push(wr.wound);
        struck.pain += wr.wound.pain;
        struck.stress += wr.wound.stress;
        actor.stress = Math.max(0, actor.stress - 4);
        ls.hit = true;
        ls.struck = struck.id;
        ls.result = s.region;
        events.push({ ...this.ev("shot", `${actor.name} ${mode} hits ${struck.name} ${wr.wound.description}`), actor: actor.id, other: struck.id, a: actor.pos, b: s.point });
        events.push({ ...this.ev("wound", wr.wound.description), actor: actor.id, other: struck.id, n: wr.wound.pain });
        if (wr.kill) {
          struck.dead = true;
          struck.downed = true;
          events.push(this.ev("dead", `${struck.name} is killed`));
        } else if (wr.incapacitate || struck.pain > struck.pain_tolerance * 2) {
          struck.downed = true;
          events.push(this.ev("downed", `${struck.name} is down`));
        }
      } else {
        ls.result = "miss";
        events.push({ ...this.ev("shot", `${actor.name} ${mode} misses ${target.name}`), actor: actor.id, other: target.id, a: actor.pos, b: s.point });
      }
    }
    w.last_shot = ls;
    const r = { ok: true, events };
    this.checkEnd(r.events);
    if (!w.combat_over && unitAlive(target) && target.team !== actor.team) {
      this.queueReactionFor(target.id, actor.id);
    }
    return r;
  }

  doShoot(action) {
    const w = this.world;
    const actor = findUnit(w, action.actor || w.active);
    if (!actor || actor.id !== w.active) return this.reject(action, "not your turn");
    const target = findUnit(w, action.target);
    if (!target || !unitAlive(target)) return this.reject(action, "bad target");
    if (target.team === actor.team) return this.reject(action, "friendly fire off");
    if (length(sub(target.pos, actor.pos)) > actor.max_range) return this.reject(action, "out of range");
    if (actor.mag <= 0) return this.reject(action, "empty mag — reload");
    const hands = action.shot === ShotMode.Burst ? 1.8 : 1;
    const err = spendChannels(actor, hands, 0, hands, 0);
    if (err) return this.reject(action, err);
    actor.overwatch = false;
    return this.fireShot(actor, target, action.shot || ShotMode.Snap, action.aim || AimRegion.Torso, false, action.aimOffset);
  }

  doEnd() {
    const r = { ok: true, events: [] };
    const u = findUnit(this.world, this.world.active);
    if (u) r.events.push(this.ev("turn_ended", `${u.name} ends turn`));
    this.queue = [];
    this.advanceTurn(r.events);
    return r;
  }

  doReload(action) {
    const u = findUnit(this.world, action.actor || this.world.active);
    if (!u || u.id !== this.world.active) return this.reject(action, "not your turn");
    const need = u.mag_size - u.mag;
    if (need <= 0) return this.reject(action, "mag full");
    const take = Math.min(need, u.ammo);
    if (take <= 0) return this.reject(action, "no reserve ammo");
    const err = spendChannels(u, 2, 0, u.firearms >= 3 ? 0 : 0.6, 0);
    if (err) return this.reject(action, err);
    u.ammo -= take;
    u.mag += take;
    return { ok: true, events: [this.ev("treated", `${u.name} reloads`)] };
  }

  doBandage(action) {
    const u = findUnit(this.world, action.actor || this.world.active);
    if (!u || u.id !== this.world.active) return this.reject(action, "not your turn");
    const tgt = action.target ? findUnit(this.world, action.target) : u;
    if (!tgt) return this.reject(action, "no patient");
    if (length(sub(tgt.pos, u.pos)) > 1.2 && tgt.id !== u.id) return this.reject(action, "too far to treat");
    const open = tgt.wounds.find((w) => !w.treated && w.bleed_rate > 0);
    if (!open) return this.reject(action, "no untreated bleed");
    const hands = u.medicine >= 3 ? 2 : 3.6;
    const focus = u.medicine >= 3 ? 0 : 2.8;
    const err = spendChannels(u, hands, 0.4, focus, 0.4);
    if (err) return this.reject(action, err);
    open.treated = true;
    open.bleed_rate *= 0.15;
    tgt.pain = Math.max(0, tgt.pain - 8);
    return { ok: true, events: [this.ev("treated", `${u.name} bandages ${tgt.name} (${prettyPart(open.region) || open.region})`)] };
  }

  doPosture(action) {
    const w = this.world;
    const u = findUnit(w, action.actor || (w.phase === Phase.Play ? w.active : action.actor));
    if (!u) return this.reject(action, "no actor");
    if (w.phase === Phase.Play && u.id !== w.active) return this.reject(action, "not your turn");
    if (u.posture === action.posture) return this.reject(action, "already in this posture");
    const t = postureTime(u.posture, action.posture, w);
    if (w.phase === Phase.Contact) {
      if (u.reaction_left < t) return this.reject(action, "no contact time");
      u.reaction_left -= t;
    } else {
      const err = spendChannels(u, 0, t, 0, 0);
      if (err) return this.reject(action, err);
    }
    u.posture = action.posture;
    u.cover_use = null;
    return { ok: true, events: [this.ev("moved", `${u.name} goes ${u.posture}`)] };
  }

  doCoverUse(action) {
    const w = this.world;
    const u = findUnit(w, action.actor || w.active);
    if (!u || u.id !== w.active) return this.reject(action, "not your turn");
    const mode = action.type === ActionType.CoverPost ? CoverMode.Post : CoverMode.Hide;
    const use = action.cover_use || resolveCoverUse(w, u.pos, mode, {
      index: action.cover_index, face: action.face,
    });
    if (!use) return this.reject(action, mode === CoverMode.Post ? "not near postable cover" : "not near cover");
    if (u.cover_use?.mode === mode && u.cover_use.index === use.index && u.cover_use.face === use.face) {
      return this.reject(action, mode === CoverMode.Post ? "already posted" : "already hidden");
    }
    const t = coverTransitionCost(u.cover_use?.mode || null, mode);
    const err = spendChannels(u, t.hands, t.legs, t.focus, 0);
    if (err) return this.reject(action, err);
    u.pos = { ...use.slot };
    u.facing = use.facing;
    u.cover_use = { index: use.index, face: use.face, mode: use.mode, lip: use.lip };
    u.last_gait = Gait.Walk;
    const verb = mode === CoverMode.Post ? "posts on cover" : "hides behind cover";
    return { ok: true, events: [this.ev("cover", `${u.name} ${verb}`)] };
  }

  doOverwatch(action) {
    const u = findUnit(this.world, this.world.active);
    if (!u) return this.reject(action, "no actor");
    let dir = sub(action.dest || u.pos, u.pos);
    if (length(dir) < 0.1) dir = { x: Math.cos(u.facing), y: Math.sin(u.facing) };
    dir = normalize(dir);
    const err = spendChannels(u, u.ch.hands, 0, Math.max(rulesOf(this.world).actions.overwatch_min_focus, u.ch.focus), 0);
    if (err) return this.reject(action, err);
    u.overwatch = true;
    u.ow_origin = { ...u.pos };
    u.ow_dir = dir;
    u.facing = angleOf(dir);
    return { ok: true, events: [this.ev("overwatch", `${u.name} watches a lane`)] };
  }

  doReady(action) {
    const w = this.world;
    const u = findUnit(w, action.actor || w.active);
    if (!u) return this.reject(action, "no actor");
    const t = 0.6;
    if (w.phase === Phase.Contact) {
      if (u.reaction_left < t) return this.reject(action, "no contact time");
      u.reaction_left -= t;
    } else if (u.id !== w.active) {
      return this.reject(action, "not your turn");
    } else {
      const err = spendChannels(u, t, 0, 0.2, 0);
      if (err) return this.reject(action, err);
    }
    u.weapon_ready = true;
    return { ok: true, events: [this.ev("contact", `${u.name} readies weapon`)] };
  }

  doContactReady(action) {
    const u = findUnit(this.world, action.actor);
    if (!u) return this.reject(action, "who is ready?");
    u.contact_ready = true;
    const r = { ok: true, events: [this.ev("contact", `${u.name} is set`)] };
    this.advanceContact();
    this.maybeFinishContact(r.events);
    return r;
  }

  doReact(action) {
    const w = this.world;
    if (!w.pending_react.active) return this.reject(action, "no reaction");
    const u = findUnit(w, w.pending_react.reactor);
    if (!u) return this.reject(action, "reactor gone");
    let cost = 0;
    if (action.type === ActionType.ReactDrop) cost = 0.55;
    else if (action.type === ActionType.ReactTrack) cost = 0.4;
    else if (action.type === ActionType.ReactBrace) cost = 0.45;
    else if (action.type === ActionType.ReactShift) cost = 1.15;
    if (action.type === ActionType.ReactSkip || u.reaction_left < cost) {
      w.pending_react.active = false;
      return { ok: true, events: [this.ev("reaction", `${u.name} holds`)] };
    }
    let text = `${u.name} reacts`;
    if (action.type === ActionType.ReactDrop) {
      u.posture = Posture.Prone;
      text = `${u.name} drops prone`;
    } else if (action.type === ActionType.ReactTrack) {
      const t = findUnit(w, w.pending_react.trigger);
      if (t) u.facing = angleOf(sub(t.pos, u.pos));
      text = `${u.name} tracks the threat`;
    } else if (action.type === ActionType.ReactBrace) {
      u.stress = Math.max(0, u.stress - 4);
      text = `${u.name} braces`;
    } else if (action.type === ActionType.ReactShift) {
      let dest = action.dest || nearestCoverPoint(w, u.pos);
      if (length(sub(dest, u.pos)) < 0.05) dest = nearestCoverPoint(w, u.pos);
      const step = sub(dest, u.pos);
      if (length(step) > 1.8) dest = add(u.pos, scale(normalize(step), 1.8));
      u.pos = pathMove(w.map, u.pos, dest);
      text = `${u.name} shifts`;
    }
    u.reaction_left -= cost;
    w.pending_react.active = false;
    return { ok: true, events: [this.ev("reaction", text)] };
  }

  doOwDecision(action) {
    const w = this.world;
    const watcher = findUnit(w, w.pending_ow.watcher);
    const mover = findUnit(w, w.pending_ow.mover);
    w.pending_ow.active = false;
    if (!watcher || !mover) return this.reject(action, "overwatch stale");
    if (action.type === ActionType.OverwatchHold) {
      const r = { ok: true, events: [this.ev("reaction", `${watcher.name} holds fire`)] };
      this.queueReactionsAfterMove(mover);
      return r;
    }
    watcher.overwatch = false;
    const r = this.fireShot(watcher, mover, ShotMode.Snap, AimRegion.Torso, true);
    if (!w.combat_over) this.queueReactionsAfterMove(mover);
    return r;
  }

  previewMove(actorId, dest, gait, usePlanned = false, cheap = false) {
    const w = this.world;
    const actor = findUnit(w, actorId);
    const p = { ok: false, actor: actorId, from: actor?.pos, dest: actor?.pos, requested: dest, dist: 0, time: 0, budget: 0, speed: 0, truncated: false, gait: gait || Gait.Walk, note: "" };
    if (!actor || !unitAlive(actor)) return p;
    const from = usePlanned ? this.plannedPos(actor) : { ...actor.pos };
    p.from = from;
    if (w.phase === Phase.Contact) {
      gait = Gait.Walk;
      p.note = "contact: walk only";
    }
    p.gait = gait;
    const speed = gaitSpeed(gait, actor);
    p.speed = speed;
    let budget = w.phase === Phase.Contact ? actor.reaction_left : Math.min(actor.ch.legs, this.remainingWindow());
    if (usePlanned) {
      const queuedLegs = this.queue.filter((q) => q.actor === actor.id).reduce((s, q) => s + q.cost.legs, 0);
      budget = Math.max(0, budget - queuedLegs);
    }
    p.budget = budget;
    if (w.phase === Phase.Play && gait === Gait.Sprint && actor.ch.focus < 2) {
      p.note = "sprint needs Focus";
      return p;
    }
    if (speed <= 0.05 || budget < 0.05) {
      p.note = budget < 0.05 ? "no movement time left" : "cannot move";
      return p;
    }
    const maxd = speed * budget;
    const walked = followPath(w.map, from, dest, maxd);
    p.dest = walked.pos;
    p.path = walked.points;
    p.dist = walked.dist;
    p.time = gaitLegTime(p.dist, gait, actor);
    p.ok = p.dist > 0.04;
    p.truncated = !walked.reached && p.ok;
    if (!p.ok) p.note = "blocked or too close";
    else if (p.truncated) p.note = p.note ? `${p.note}; truncated` : "truncated to remaining time";
    return p;
  }

  previewShot(actorId, targetId, mode, aim, aimOffset, overrides) {
    const w = this.world;
    const actor = findUnit(w, actorId);
    const target = findUnit(w, targetId);
    const p = { ok: false, actor: actorId, target: targetId, distance: 0, cone_half_rad: 0, p_hit: 0, p_cover: 0, origin: actor?.pos, aim_dir: { x: 1, y: 0 } };
    if (!actor || !target || !unitAlive(actor) || !unitAlive(target)) return p;
    const shooter = this.previewActor(actor, overrides);
    if (length(sub(target.pos, shooter.pos)) < 0.2) return p;
    return previewDisk(w, shooter, target, mode || ShotMode.Snap, aim || AimRegion.Torso, aimOffset);
  }

  defaultAimOffset(targetId, aim, overrides) {
    const target = findUnit(this.world, targetId);
    const actor = findUnit(this.world, this.world.active);
    if (!target) return { x: 0, z: 1.1 };
    return resolveAimOffset(aim || AimRegion.Torso, target.posture, null, actor && this.previewActor(actor, overrides), target);
  }

  partAimOffset(targetId, part, overrides) {
    const target = findUnit(this.world, targetId);
    const actor = findUnit(this.world, this.world.active);
    if (!target) return { x: 0, z: 1.1 };
    return partCenterOffset(part, target.posture, actor && this.previewActor(actor, overrides), target);
  }

  bestAimOffset(_actorId, targetId, _mode, aim) {
    return this.defaultAimOffset(targetId, aim);
  }

  autoStep() {
    const w = this.world;
    if (w.combat_over) return [];
    if (w.pending_ow.active) return this.apply({ type: ActionType.OverwatchFire, actor: w.pending_ow.watcher }).events;
    if (w.pending_react.active) {
      const u = findUnit(w, w.pending_react.reactor);
      const a = { actor: w.pending_react.reactor, type: ActionType.ReactSkip, dest: nearestCoverPoint(w, u?.pos || { x: 0, y: 0 }) };
      if (u && u.reaction_left >= 1.15 && length(sub(u.pos, nearestCoverPoint(w, u.pos))) < 2.5) a.type = ActionType.ReactShift;
      else if (u && u.reaction_left >= 0.55 && u.posture === Posture.Standing) a.type = ActionType.ReactDrop;
      else if (u && u.reaction_left >= 0.4) a.type = ActionType.ReactTrack;
      return this.apply(a).events;
    }
    if (w.phase === Phase.Contact) {
      for (const u of w.units) {
        if (!unitAlive(u) || u.contact_ready) continue;
        if (!u.weapon_ready && u.reaction_left > 0.7) return this.apply({ type: ActionType.ReadyWeapon, actor: u.id }).events;
        const cover = nearestCoverPoint(w, u.pos);
        if (length(sub(cover, u.pos)) > 0.4 && u.reaction_left > 0.5) {
          const r = this.apply({ type: ActionType.Move, actor: u.id, dest: cover });
          if (r.ok) return r.events;
        }
        if (u.posture === Posture.Standing) return this.apply({ type: ActionType.SetPosture, actor: u.id, posture: Posture.Crouching }).events;
        return this.apply({ type: ActionType.ContactReady, actor: u.id }).events;
      }
      return [];
    }
    const self = findUnit(w, w.active);
    if (!self) return [];
    const enemy = nearestEnemy(w, self);
    if (!enemy) return this.apply({ type: ActionType.EndTurn, actor: self.id }).events;
    if (self.wounds.some((x) => !x.treated && x.bleed_rate > 3) && self.ch.hands > 2.1) {
      const r = this.apply({ type: ActionType.Bandage, actor: self.id, target: self.id });
      if (r.ok) return r.events;
    }
    if (self.mag <= 0) {
      const r = this.apply({ type: ActionType.Reload, actor: self.id });
      if (r.ok) return r.events;
    }
    const prev = this.previewShot(self.id, enemy.id, ShotMode.Snap, AimRegion.Torso);
    if (self.mag > 0 && prev.p_hit > 0.18 && self.ch.hands > 1) {
      return this.apply({
        type: ActionType.Shoot, actor: self.id, target: enemy.id,
        shot: prev.p_hit > 0.35 && self.ch.hands > 1.8 ? ShotMode.Burst : ShotMode.Snap,
      }).events;
    }
    if (self.ch.legs > 0.6) {
      const dist = length(sub(enemy.pos, self.pos));
      let dest = prev.p_cover > 0.4 || prev.p_hit < 0.12
        ? nearestCoverPoint(w, self.pos)
        : add(self.pos, scale(normalize(sub(enemy.pos, self.pos)), Math.min(4, Math.max(0.6, dist - 3))));
      let r = this.apply({ type: ActionType.Move, actor: self.id, dest, gait: Gait.Run });
      if (r.ok) return r.events;
      r = this.apply({ type: ActionType.Move, actor: self.id, dest, gait: Gait.Walk });
      if (r.ok) return r.events;
    }
    if (self.ch.focus > 1.6 && self.ch.hands > 1) {
      const r = this.apply({ type: ActionType.Overwatch, actor: self.id, dest: enemy.pos });
      if (r.ok) return r.events;
    }
    return this.apply({ type: ActionType.EndTurn, actor: self.id }).events;
  }

  dumpState(extra = {}) {
    const w = this.world;
    const u = findUnit(w, w.active);
    return {
      ...extra,
      at: Date.now(),
      scenario: w.scenario_name,
      scenario_id: w.scenario_id || null,
      phase: w.phase,
      round: w.round,
      clock: w.clock,
      window: this.remainingWindow(),
      active: w.active,
      last_gait: u?.last_gait || null,
      planned: u ? {
        pos: this.plannedPos(u),
        posture: this.plannedPosture(u),
        gait: this.plannedGait(u),
        cover: this.plannedCover(u),
      } : null,
      queue: this.queue.map((q) => ({
        id: q.id,
        type: q.action.type,
        shot: q.action.shot || null,
        aim: q.action.aim || null,
        gait: q.action.gait || null,
        posture: q.action.posture || null,
        target: q.action.target || null,
        dest: q.action.dest || null,
        path: q.action.path || null,
        t0: q.t0,
        t1: q.t1,
        overlap: !!q.overlap,
        cost: q.cost,
      })),
      lastExec: this.lastExec,
      units: w.units.map((x) => ({
        id: x.id, name: x.name, team: x.team,
        pos: { ...x.pos }, posture: x.posture, facing: x.facing,
        last_gait: x.last_gait, cover_use: x.cover_use, mag: x.mag,
        ch: { ...x.ch }, downed: x.downed, dead: x.dead,
      })),
      history: (w.history || []).slice(-40),
    };
  }

  view(opts = {}) {
    const w = this.world;
    const fog = opts.fog ?? this.fog;
    const quoteU = findUnit(w, w.active) || w.units.find((u) => unitAlive(u)) || w.units[0];
    const viewer = fog ? (findUnit(w, w.active) || quoteU) : null;
    const visibleTo = (u) => {
      if (!fog || !viewer) return true;
      if (u.id === viewer.id || u.team === viewer.team || u.dead) return true;
      return los2d(w.map, viewer.pos, u.pos);
    };
    return {
      phase: w.phase,
      round: w.round,
      active: w.active,
      clock: w.clock,
      window: this.remainingWindow(),
      combat_over: w.combat_over,
      winner_team: w.winner_team,
      fog,
      look: !!w.look,
      sun: w.sun,
      sun_az: w.sun_az,
      sun_el: w.sun_el,
      sun_intensity: w.sun_intensity,
      viewer: viewer?.id || 0,
      turn_order: [...w.turn_order],
      pending_react: { ...w.pending_react },
      pending_ow: { ...w.pending_ow },
      queue: this.queue.map((q) => ({
        id: q.id,
        actor: q.actor,
        type: q.action.type,
        label: q.cost.label,
        t0: q.t0,
        t1: q.t1,
        cost: q.cost,
        dest: q.action.dest,
        path: q.action.path,
        target: q.action.target,
        shot: q.action.shot,
        aim: q.action.aim,
        overlap: !!q.overlap,
      })),
      tape: quoteU?.tape || emptyTape(),
      map: {
        min: [w.map.min.x, w.map.min.y],
        max: [w.map.max.x, w.map.max.y],
        grid: w.map.grid,
        surprise0: w.map.surprise0,
        surprise1: w.map.surprise1,
        ground: w.map.ground || "dirt",
        surfaces: (w.map.surfaces || []).map((s) => ({
          kind: s.kind, min: s.min, max: s.max, color: s.color || null,
          tile: s.tile ?? null, label: s.label || null,
        })),
        cover: w.map.cover.map((c) => ({
          id: c.id || null,
          min: [c.min.x, c.min.y], max: [c.max.x, c.max.y],
          height: c.z1 ?? c.height, z0: c.z0 ?? 0, z1: c.z1 ?? c.height,
          color: c.color || "#6a7b66",
          mat: c.mat || null,
          tex: c.tex || null,
          surf: c.surf || null,
          label: c.label || null,
          emit: c.emit || 0,
          emit_dir: c.emit_dir || null,
          mesh: c.mesh || null,
          durability: c.durability, durability_max: c.durability_max,
          roof: !!c.roof,
        })),
        lights: (w.map.lights || []).map((item) => ({
          id: item.id || null,
          light: item.light || null,
          kind: item.kind || "omni",
          x: item.x, y: item.y, z: item.z,
          range: item.range,
          r: item.r, g: item.g, b: item.b,
          intensity: item.intensity,
          dx: item.dx || 0, dy: item.dy || 0, dz: item.dz || 0,
          outerCos: item.outerCos, innerCos: item.innerCos,
        })),
        decor: (w.map.decor || []).map((c) => ({
          id: c.id || null,
          min: [c.min.x, c.min.y], max: [c.max.x, c.max.y],
          height: c.z1 ?? c.height, z0: c.z0 ?? 0, z1: c.z1 ?? c.height,
          color: c.color || "#6a7b66",
          mat: c.mat || null,
          tex: c.tex || null,
          surf: c.surf || null,
          label: c.label || null,
          emit: c.emit || 0,
          emit_dir: c.emit_dir || null,
          mesh: c.mesh || null,
          roof: !!c.roof,
        })),
      },
      units: w.units.map((u) => ({
        id: u.id, name: u.name, team: u.team,
        pos: [u.pos.x, u.pos.y], facing: u.facing, posture: u.posture, initiative: u.initiative,
        pain: u.pain, pain_tolerance: u.pain_tolerance,
        pain_frac: u.pain_tolerance > 0 ? u.pain / u.pain_tolerance : 0,
        blood: u.blood, stress: u.stress, stress_tolerance: u.stress_tolerance,
        downed: u.downed, dead: u.dead, active: u.id === w.active,
        contact_ready: u.contact_ready, weapon_ready: u.weapon_ready, overwatch: u.overwatch,
        visible: visibleTo(u), last_gait: u.last_gait, cover_use: u.cover_use,
        mag: u.mag, mag_size: u.mag_size, ammo: u.ammo,
        hands: u.ch.hands, legs: u.ch.legs, focus: u.ch.focus, voice: u.ch.voice,
        reaction_left: u.reaction_left, reaction_max: u.reaction_max,
        wounds: u.wounds.map((x) => ({ region: x.region, text: x.description, bleed: x.bleed_rate, treated: x.treated, impairment: x.impairment })),
        armor: u.armor.map((p) => ({ id: p.id, name: p.name, region: p.region, dur: p.durability, max: p.durability_max })),
      })),
      last_shot: lastShotView(w, viewer, fog, visibleTo),
      turn_seconds: turnSeconds(w),
      quotes: buildQuotes(w, quoteU, findUnit(w, w.pending_react.reactor), quoteU ? {
        gait: this.plannedGait(quoteU),
        pos: this.plannedPos(quoteU),
        cover_use: this.plannedCover(quoteU),
        posture: this.plannedPosture(quoteU),
      } : {}),
      move: moveInfo(w, quoteU),
    };
  }
}

function lastShotView(w, viewer, fog, visibleTo) {
  const s = w.last_shot || {};
  let show = !!s.valid;
  if (fog && viewer && s.valid) {
    const atk = findUnit(w, s.attacker);
    const involved = s.intended === viewer.id || s.struck === viewer.id || s.attacker === viewer.id;
    show = involved || (atk && visibleTo(atk));
  }
  if (!show) return { valid: false };
  const end = s.origin && s.shot_dir ? {
    x: s.origin.x + s.shot_dir.x * (s.t || 0),
    y: s.origin.y + s.shot_dir.y * (s.t || 0),
  } : { x: 0, y: 0 };
  return {
    valid: true,
    origin: s.origin ? [s.origin.x, s.origin.y] : [0, 0],
    aim_dir: s.aim_dir ? [s.aim_dir.x, s.aim_dir.y] : [1, 0],
    aim_world: s.aim_world ? [s.aim_world.x, s.aim_world.y] : null,
    shot_dir: s.shot_dir ? [s.shot_dir.x, s.shot_dir.y] : [1, 0],
    end: [end.x, end.y],
    cone_half_rad: s.cone_half_rad || 0,
    radius: s.radius || 0,
    origin3: s.origin3 || null,
    end3: s.end3 || null,
    hit: !!s.hit,
    result: s.result || "",
    region: s.region || "",
    intended: s.intended || 0,
    struck: s.struck || 0,
  };
}

function fmtCost(contact, h, l, f, v, rx) {
  if (contact) return `${rx.toFixed(2).replace(/\\.00$/, "")}s reaction`.replace("0s reaction", "0s reaction");
  const parts = [];
  if (h > 0.005) parts.push(`${trimNum(h)}s Hands`);
  if (l > 0.005) parts.push(`${trimNum(l)}s Legs`);
  if (f > 0.005) parts.push(`${trimNum(f)}s Focus`);
  if (v > 0.005) parts.push(`${trimNum(v)}s Voice`);
  return parts.join(" · ") || "free";
}

function trimNum(n) {
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function q(id, label, contact, h, l, f, v, rx, ok, reason) {
  return { id, label, hands: h, legs: l, focus: f, voice: v, reaction: rx, ok, cost: fmtCost(contact, h, l, f, v, rx), reason: reason || "" };
}

function buildQuotes(world, u, reactor, extras = {}) {
  if (!u) return { actions: [], shots: [], gaits: [], reactions: [] };
  const contact = world.phase === Phase.Contact;
  const stretch = channelStretch(u);
  const acts = rulesOf(world).actions;
  const plannedPos = extras.pos || u.pos;
  const plannedCover = extras.cover_use !== undefined ? extras.cover_use : u.cover_use;
  const plannedPosture = extras.posture || u.posture;
  const actions = [];
  const postureQ = (id, label, p) => {
    const already = plannedPosture === p;
    if (p === Posture.Standing && already) return;
    const t = postureTime(plannedPosture, p, world);
    const ok = !already && (contact ? u.reaction_left + 1e-4 >= t : canSpend(u, 0, t, 0, 0));
    actions.push(q(id, label, contact, 0, contact ? 0 : t, 0, 0, contact ? t : 0, ok, already ? "already in this posture" : ok ? "" : "not enough time"));
  };
  postureQ("crouch", "Crouch", Posture.Crouching);
  postureQ("prone", "Prone", Posture.Prone);
  postureQ("stand", "Stand", Posture.Standing);
  {
    const near = nearestUse(world, plannedPos);
    const coverQ = (id, label, mode) => {
      const already = plannedCover?.mode === mode;
      const t = coverTransitionCost(plannedCover?.mode || null, mode);
      const postable = mode !== CoverMode.Post || (near && canPostOver(near.cover));
      const zone = !!(near || plannedCover);
      let reason = "";
      if (contact) reason = "not in contact";
      else if (already) reason = mode === CoverMode.Post ? "already posted" : "already hidden";
      else if (!zone) reason = "stand in a cover ring first";
      else if (!postable) reason = "cover is too high to post over";
      const ok = !contact && !already && zone && postable && t && canSpend(
        { ...u, cover_use: plannedCover }, t.hands, t.legs, t.focus, 0,
      );
      if (!ok && !reason) reason = "not enough time";
      actions.push(q(id, label, false, (t?.hands || 0) * stretch, t?.legs || 0, (t?.focus || 0) * stretch, 0, 0, ok, reason));
    };
    coverQ("cover_post", "Post", CoverMode.Post);
    coverQ("cover_hide", "Hide", CoverMode.Hide);
  }
  {
    const hands = acts.reload.hands;
    const focus = u.firearms >= acts.reload.firearms_skilled ? 0 : acts.reload.focus_if_unskilled;
    const ok = !contact && u.mag < u.mag_size && u.ammo > 0 && canSpend(u, hands, 0, focus, 0);
    actions.push(q("reload", "Reload", false, hands * stretch, 0, focus * stretch, 0, 0, ok, contact ? "not in contact" : ok ? "" : "not enough time"));
  }
  {
    const skilled = u.medicine >= acts.bandage.medicine_skilled;
    const hands = skilled ? acts.bandage.skilled_hands : acts.bandage.hands;
    const focus = skilled ? acts.bandage.skilled_focus : acts.bandage.focus;
    const bleed = u.wounds.some((w) => !w.treated && w.bleed_rate > 0);
    const ok = !contact && bleed && canSpend(u, hands, acts.bandage.legs, focus, acts.bandage.voice);
    actions.push(q("bandage", "Bandage", false, hands * stretch, acts.bandage.legs, focus * stretch, acts.bandage.voice, 0, ok, contact ? "not in contact" : !bleed ? "no untreated bleed" : ok ? "" : "not enough time"));
  }
  {
    const t = acts.ready.contact_reaction;
    const ok = !u.weapon_ready && (contact ? u.reaction_left + 1e-4 >= t : canSpend(u, acts.ready.hands, 0, acts.ready.focus, 0));
    actions.push(q("ready", "Ready weapon", contact, contact ? 0 : acts.ready.hands * stretch, 0, contact ? 0 : acts.ready.focus * stretch, 0, contact ? t : 0, ok, u.weapon_ready ? "already ready" : ok ? "" : "not enough time"));
  }
  actions.push(q("overwatch", "Overwatch", false, u.ch.hands, 0, Math.max(acts.overwatch_min_focus, u.ch.focus), 0, 0, !contact && u.ch.focus + 1e-4 >= acts.overwatch_min_focus, contact ? "not in contact" : "spends remaining Hands + Focus"));
  actions.push(q("contact_ready", "Ready up", true, 0, 0, 0, 0, 0, contact && !u.contact_ready, contact ? "" : "contact only"));

  const shotQ = (id, label, hands, focus, voice) => {
    const ok = !contact && u.mag > 0 && canSpend(u, hands, 0, focus, voice);
    return q(id, label, false, hands * stretch, 0, focus * stretch, voice, 0, ok, contact ? "no shooting in contact" : ok ? "" : "not enough time");
  };
  const shots = [
    shotQ("snap", "Snap", acts.snap.hands, acts.snap.focus, 0),
    shotQ("precise", "Precise", acts.precise.hands, acts.precise.focus, 0),
    shotQ("burst", "Burst ×3", acts.burst.hands, acts.burst.focus, 0),
  ];
  const budget = contact ? u.reaction_left : Math.min(u.ch.legs, Math.max(0, turnSeconds(world) - world.clock));
  const gaits = [Gait.Walk, Gait.Run, Gait.Sprint].map((g) => {
    const spd = gaitSpeed(g, u);
    let ok = budget > 0.05 && (!contact || g === Gait.Walk);
    let reason = "";
    if (contact && g !== Gait.Walk) reason = "walk only in contact";
    if (g === Gait.Sprint && u.ch.focus < 2) {
      ok = false;
      reason = "sprint needs 2s Focus";
    }
    return { id: g, label: g[0].toUpperCase() + g.slice(1), speed: spd, radius: spd * Math.max(0, budget), ok, reason };
  });
  const ru = reactor || u;
  const reactions = [
    q("react_shift", "Shift", true, 0, 0, 0, 0, 1.15, ru.reaction_left >= 1.15, "~1.8m"),
    q("react_drop", "Drop", true, 0, 0, 0, 0, 0.55, ru.reaction_left >= 0.55, "go prone"),
    q("react_track", "Track", true, 0, 0, 0, 0, 0.4, ru.reaction_left >= 0.4, "face threat"),
    q("react_brace", "Brace", true, 0, 0, 0, 0, 0.45, ru.reaction_left >= 0.45, "settle stress"),
    q("react_skip", "Skip", true, 0, 0, 0, 0, 0, true, "free"),
  ];
  return { actions, shots, gaits, reactions };
}

function moveInfo(world, u) {
  if (!u) return { kind: "legs", budget: 0, max: 0, walk: 0, run: 0, sprint: 0 };
  const contact = world.phase === Phase.Contact;
  const budget = contact ? u.reaction_left : Math.min(u.ch.legs, Math.max(0, turnSeconds(world) - world.clock));
  return {
    kind: contact ? "reaction" : "legs",
    budget,
    max: contact ? u.reaction_max : turnSeconds(world),
    walk: gaitSpeed(Gait.Walk, u) * budget,
    run: gaitSpeed(Gait.Run, u) * budget,
    sprint: gaitSpeed(Gait.Sprint, u) * budget,
  };
}

export { turnSeconds, rulesOf, postureTime } from "./rules.js";
export { defaultWorld, worldFromScenario } from "./model.js";
export { loadCatalog, loadCatalogSync, assembleWorld, worldFromCatalog } from "./content.js";
export { silhouetteFor, aimPointOffset, accuracyAngle, resolveAimOffset } from "./combat.js";
export { unitHitboxes, coverBox, muzzleWorld, rayLocalBox, rayCover, partCenterOffset, partFamily, prettyPart } from "./body.js";
export {
  CoverMode, inUseZone, nearestUse, resolveCoverUse, useBounds, COVER_USE_PAD,
} from "./cover.js";
