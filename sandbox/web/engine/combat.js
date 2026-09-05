import {
  add, sub, scale, length, normalize, rotate, angleOf, clampToAabb, pointInAabb, rayAabb, rayEllipse,
} from "./vec.js";
import { emptyChannels, unitAlive, Posture, Gait, ShotMode, AimRegion } from "./model.js";

const PERSON_R = 0.28;
const CLEAR = 0.12;

function blocked(map, p) {
  const insetMin = add(map.min, { x: PERSON_R, y: PERSON_R });
  const insetMax = sub(map.max, { x: PERSON_R, y: PERSON_R });
  if (!pointInAabb(p, insetMin, insetMax)) return true;
  for (const c of map.cover) {
    if (c.durability <= 0) continue;
    const mn = sub(c.min, { x: CLEAR, y: CLEAR });
    const mx = add(c.max, { x: CLEAR, y: CLEAR });
    if (pointInAabb(p, mn, mx)) return true;
  }
  return false;
}

function slide(map, from, to) {
  const delta = sub(to, from);
  const dist = length(delta);
  if (dist < 1e-5) return { ...from };
  const dir = scale(delta, 1 / dist);
  const steps = Math.max(8, Math.floor(dist / 0.06));
  let last = { ...from };
  for (let i = 1; i <= steps; i++) {
    const p = add(from, scale(dir, (dist * i) / steps));
    if (blocked(map, p)) break;
    last = p;
  }
  return last;
}

export function finalizeUnit(u) {
  let init = Math.round(u.initiative_base + u.loadout_init);
  if (init < 1) init = 1;
  if (init > 6) init = 6;
  u.initiative = init;
  u.reaction_max = 1 + u.awareness * 0.55 + u.experience * 1.6;
  u.reaction_left = u.reaction_max;
  u.pain_tolerance = 38 + u.endurance * 12 + u.experience * 22;
  u.stress_tolerance = 28 + u.experience * 48 + u.endurance * 6;
  if (!u.armor.length) {
    u.armor.push({ name: "chest plate", region: "torso", protection: 18, durability: 7, durability_max: 7 });
    u.armor.push({ name: "abdomen panel", region: "abdomen", protection: 12, durability: 5, durability_max: 5 });
  }
  if (u.mag_size <= 0) u.mag_size = 8;
  if (u.mag <= 0) u.mag = u.mag_size;
  resetChannels(u);
}

export function resetChannels(u) {
  u.ch = emptyChannels();
  u.tape = { hands: [], legs: [], focus: [], voice: [] };
}

export function silhouetteScaleZ(p) {
  if (p === Posture.Crouching) return 0.62;
  if (p === Posture.Prone) return 0.22;
  return 1;
}

export function silhouetteScaleX(p) {
  if (p === Posture.Prone) return 1.45;
  if (p === Posture.Crouching) return 1.08;
  return 1;
}

export function silhouetteFor(p) {
  const sz = silhouetteScaleZ(p);
  const sx = silhouetteScaleX(p);
  if (p === Posture.Prone) {
    return [
      { name: "head", x0: -0.14, x1: 0.14, z0: 0.18, z1: 0.40 },
      { name: "torso", x0: -0.28, x1: 0.28, z0: 0.06, z1: 0.22 },
      { name: "abdomen", x0: -0.22, x1: 0.22, z0: 0.00, z1: 0.08 },
    ];
  }
  return [
    { name: "head", x0: -0.12 * sx, x1: 0.12 * sx, z0: 1.50 * sz, z1: 1.80 * sz },
    { name: "torso", x0: -0.22 * sx, x1: 0.22 * sx, z0: 1.05 * sz, z1: 1.50 * sz },
    { name: "abdomen", x0: -0.20 * sx, x1: 0.20 * sx, z0: 0.75 * sz, z1: 1.05 * sz },
    { name: "l_arm", x0: -0.38 * sx, x1: -0.22 * sx, z0: 0.75 * sz, z1: 1.50 * sz },
    { name: "r_arm", x0: 0.22 * sx, x1: 0.38 * sx, z0: 0.75 * sz, z1: 1.50 * sz },
    { name: "l_leg", x0: -0.20 * sx, x1: 0.0 * sx, z0: 0.0, z1: 0.75 * sz },
    { name: "r_leg", x0: 0.0, x1: 0.20 * sx, z0: 0.0, z1: 0.75 * sz },
  ];
}

export function aimRegionRects(posture, aim) {
  const sil = silhouetteFor(posture);
  if (aim === AimRegion.Head) return sil.filter((s) => s.name === "head");
  if (aim === AimRegion.Legs) return sil.filter((s) => s.name === "l_leg" || s.name === "r_leg");
  return sil.filter((s) => s.name === "torso" || s.name === "abdomen");
}

export function resolveAimOffset(aim, posture, override) {
  const z = override?.z ?? override?.y;
  if (override && Number.isFinite(override.x) && Number.isFinite(z)) {
    return { x: override.x, z };
  }
  const rects = aimRegionRects(posture, aim);
  if (!rects.length) return { x: 0, z: 1.15 * silhouetteScaleZ(posture) };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1);
    z0 = Math.min(z0, r.z0); z1 = Math.max(z1, r.z1);
  }
  return { x: (x0 + x1) * 0.5, z: (z0 + z1) * 0.5 };
}

export function aimPointOffset(aim, p, override) {
  const off = resolveAimOffset(aim, p, override);
  return { x: off.x, y: off.z };
}

export function shotFrame(attacker, target) {
  const delta = sub(target.pos, attacker.pos);
  const dist = Math.max(0.15, length(delta));
  const along = scale(delta, 1 / dist);
  const perp = rotate(along, -1.5707963);
  return { dist, along, perp };
}

export function worldAimPoint(attacker, target, aimOff) {
  const { perp } = shotFrame(attacker, target);
  return add(target.pos, scale(perp, aimOff.x || 0));
}

export function accuracyRadius(attacker, mode, dist, lastGait) {
  const acc = accuracyAngle(attacker, mode, lastGait);
  return { acc, radius: Math.max(0.02, dist * Math.tan(acc)) };
}

export function sampleDiskOffset(rng, radius) {
  const r = radius * Math.sqrt(rng.uniform());
  const th = rng.uniform() * Math.PI * 2;
  return { x: r * Math.cos(th), z: r * Math.sin(th) };
}

export function coverHeightAt(world, attacker, target, lat) {
  const { perp, dist } = shotFrame(attacker, target);
  const through = add(target.pos, scale(perp, lat));
  const shotDir = normalize(sub(through, attacker.pos));
  let h = 0;
  for (const c of world.map.cover) {
    if (c.durability <= 0) continue;
    const t = rayAabb(attacker.pos, shotDir, c.min, c.max, dist + 0.15);
    if (t != null && t < dist + 0.15) h = Math.max(h, c.height);
  }
  return h;
}

export function coverProfile(world, attacker, target, x0, x1, steps = 28) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (x1 - x0) * (i / steps);
    pts.push({ x, z: coverHeightAt(world, attacker, target, x) });
  }
  return pts;
}

export function movementConeMult(g) {
  if (g === Gait.Run) return 1.65;
  if (g === Gait.Sprint) return 3.2;
  return 1;
}

export function accuracyAngle(attacker, mode, lastGait) {
  let a = attacker.weapon_spread;
  const skill = 0.55 + attacker.firearms * 0.28;
  a /= skill;
  if (mode === ShotMode.Precise || mode === ShotMode.Aimed) a *= 0.5;
  if (mode === ShotMode.Burst) a *= 1.35;
  a *= movementConeMult(lastGait);
  if (attacker.posture === Posture.Prone) a *= 0.85;
  if (attacker.posture === Posture.Crouching) a *= 0.92;
  const painRatio = attacker.pain / Math.max(20, attacker.pain_tolerance);
  if (painRatio > 1) a *= 1 + (painRatio - 1) * 0.6;
  else if (painRatio > 0.7) a *= 1.15;
  if (attacker.blood > 50) a *= 1.12;
  if (attacker.blood > 70) a *= 1.2;
  if (attacker.stress > attacker.stress_tolerance) a *= 1.25;
  if (!attacker.weapon_ready) a *= 1.8;
  return a;
}

export function gaitSpeed(g, u) {
  let base = 1.25;
  if (g === Gait.Run) base = 2.15;
  if (g === Gait.Sprint) base = 3.4;
  if (u.posture === Posture.Crouching) base *= 0.7;
  if (u.posture === Posture.Prone) base *= 0.35;
  for (const w of u.wounds) {
    if ((w.impairment || "").includes("leg") || (w.impairment || "").includes("limp")) base *= 0.65;
  }
  if (u.blood > 50) base *= 0.75;
  if (u.pain > u.pain_tolerance) base *= 0.7;
  return base;
}

export function gaitLegTime(dist, g, u) {
  return dist / Math.max(0.15, gaitSpeed(g, u));
}

export function channelStretch(u) {
  let stretch = 1;
  if (u.pain >= u.pain_tolerance) stretch += 0.25;
  if (u.blood > 50) stretch += 0.15;
  return stretch;
}

export function spendChannels(u, hands, legs, focus, voice) {
  const stretch = channelStretch(u);
  hands *= stretch;
  focus *= stretch;
  if (u.ch.hands + 1e-4 < hands) return "not enough Hands time";
  if (u.ch.legs + 1e-4 < legs) return "not enough Legs time";
  if (u.ch.focus + 1e-4 < focus) return "not enough Focus time";
  if (u.ch.voice + 1e-4 < voice) return "not enough Voice time";
  u.ch.hands -= hands;
  u.ch.legs -= legs;
  u.ch.focus -= focus;
  u.ch.voice -= voice;
  return null;
}

export function canSpend(u, hands, legs, focus, voice) {
  const tmp = {
    ...u,
    ch: { ...u.ch },
    wounds: u.wounds,
  };
  return !spendChannels(tmp, hands, legs, focus, voice);
}

function coverBlocksHeight(c, origin, dir, maxT, height) {
  if (c.durability <= 0) return null;
  if (height >= c.height - 0.02) return null;
  return rayAabb(origin, dir, c.min, c.max, maxT);
}

function regionOf(sil, x, z) {
  for (const s of sil) {
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s.name;
  }
  return null;
}

export function resolveConeSample(world, attacker, target, mode, aim, dLat, dH, _accRad, aimOffset) {
  const out = {
    hit_unit: false,
    hit_cover: false,
    unit: 0,
    cover_index: -1,
    point: { x: 0, y: 0 },
    shot_dir: { x: 1, y: 0 },
    t: 0,
    height: 1.1,
    lateral: 0,
    region: "miss",
    remaining_pen: 0,
    armor: "",
    armor_result: "",
  };
  const { dist, perp } = shotFrame(attacker, target);
  const aimOff = resolveAimOffset(aim, target.posture, aimOffset);
  const lat = aimOff.x + (dLat || 0);
  const height = aimOff.z + (dH || 0);
  out.lateral = lat;
  out.height = height;
  const through = add(target.pos, scale(perp, lat));
  const shotDir = normalize(sub(through, attacker.pos));
  out.shot_dir = shotDir;
  out.point = through;
  const maxT = attacker.max_range;

  let bestT = maxT + 1;
  for (let i = 0; i < world.map.cover.length; i++) {
    const t = coverBlocksHeight(world.map.cover[i], attacker.pos, shotDir, maxT, height);
    if (t != null && t < bestT && t < dist + 0.15) {
      bestT = t;
      out.hit_cover = true;
      out.cover_index = i;
      out.point = add(attacker.pos, scale(shotDir, t));
      out.t = t;
      out.region = "cover";
    }
  }
  if (out.hit_cover) return out;

  const sil = silhouetteFor(target.posture);
  const reg = regionOf(sil, lat, height);
  if (reg) {
    out.hit_unit = true;
    out.unit = target.id;
    out.region = reg;
    out.t = dist;
    out.point = add(target.pos, scale(perp, lat));
    return out;
  }

  for (const u of world.units) {
    if (u.id === attacker.id || u.id === target.id || !unitAlive(u)) continue;
    const t = rayEllipse(attacker.pos, shotDir, u.pos, u.facing, u.sil_w * 0.5, u.sil_d * 0.5, maxT);
    if (t != null && t < bestT && t > 0.2) {
      bestT = t;
      out.hit_unit = true;
      out.unit = u.id;
      out.t = t;
      out.point = add(attacker.pos, scale(shotDir, t));
      out.region = "torso";
    }
  }
  if (!out.hit_unit) {
    out.t = maxT;
    out.point = add(attacker.pos, scale(shotDir, maxT));
    out.region = "miss";
  }
  return out;
}

function eachDiskSample(radius, fn) {
  fn(0, 0);
  const rings = 6;
  const spokes = 16;
  for (let r = 1; r <= rings; r++) {
    const rad = radius * Math.sqrt(r / rings);
    for (let k = 0; k < spokes; k++) {
      const th = ((k + 0.5) / spokes) * Math.PI * 2;
      fn(rad * Math.cos(th), rad * Math.sin(th));
    }
  }
}

export function previewDisk(world, attacker, target, mode, aim, aimOffset) {
  const { dist, perp } = shotFrame(attacker, target);
  const { acc, radius } = accuracyRadius(attacker, mode, dist, attacker.last_gait);
  const aimOff = resolveAimOffset(aim, target.posture, aimOffset);
  const aimWorld = add(target.pos, scale(perp, aimOff.x));
  const shotDir = normalize(sub(aimWorld, attacker.pos));
  const sil = silhouetteFor(target.posture);
  let hits = 0;
  let covers = 0;
  let n = 0;
  eachDiskSample(radius, (dLat, dH) => {
    const s = resolveConeSample(world, attacker, target, mode, aim, dLat, dH, acc, aimOff);
    n += 1;
    if (s.hit_cover) covers += 1;
    else if (s.hit_unit && s.unit === target.id) hits += 1;
  });
  const xs = sil.flatMap((r) => [r.x0, r.x1]);
  return {
    ok: dist >= 0.2,
    actor: attacker.id,
    target: target.id,
    distance: dist,
    cone_half_rad: acc,
    radius,
    sigma: radius,
    p_hit: n ? hits / n : 0,
    p_cover: n ? covers / n : 0,
    origin: { ...attacker.pos },
    aim_dir: shotDir,
    aim_world: aimWorld,
    aim_offset: aimOff,
    silhouette: sil,
    cover_profile: coverProfile(world, attacker, target, Math.min(...xs) - 0.05, Math.max(...xs) + 0.05),
  };
}

export function bestAimOffset(world, attacker, target, mode, aim) {
  const rects = aimRegionRects(target.posture, aim);
  const fallback = resolveAimOffset(aim, target.posture);
  if (!rects.length) return fallback;
  let best = fallback;
  let bestP = -1;
  const steps = 4;
  for (const r of rects) {
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const off = {
          x: r.x0 + (r.x1 - r.x0) * ((i + 0.5) / steps),
          z: r.z0 + (r.z1 - r.z0) * ((j + 0.5) / steps),
        };
        const prev = previewDisk(world, attacker, target, mode, aim, off);
        if (prev.p_hit > bestP + 1e-6 || (Math.abs(prev.p_hit - bestP) <= 1e-6 && prev.p_cover < (best._cover ?? 1))) {
          bestP = prev.p_hit;
          best = { ...off, _cover: prev.p_cover };
        }
      }
    }
  }
  return { x: best.x, z: best.z };
}

export function applyCoverHit(cover, weaponPen) {
  let dmg = 1;
  if (weaponPen > cover.protection) dmg = 2.2;
  cover.durability = Math.max(0, cover.durability - dmg);
}

export function applyArmorHit(victim, sample, weaponPen) {
  sample.remaining_pen = weaponPen;
  const plate = victim.armor.find((p) =>
    p.region === sample.region ||
    (p.region === "arm" && (sample.region === "l_arm" || sample.region === "r_arm")) ||
    (p.region === "leg" && (sample.region === "l_leg" || sample.region === "r_leg"))
  );
  if (!plate || plate.durability <= 0) {
    sample.armor_result = "unarmored";
    return;
  }
  sample.armor = plate.name;
  const prot = plate.protection * (plate.durability / Math.max(1, plate.durability_max));
  if (weaponPen > prot * 1.25) {
    sample.armor_result = "full_pen";
    sample.remaining_pen = weaponPen - prot * 0.25;
    plate.durability = Math.max(0, plate.durability - 2.4);
  } else if (weaponPen > prot) {
    sample.armor_result = "pen";
    sample.remaining_pen = (weaponPen - prot) + prot * 0.35;
    plate.durability = Math.max(0, plate.durability - 1.8);
  } else if (weaponPen > prot * 0.75) {
    sample.armor_result = "partial";
    sample.remaining_pen = weaponPen * 0.35;
    plate.durability = Math.max(0, plate.durability - 1.2);
  } else if (weaponPen > prot * 0.4) {
    sample.armor_result = "stopped";
    sample.remaining_pen = 0;
    plate.durability = Math.max(0, plate.durability - 0.7);
  } else {
    sample.armor_result = "deflected";
    sample.remaining_pen = 0;
    plate.durability = Math.max(0, plate.durability - 0.2);
  }
}

export function generateWound(victim, sample) {
  const r = { wound: { region: sample.region, description: "", depth: 0, bleed_rate: 0, pain: 0, stress: 0, treated: false, impairment: "" }, incapacitate: false, kill: false };
  const w = r.wound;
  const pen = sample.remaining_pen;
  if (pen <= 0.01) {
    w.description = `stopped by armor — bruise (${sample.region})`;
    w.pain = 6;
    w.stress = 3;
    return r;
  }
  let depth = 0;
  if (pen > 6) depth = 1;
  if (pen > 12) depth = 2;
  if (pen > 20) depth = 3;
  if (sample.region === "head" && pen > 10) depth = 3;
  w.depth = depth;
  const depthN = ["graze", "shallow", "deep", "critical"];
  w.description = `${depthN[depth]} kinetic hit to ${sample.region}`;
  if (sample.armor_result && sample.armor_result !== "unarmored") w.description += ` (${sample.armor_result})`;
  if (depth === 0) {
    w.pain = 12; w.stress = 6; w.bleed_rate = 0.6;
  } else if (depth === 1) {
    w.pain = 24; w.stress = 10; w.bleed_rate = 2.2;
    if (sample.region.includes("leg")) w.impairment = "limp";
    if (sample.region.includes("arm")) w.impairment = "arm";
  } else if (depth === 2) {
    w.pain = 42; w.stress = 16; w.bleed_rate = 5.5;
    if (sample.region.includes("leg")) w.impairment = "limp";
    if (sample.region.includes("arm")) w.impairment = "arm";
  } else {
    w.pain = 80; w.stress = 28; w.bleed_rate = 14;
    if (sample.region === "head" || sample.region === "torso") {
      r.incapacitate = true;
      if (pen > 24) r.kill = true;
      w.impairment = "vital";
    }
  }
  return r;
}

export function pathMove(map, from, to) {
  const direct = slide(map, from, to);
  if (length(sub(direct, to)) < 0.15) return direct;

  const pts = [from, to];
  const off = PERSON_R + CLEAR + 0.08;
  for (const c of map.cover) {
    if (c.durability <= 0) continue;
    const corners = [
      { x: c.min.x - off, y: c.min.y - off },
      { x: c.min.x - off, y: c.max.y + off },
      { x: c.max.x + off, y: c.min.y - off },
      { x: c.max.x + off, y: c.max.y + off },
    ];
    for (const q of corners) if (!blocked(map, q)) pts.push(q);
  }

  const reachable = (a, b) => length(sub(slide(map, a, b), b)) < 0.2;
  const n = pts.length;
  const dist = Array(n).fill(1e30);
  const prev = Array(n).fill(-1);
  dist[0] = 0;
  const pq = [[0, 0]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, i] = pq.shift();
    if (d > dist[i] + 1e-5) continue;
    for (let j = 0; j < n; j++) {
      if (j === i || !reachable(pts[i], pts[j])) continue;
      const nd = d + length(sub(pts[j], pts[i]));
      if (nd + 1e-4 < dist[j]) {
        dist[j] = nd;
        prev[j] = i;
        pq.push([nd, j]);
      }
    }
  }
  if (prev[1] < 0) return direct;
  let cur = 1;
  while (prev[cur] !== 0 && prev[cur] !== -1) cur = prev[cur];
  return slide(map, from, pts[cur]);
}

export function los2d(map, a, b) {
  const d = sub(b, a);
  const dist = length(d);
  if (dist < 1e-4) return true;
  const dir = scale(d, 1 / dist);
  for (const c of map.cover) {
    if (c.durability <= 0) continue;
    const t = rayAabb(a, dir, c.min, c.max, dist - 0.05);
    if (t != null && t > 0.05) return false;
  }
  return true;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
