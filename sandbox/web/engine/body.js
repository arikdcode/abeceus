import { Posture } from "./model.js";
import { COVER_STANDOFF, COVER_POST_CLEAR, CoverMode } from "./cover.js";

const box = (name, x0, x1, y0, y1, z0, z1, extra = {}) => ({
  name, x0, x1, y0, y1, z0, z1, flesh: extra.flesh !== false,
});

export function muzzleHeight(posture) {
  if (posture === Posture.Prone) return 0.18;
  if (posture === Posture.Crouching) return 0.82;
  return 1.22;
}

function postLocal(lip) {
  const gunZ = lip + COVER_POST_CLEAR;
  const head0 = lip + 0.02;
  const head1 = lip + 0.30;
  const torso1 = lip + 0.04;
  const torso0 = Math.max(0.52, lip - 0.44);
  return [
    box("l_leg", -0.22, -0.02, -0.16, 0.14, 0.00, 0.48),
    box("r_leg", 0.02, 0.22, -0.16, 0.14, 0.00, 0.48),
    box("abdomen", -0.20, 0.20, -0.12, 0.14, 0.46, Math.max(0.68, torso0)),
    box("torso", -0.22, 0.22, -0.12, 0.16, torso0, torso1),
    box("head", -0.12, 0.12, -0.10, 0.14, head0, head1),
    box("l_arm", -0.30, -0.10, 0.04, 0.34, torso0 + 0.02, torso1),
    box("r_arm", 0.08, 0.24, 0.06, 0.38, torso0 + 0.02, torso1),
    box("gun", -0.03, 0.03, 0.22, 0.72, gunZ - 0.04, gunZ + 0.05, { flesh: false }),
  ];
}

function hideLocal(lip) {
  const head1 = Math.min(lip - 0.08, 1.05);
  const head0 = Math.max(0.62, head1 - 0.26);
  const torso1 = Math.min(head0 - 0.02, lip - 0.18);
  const torso0 = Math.max(0.50, torso1 - 0.30);
  const gunZ = Math.min(lip - 0.16, 0.88);
  return [
    box("l_leg", -0.22, -0.02, -0.16, 0.14, 0.00, 0.46),
    box("r_leg", 0.02, 0.22, -0.16, 0.14, 0.00, 0.46),
    box("abdomen", -0.20, 0.20, -0.10, 0.16, 0.44, torso0),
    box("torso", -0.20, 0.22, -0.08, 0.18, torso0, torso1),
    box("head", -0.12, 0.12, -0.06, 0.16, head0, head1),
    box("l_arm", -0.28, -0.08, 0.02, 0.28, torso0, torso1),
    box("r_arm", 0.10, 0.32, 0.00, 0.30, torso0, torso1),
    box("gun", 0.26, 0.52, -0.10, 0.28, gunZ - 0.04, gunZ + 0.04, { flesh: false }),
  ];
}

export function localHitboxes(posture, coverUse = null) {
  if (coverUse?.mode === CoverMode.Post && Number.isFinite(coverUse.lip)) return postLocal(coverUse.lip);
  if (coverUse?.mode === CoverMode.Hide && Number.isFinite(coverUse.lip)) return hideLocal(coverUse.lip);
  if (posture === Posture.Prone) {
    return [
      box("l_leg", -0.20, -0.02, -0.88, -0.18, 0.00, 0.14),
      box("r_leg", 0.02, 0.20, -0.88, -0.18, 0.00, 0.14),
      box("abdomen", -0.18, 0.18, -0.20, 0.12, 0.00, 0.16),
      box("torso", -0.22, 0.22, 0.10, 0.52, 0.02, 0.20),
      box("head", -0.11, 0.11, 0.50, 0.78, 0.08, 0.34),
      box("l_arm", -0.34, -0.14, 0.22, 0.62, 0.04, 0.16),
      box("r_arm", 0.14, 0.34, 0.22, 0.62, 0.04, 0.16),
      box("gun", -0.03, 0.03, 0.72, 1.32, 0.12, 0.20, { flesh: false }),
    ];
  }
  if (posture === Posture.Crouching) {
    return [
      box("l_leg", -0.22, -0.02, -0.16, 0.14, 0.00, 0.48),
      box("r_leg", 0.02, 0.22, -0.16, 0.14, 0.00, 0.48),
      box("abdomen", -0.20, 0.20, -0.12, 0.14, 0.46, 0.68),
      box("torso", -0.22, 0.22, -0.12, 0.16, 0.66, 0.96),
      box("head", -0.12, 0.12, -0.10, 0.12, 0.94, 1.22),
      box("l_arm", -0.30, -0.10, 0.04, 0.34, 0.68, 0.98),
      box("r_arm", 0.08, 0.24, 0.06, 0.38, 0.66, 0.96),
      box("gun", -0.03, 0.03, 0.28, 0.88, 0.78, 0.88, { flesh: false }),
    ];
  }
  return [
    box("l_leg", -0.20, 0.00, -0.10, 0.10, 0.00, 0.75),
    box("r_leg", 0.00, 0.20, -0.10, 0.10, 0.00, 0.75),
    box("abdomen", -0.20, 0.20, -0.11, 0.12, 0.75, 1.05),
    box("torso", -0.22, 0.22, -0.12, 0.14, 1.05, 1.50),
    box("head", -0.12, 0.12, -0.10, 0.12, 1.50, 1.80),
    box("l_arm", -0.32, -0.12, 0.02, 0.32, 1.00, 1.42),
    box("r_arm", 0.10, 0.26, 0.04, 0.36, 0.98, 1.38),
    box("gun", -0.03, 0.03, 0.30, 0.92, 1.16, 1.26, { flesh: false }),
  ];
}

export function muzzleWorld(unit) {
  const use = unit.cover_use;
  if (use?.mode === CoverMode.Post && Number.isFinite(use.lip)) {
    const along = COVER_STANDOFF + 0.06;
    const f = unit.facing || 0;
    return {
      x: unit.pos.x + Math.cos(f) * along,
      y: unit.pos.y + Math.sin(f) * along,
      z: use.lip + COVER_POST_CLEAR,
    };
  }
  if (use?.mode === CoverMode.Hide && Number.isFinite(use.lip)) {
    return toWorld({ x: 0.42, y: 0.12, z: Math.min(use.lip - 0.16, 0.88) }, unit.pos, unit.facing || 0);
  }
  const h = muzzleHeight(unit.posture);
  const f = unit.facing || 0;
  const along = unit.posture === Posture.Prone ? 1.20 : 0.88;
  return {
    x: unit.pos.x + Math.cos(f) * along,
    y: unit.pos.y + Math.sin(f) * along,
    z: h,
  };
}

export function toLocal(p, pos, facing) {
  const dx = p.x - pos.x;
  const dy = p.y - pos.y;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return {
    x: dx * s - dy * c,
    y: dx * c + dy * s,
    z: p.z || 0,
  };
}

export function toWorld(p, pos, facing) {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return {
    x: pos.x + p.y * c + p.x * s,
    y: pos.y + p.y * s - p.x * c,
    z: p.z,
  };
}

export function boxCorners(b, pos, facing) {
  const corners = [];
  for (const x of [b.x0, b.x1]) {
    for (const y of [b.y0, b.y1]) {
      for (const z of [b.z0, b.z1]) corners.push(toWorld({ x, y, z }, pos, facing));
    }
  }
  return corners;
}

export function unitHitboxes(unit) {
  return localHitboxes(unit.posture, unit.cover_use).map((b) => ({
    ...b,
    corners: boxCorners(b, unit.pos, unit.facing || 0),
  }));
}

export function coverBox(c) {
  const h = c.height || 1;
  const corners = [];
  for (const x of [c.min.x, c.max.x]) {
    for (const y of [c.min.y, c.max.y]) {
      for (const z of [0, h]) corners.push({ x, y, z });
    }
  }
  return {
    name: "cover",
    flesh: false,
    x0: c.min.x, x1: c.max.x,
    y0: c.min.y, y1: c.max.y,
    z0: 0, z1: h,
    corners,
  };
}

export function rayAabb3(o, d, mn, mx, maxT) {
  let t0 = 0;
  let t1 = maxT;
  for (const ax of ["x", "y", "z"]) {
    const den = Math.abs(d[ax]) < 1e-12 ? (d[ax] < 0 ? -1e-12 : 1e-12) : d[ax];
    let a = (mn[ax] - o[ax]) / den;
    let b = (mx[ax] - o[ax]) / den;
    if (a > b) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t1 < t0) return null;
  }
  return t0 <= maxT ? t0 : null;
}

export function rayLocalBox(origin, dir, box, pos, facing, maxT) {
  const o = toLocal(origin, pos, facing);
  const d = toLocal({ x: origin.x + dir.x, y: origin.y + dir.y, z: (origin.z || 0) + dir.z }, pos, facing);
  d.x -= o.x;
  d.y -= o.y;
  d.z -= o.z;
  return rayAabb3(o, d, { x: box.x0, y: box.y0, z: box.z0 }, { x: box.x1, y: box.y1, z: box.z1 }, maxT);
}

export function rayCover(origin, dir, cover, maxT) {
  return rayAabb3(
    origin,
    dir,
    { x: cover.min.x, y: cover.min.y, z: 0 },
    { x: cover.max.x, y: cover.max.y, z: cover.height || 1 },
    maxT,
  );
}

export function projectBoxesToView(attacker, target, boxes) {
  const dx = target.pos.x - attacker.pos.x;
  const dy = target.pos.y - attacker.pos.y;
  const dist = Math.max(0.15, Math.hypot(dx, dy));
  const alongX = dx / dist;
  const alongY = dy / dist;
  const perpX = alongY;
  const perpY = -alongX;
  return boxes.filter((b) => b.flesh !== false).map((b) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of b.corners) {
      const lat = (p.x - target.pos.x) * perpX + (p.y - target.pos.y) * perpY;
      x0 = Math.min(x0, lat);
      x1 = Math.max(x1, lat);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    return { name: b.name, x0, x1, z0, z1 };
  });
}

function boxesCenterOffset(names, posture, attacker, target) {
  const picked = localHitboxes(posture).filter((b) => names.includes(b.name));
  if (!picked.length) return { x: 0, z: 1.15 };
  if (!attacker || !target) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of picked) {
      x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1);
      z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1);
    }
    return { x: (x0 + x1) * 0.5, z: (z0 + z1) * 0.5 };
  }
  const projected = projectBoxesToView(attacker, target, picked.map((b) => ({
    ...b,
    corners: boxCorners(b, target.pos, target.facing || 0),
  })));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of projected) {
    x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1);
    z0 = Math.min(z0, r.z0); z1 = Math.max(z1, r.z1);
  }
  return { x: (x0 + x1) * 0.5, z: (z0 + z1) * 0.5 };
}

export function regionCenterOffset(aim, posture, attacker, target) {
  const want = aim === "head" ? ["head"]
    : aim === "legs" ? ["l_leg", "r_leg"]
    : ["torso", "abdomen"];
  return boxesCenterOffset(want, posture, attacker, target);
}

export function partCenterOffset(part, posture, attacker, target) {
  if (!part || part === "gun") return regionCenterOffset("torso", posture, attacker, target);
  return boxesCenterOffset([part], posture, attacker, target);
}
