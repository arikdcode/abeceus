import { Posture } from "./model.js";
import { COVER_STANDOFF, COVER_POST_CLEAR, CoverMode } from "./cover.js";

function part(name, hx, hy, hz, origin, rot = {}, extra = {}) {
  return {
    name,
    hx, hy, hz,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    rx: rot.rx || 0, ry: rot.ry || 0, rz: rot.rz || 0,
    flesh: extra.flesh !== false,
    armor: !!extra.armor,
    plate: extra.plate || null,
    covers: extra.covers || null,
    kind: extra.kind || (extra.armor ? "armor" : extra.flesh === false ? "gear" : "flesh"),
  };
}

function rotApply(p, rx, ry, rz) {
  let { x, y, z } = p;
  let c = Math.cos(rx), s = Math.sin(rx);
  let ny = y * c - z * s, nz = y * s + z * c;
  y = ny; z = nz;
  c = Math.cos(ry); s = Math.sin(ry);
  let nx = x * c + z * s;
  nz = -x * s + z * c;
  x = nx; z = nz;
  c = Math.cos(rz); s = Math.sin(rz);
  nx = x * c - y * s;
  ny = x * s + y * c;
  return { x: nx, y: ny, z };
}

function rotApplyInv(p, rx, ry, rz) {
  let { x, y, z } = p;
  let c = Math.cos(-rz), s = Math.sin(-rz);
  let nx = x * c - y * s, ny = x * s + y * c;
  x = nx; y = ny;
  c = Math.cos(-ry); s = Math.sin(-ry);
  nx = x * c + z * s;
  let nz = -x * s + z * c;
  x = nx; z = nz;
  c = Math.cos(-rx); s = Math.sin(-rx);
  ny = y * c - z * s; nz = y * s + z * c;
  return { x, y: ny, z: nz };
}

function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale3(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function mid3(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
}
function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function norm3(a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
function cross3(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function along3(a, b, t) {
  return add3(a, scale3(sub3(b, a), t));
}

function orientZ(dx, dy, dz) {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  return {
    rx: Math.atan2(-dy, Math.hypot(dx, dz)),
    ry: Math.atan2(dx, dz),
    rz: 0,
  };
}

function bone(name, a, b, rad, extra = {}) {
  const d = sub3(b, a);
  const half = Math.max(0.01, Math.hypot(d.x, d.y, d.z) * 0.5);
  return part(name, rad, rad, half, mid3(a, b), orientZ(d.x, d.y, d.z), extra);
}

function flatFoot(name, heel, toe) {
  const dx = toe.x - heel.x;
  const dy = toe.y - heel.y;
  const halfLen = Math.max(0.05, Math.hypot(dx, dy) * 0.5);
  return part(name, 0.038, halfLen, 0.022, {
    x: (heel.x + toe.x) * 0.5,
    y: (heel.y + toe.y) * 0.5,
    z: 0.028,
  }, { rx: 0, ry: 0, rz: Math.atan2(-dx, dy) });
}

function ball(name, p, rad, extra = {}) {
  return part(name, rad, rad, rad * 0.88, p, {}, extra);
}

function attach(name, host, local, hx, hy, hz, extra = {}) {
  const off = rotApply(local, host.rx || 0, host.ry || 0, host.rz || 0);
  return part(name, hx, hy, hz, add3(host.origin, off), { rx: host.rx, ry: host.ry, rz: host.rz }, extra);
}

function foldElbow(shoulder, wrist, hint, upper = 0.30, lower = 0.25) {
  const span = sub3(wrist, shoulder);
  const d = Math.hypot(span.x, span.y, span.z) || 0.01;
  const clamped = Math.min(upper + lower - 0.02, Math.max(Math.abs(upper - lower) + 0.02, d));
  const t = (upper * upper - lower * lower + clamped * clamped) / (2 * clamped);
  const h = Math.sqrt(Math.max(0, upper * upper - t * t));
  const axis = norm3(span);
  const mid = add3(shoulder, scale3(axis, t * (clamped / d)));
  let side = sub3(hint, mid);
  const along = axis.x * side.x + axis.y * side.y + axis.z * side.z;
  side = { x: side.x - axis.x * along, y: side.y - axis.y * along, z: side.z - axis.z * along };
  if (Math.hypot(side.x, side.y, side.z) < 0.04) side = { x: 0, y: 0, z: -1 };
  return add3(mid, scale3(norm3(side), h));
}

function addHand(out, prefix, wrist, forward, extra = {}) {
  const f = norm3(forward);
  const palm = add3(wrist, scale3(f, 0.045));
  out.push(bone(`${prefix}palm`, wrist, add3(palm, scale3(f, 0.04)), 0.028, extra));
  let right = cross3(f, { x: 0, y: 0, z: 1 });
  if (Math.hypot(right.x, right.y, right.z) < 0.12) right = cross3(f, { x: 1, y: 0, z: 0 });
  right = norm3(right);
  const up = norm3(cross3(right, f));
  const digits = [
    ["thumb", -0.95, 0.05, 0.055],
    ["index", -0.50, 1.00, 0.072],
    ["middle", -0.08, 1.08, 0.078],
    ["ring", 0.32, 0.98, 0.070],
    ["pinky", 0.68, 0.82, 0.058],
  ];
  for (const [n, across, along, len] of digits) {
    const base = add3(add3(palm, scale3(right, across * 0.034)), add3(scale3(f, along * 0.028), scale3(up, 0.006)));
    const tip = add3(base, scale3(n === "thumb" ? add3(f, scale3(right, -0.55)) : f, len));
    const knuckle = along3(base, tip, 0.52);
    out.push(bone(`${prefix}${n}_prox`, base, knuckle, 0.007, extra));
    out.push(bone(`${prefix}${n}_dist`, knuckle, tip, 0.006, extra));
  }
}

function assemble(j) {
  const p = [];
  const look = j.look || { x: 0, y: 1, z: 0 };
  if (j.proneFeet) {
    p.push(bone("l_foot", j.l_heel, j.l_toe, 0.036));
    p.push(bone("r_foot", j.r_heel, j.r_toe, 0.036));
  } else {
    p.push(flatFoot("l_foot", j.l_heel, j.l_toe));
    p.push(flatFoot("r_foot", j.r_heel, j.r_toe));
  }
  p.push(ball("l_ankle", j.l_ankle, 0.034));
  p.push(ball("r_ankle", j.r_ankle, 0.034));
  p.push(bone("l_shin", j.l_knee, j.l_ankle, 0.044));
  p.push(bone("r_shin", j.r_knee, j.r_ankle, 0.044));
  p.push(ball("l_knee", j.l_knee, 0.046));
  p.push(ball("r_knee", j.r_knee, 0.046));
  p.push(bone("l_thigh", j.l_hip, j.l_knee, 0.054));
  p.push(bone("r_thigh", j.r_hip, j.r_knee, 0.054));
  p.push(ball("l_hip", j.l_hip, 0.048));
  p.push(ball("r_hip", j.r_hip, 0.048));
  p.push(part("pelvis", 0.12, 0.085, 0.07, j.pelvis, orientZ(j.abdomen.x - j.pelvis.x, j.abdomen.y - j.pelvis.y, j.abdomen.z - j.pelvis.z)));
  p.push(part("abdomen", 0.10, 0.068, 0.09, j.abdomen, orientZ(j.chest.x - j.pelvis.x, j.chest.y - j.pelvis.y, j.chest.z - j.pelvis.z)));
  p.push(part("chest", 0.19, 0.105, 0.13, j.chest, orientZ(j.neck.x - j.abdomen.x, j.neck.y - j.abdomen.y, j.neck.z - j.abdomen.z)));
  p.push(bone("l_clavicle", add3(j.chest, { x: 0, y: 0.02, z: 0.10 }), j.l_shoulder, 0.022));
  p.push(bone("r_clavicle", add3(j.chest, { x: 0, y: 0.02, z: 0.10 }), j.r_shoulder, 0.022));
  p.push(ball("neck", j.neck, 0.042));
  addHead(p, j.skull, look);
  p.push(ball("l_shoulder", j.l_shoulder, 0.055));
  p.push(ball("r_shoulder", j.r_shoulder, 0.055));
  p.push(bone("l_upper_arm", j.l_shoulder, j.l_elbow, 0.042));
  p.push(bone("r_upper_arm", j.r_shoulder, j.r_elbow, 0.042));
  p.push(ball("l_elbow", j.l_elbow, 0.036));
  p.push(ball("r_elbow", j.r_elbow, 0.036));
  p.push(bone("l_forearm", j.l_elbow, j.l_wrist, 0.034));
  p.push(bone("r_forearm", j.r_elbow, j.r_wrist, 0.034));
  p.push(ball("l_wrist", j.l_wrist, 0.024));
  p.push(ball("r_wrist", j.r_wrist, 0.024));
  addHand(p, "l_", j.l_wrist, j.l_hand || look);
  addHand(p, "r_", j.r_wrist, j.r_hand || look);
  addRifle(p, j.stock, j.muzzle);
  return p;
}

function addHead(out, skull, look) {
  const horiz = Math.hypot(look.x, look.y) || 1;
  const rot = {
    rx: Math.atan2(look.z || 0, horiz),
    ry: 0,
    rz: Math.atan2(-look.x, look.y),
  };
  const head = part("skull", 0.09, 0.09, 0.09, skull, rot);
  out.push(head);
  const faceY = 0.09 + 0.022;
  out.push(attach("face", head, { x: 0, y: faceY, z: -0.004 }, 0.064, 0.022, 0.056));
  const eyeY = faceY + 0.022 + 0.016;
  out.push(attach("l_eye", head, { x: -0.028, y: eyeY, z: 0.016 }, 0.016, 0.010, 0.012));
  out.push(attach("r_eye", head, { x: 0.028, y: eyeY, z: 0.016 }, 0.016, 0.010, 0.012));
}

function addRifle(out, stock, muzzle) {
  const extra = { flesh: false };
  const axis = norm3(sub3(muzzle, stock));
  const along = axis.z * -1;
  let down = { x: -axis.x * along, y: -axis.y * along, z: -1 - axis.z * along };
  if (Math.hypot(down.x, down.y, down.z) < 0.15) down = { x: 0, y: -1, z: 0 };
  down = norm3(down);
  const stockEnd = along3(stock, muzzle, 0.20);
  const rec0 = along3(stock, muzzle, 0.18);
  const rec1 = along3(stock, muzzle, 0.40);
  const hg0 = along3(stock, muzzle, 0.38);
  const hg1 = along3(stock, muzzle, 0.64);
  const br0 = along3(stock, muzzle, 0.62);
  const grip = add3(along3(stock, muzzle, 0.22), scale3(down, 0.12));
  const mag = add3(along3(stock, muzzle, 0.33), scale3(down, 0.14));
  const rs = add3(along3(stock, muzzle, 0.30), scale3(down, -0.045));
  const fs = add3(along3(stock, muzzle, 0.86), scale3(down, -0.042));
  out.push(bone("gun_stock", stock, stockEnd, 0.036, extra));
  out.push(bone("gun_receiver", rec0, rec1, 0.028, extra));
  out.push(bone("gun_grip", along3(stock, muzzle, 0.21), grip, 0.018, extra));
  out.push(bone("gun_mag", along3(stock, muzzle, 0.33), mag, 0.018, extra));
  out.push(bone("gun_handguard", hg0, hg1, 0.024, extra));
  out.push(bone("gun", br0, muzzle, 0.012, extra));
  out.push(bone("gun_rsight", along3(stock, muzzle, 0.30), rs, 0.009, extra));
  out.push(bone("gun_fsight", along3(stock, muzzle, 0.86), fs, 0.008, extra));
}

function rifleJoints(base, stock, muzzle, opt = {}) {
  const barrel = sub3(muzzle, stock);
  const axis = norm3(barrel);
  const rWrist = add3(along3(stock, muzzle, opt.rAlong || 0.19), { x: 0.02, y: 0, z: opt.rDrop ?? -0.055 });
  const lWrist = add3(along3(stock, muzzle, opt.lAlong || 0.40), { x: -0.02, y: 0, z: opt.lDrop ?? -0.02 });
  const rHint = add3(mid3(base.r_shoulder, rWrist), opt.rHint || { x: 0.05, y: -0.08, z: -0.24 });
  const lHint = add3(mid3(base.l_shoulder, lWrist), opt.lHint || { x: -0.05, y: 0.02, z: -0.26 });
  let rElbow = foldElbow(base.r_shoulder, rWrist, rHint);
  let lElbow = foldElbow(base.l_shoulder, lWrist, lHint);
  if (opt.elbowMinZ != null) {
    rElbow = { ...rElbow, z: Math.max(rElbow.z, opt.elbowMinZ) };
    lElbow = { ...lElbow, z: Math.max(lElbow.z, opt.elbowMinZ) };
  }
  return {
    ...base,
    stock,
    muzzle,
    r_wrist: rWrist,
    l_wrist: lWrist,
    r_elbow: rElbow,
    l_elbow: lElbow,
    l_hand: axis,
    r_hand: axis,
    look: { x: axis.x, y: axis.y, z: 0 },
  };
}

function aimLook() {
  return { x: 0.28, y: 1, z: -0.08 };
}

function standJoints() {
  const hips = {
    l_heel: { x: -0.13, y: 0.18, z: 0.03 },
    l_toe: { x: -0.14, y: 0.40, z: 0.025 },
    l_ankle: { x: -0.13, y: 0.22, z: 0.09 },
    l_knee: { x: -0.12, y: 0.17, z: 0.50 },
    l_hip: { x: -0.12, y: 0.01, z: 0.93 },
    r_heel: { x: 0.14, y: -0.22, z: 0.03 },
    r_toe: { x: 0.16, y: 0.00, z: 0.025 },
    r_ankle: { x: 0.14, y: -0.16, z: 0.09 },
    r_knee: { x: 0.12, y: -0.08, z: 0.50 },
    r_hip: { x: 0.12, y: -0.04, z: 0.93 },
    pelvis: { x: 0.00, y: -0.02, z: 0.96 },
    abdomen: { x: 0.00, y: 0.02, z: 1.14 },
    chest: { x: 0.01, y: 0.05, z: 1.36 },
    neck: { x: 0.03, y: 0.08, z: 1.54 },
    skull: { x: 0.01, y: 0.12, z: 1.66 },
    l_shoulder: { x: -0.20, y: 0.06, z: 1.45 },
    r_shoulder: { x: 0.20, y: 0.04, z: 1.44 },
  };
  return { ...rifleJoints(hips, { x: 0.13, y: 0.12, z: 1.47 }, { x: 0.09, y: 0.88, z: 1.45 }), look: aimLook() };
}

function crouchJoints() {
  const hips = {
    l_heel: { x: -0.16, y: 0.16, z: 0.03 },
    l_toe: { x: -0.17, y: 0.40, z: 0.025 },
    l_ankle: { x: -0.16, y: 0.20, z: 0.09 },
    l_knee: { x: -0.14, y: 0.34, z: 0.40 },
    l_hip: { x: -0.12, y: -0.08, z: 0.58 },
    r_heel: { x: 0.16, y: -0.16, z: 0.03 },
    r_toe: { x: 0.17, y: 0.06, z: 0.025 },
    r_ankle: { x: 0.16, y: -0.10, z: 0.09 },
    r_knee: { x: 0.13, y: 0.00, z: 0.39 },
    r_hip: { x: 0.12, y: -0.14, z: 0.58 },
    pelvis: { x: 0.00, y: -0.12, z: 0.59 },
    abdomen: { x: 0.00, y: -0.02, z: 0.78 },
    chest: { x: 0.01, y: 0.06, z: 1.00 },
    neck: { x: 0.03, y: 0.10, z: 1.16 },
    skull: { x: 0.01, y: 0.14, z: 1.28 },
    l_shoulder: { x: -0.20, y: 0.08, z: 1.08 },
    r_shoulder: { x: 0.20, y: 0.06, z: 1.07 },
  };
  return { ...rifleJoints(hips, { x: 0.13, y: 0.14, z: 1.13 }, { x: 0.09, y: 0.88, z: 1.12 }), look: aimLook() };
}

function postJoints(aimZ) {
  const hips = {
    l_heel: { x: -0.16, y: 0.16, z: 0.03 },
    l_toe: { x: -0.17, y: 0.38, z: 0.025 },
    l_ankle: { x: -0.16, y: 0.20, z: 0.09 },
    l_knee: { x: -0.14, y: 0.24, z: 0.50 },
    l_hip: { x: -0.12, y: 0.02, z: 0.78 },
    r_heel: { x: 0.16, y: -0.14, z: 0.03 },
    r_toe: { x: 0.17, y: 0.08, z: 0.025 },
    r_ankle: { x: 0.16, y: -0.08, z: 0.09 },
    r_knee: { x: 0.13, y: -0.04, z: 0.49 },
    r_hip: { x: 0.12, y: -0.08, z: 0.78 },
    pelvis: { x: 0.00, y: -0.03, z: 0.80 },
    abdomen: { x: 0.00, y: 0.06, z: 0.98 },
    chest: { x: 0.01, y: 0.12, z: aimZ - 0.16 },
    neck: { x: 0.03, y: 0.16, z: aimZ - 0.01 },
    skull: { x: 0.01, y: 0.20, z: aimZ + 0.11 },
    l_shoulder: { x: -0.20, y: 0.14, z: aimZ - 0.08 },
    r_shoulder: { x: 0.20, y: 0.12, z: aimZ - 0.09 },
  };
  return { ...rifleJoints(hips, { x: 0.16, y: 0.18, z: aimZ - 0.02 }, { x: 0.11, y: 0.92, z: aimZ }), look: aimLook() };
}

function hideJoints(lip) {
  const lShoulder = { x: -0.18, y: 0.04, z: 0.75 };
  const rShoulder = { x: 0.18, y: 0.08, z: 0.76 };
  const stock = { x: 0.08, y: 0.18, z: 0.62 };
  const muzzle = { x: -0.50, y: 0.24, z: 0.58 };
  return {
    l_heel: { x: -0.16, y: 0.18, z: 0.03 },
    l_toe: { x: -0.17, y: 0.40, z: 0.025 },
    l_ankle: { x: -0.16, y: 0.22, z: 0.09 },
    l_knee: { x: -0.14, y: 0.34, z: 0.38 },
    l_hip: { x: -0.12, y: -0.10, z: 0.52 },
    r_heel: { x: 0.16, y: -0.20, z: 0.03 },
    r_toe: { x: 0.17, y: 0.02, z: 0.025 },
    r_ankle: { x: 0.16, y: -0.14, z: 0.09 },
    r_knee: { x: 0.13, y: -0.04, z: 0.32 },
    r_hip: { x: 0.12, y: -0.16, z: 0.51 },
    pelvis: { x: 0.00, y: -0.14, z: 0.52 },
    abdomen: { x: 0.00, y: -0.04, z: 0.62 },
    chest: { x: 0.01, y: 0.08, z: 0.72 },
    neck: { x: 0.02, y: 0.14, z: 0.84 },
    skull: { x: 0.02, y: 0.18, z: Math.min(lip - 0.22, 0.94) },
    l_shoulder: lShoulder,
    r_shoulder: rShoulder,
    ...rifleJoints({ l_shoulder: lShoulder, r_shoulder: rShoulder }, stock, muzzle, {
      rAlong: 0.18,
      lAlong: 0.42,
    }),
    r_elbow: { x: 0.22, y: 0.10, z: 0.52 },
    l_elbow: { x: -0.22, y: 0.12, z: 0.52 },
    look: { x: 0.04, y: 1, z: -0.22 },
  };
}

function proneJoints() {
  const lShoulder = { x: -0.18, y: 0.38, z: 0.16 };
  const rShoulder = { x: 0.18, y: 0.38, z: 0.16 };
  const stock = { x: 0.16, y: 0.42, z: 0.14 };
  const muzzle = { x: 0.12, y: 1.16, z: 0.15 };
  return {
    l_heel: { x: -0.18, y: -0.88, z: 0.04 },
    l_toe: { x: -0.28, y: -1.06, z: 0.03 },
    l_ankle: { x: -0.18, y: -0.92, z: 0.07 },
    l_knee: { x: -0.16, y: -0.46, z: 0.11 },
    l_hip: { x: -0.11, y: -0.04, z: 0.12 },
    r_heel: { x: 0.18, y: -0.88, z: 0.04 },
    r_toe: { x: 0.28, y: -1.06, z: 0.03 },
    r_ankle: { x: 0.18, y: -0.92, z: 0.07 },
    r_knee: { x: 0.16, y: -0.46, z: 0.11 },
    r_hip: { x: 0.11, y: -0.04, z: 0.12 },
    pelvis: { x: 0.00, y: 0.00, z: 0.13 },
    abdomen: { x: 0.00, y: 0.14, z: 0.14 },
    chest: { x: 0.00, y: 0.24, z: 0.15 },
    neck: { x: -0.01, y: 0.38, z: 0.22 },
    skull: { x: -0.02, y: 0.48, z: 0.26 },
    l_shoulder: lShoulder,
    r_shoulder: rShoulder,
    ...rifleJoints({ l_shoulder: lShoulder, r_shoulder: rShoulder }, stock, muzzle, {
      rAlong: 0.19,
      lAlong: 0.40,
      rHint: { x: 0.16, y: 0.00, z: -0.04 },
      lHint: { x: -0.12, y: 0.04, z: 0.02 },
      elbowMinZ: 0.10,
    }),
    look: aimLook(),
    proneFeet: true,
  };
}

function deadJoints() {
  const stock = { x: 0.28, y: -0.56, z: 0.15 };
  const muzzle = { x: 0.94, y: -0.34, z: 0.13 };
  const axis = norm3(sub3(muzzle, stock));
  return {
    l_heel: { x: -0.22, y: 0.78, z: 0.06 },
    l_toe: { x: -0.40, y: 0.92, z: 0.12 },
    l_ankle: { x: -0.22, y: 0.74, z: 0.10 },
    l_knee: { x: -0.26, y: 0.44, z: 0.20 },
    l_hip: { x: -0.11, y: 0.10, z: 0.16 },
    r_heel: { x: 0.16, y: 0.90, z: 0.05 },
    r_toe: { x: 0.32, y: 1.10, z: 0.08 },
    r_ankle: { x: 0.16, y: 0.86, z: 0.09 },
    r_knee: { x: 0.13, y: 0.48, z: 0.12 },
    r_hip: { x: 0.11, y: 0.08, z: 0.16 },
    pelvis: { x: 0.00, y: 0.04, z: 0.16 },
    abdomen: { x: 0.00, y: -0.12, z: 0.16 },
    chest: { x: 0.00, y: -0.30, z: 0.16 },
    neck: { x: 0.02, y: -0.46, z: 0.16 },
    skull: { x: 0.05, y: -0.58, z: 0.18 },
    l_shoulder: { x: -0.22, y: -0.26, z: 0.17 },
    r_shoulder: { x: 0.22, y: -0.32, z: 0.17 },
    l_elbow: { x: -0.52, y: -0.12, z: 0.10 },
    r_elbow: { x: 0.40, y: -0.46, z: 0.12 },
    l_wrist: { x: -0.72, y: 0.08, z: 0.07 },
    r_wrist: { x: 0.34, y: -0.60, z: 0.14 },
    stock,
    muzzle,
    l_hand: { x: -0.25, y: 0.85, z: 0.08 },
    r_hand: axis,
    look: { x: 0.18, y: -0.28, z: 1 },
    proneFeet: true,
  };
}

function shootPose() {
  return assemble(standJoints());
}
function crouchShootPose() {
  return assemble(crouchJoints());
}
function proneShootPose() {
  return assemble(proneJoints());
}
function hidePose(lip) {
  return assemble(hideJoints(lip));
}
function postPose(lip) {
  return assemble(postJoints(lip + COVER_POST_CLEAR));
}
function deadPose() {
  return assemble(deadJoints());
}

function gunTip(parts) {
  const g = parts.find((b) => b.name === "gun");
  if (!g) return { x: 0, y: 0.8, z: 1.3 };
  const tip = rotApply({ x: 0, y: 0, z: g.hz }, g.rx, g.ry, g.rz);
  return add3(g.origin, tip);
}

function armorPlates(pose) {
  const chest = pose.find((b) => b.name === "chest");
  const abd = pose.find((b) => b.name === "abdomen");
  const lsh = pose.find((b) => b.name === "l_shoulder");
  const rsh = pose.find((b) => b.name === "r_shoulder");
  if (!chest) return [];
  const plates = [
    attach("front_plate", chest, { x: 0, y: chest.hy + 0.006, z: 0 }, chest.hx * 0.82, 0.016, chest.hz * 0.78, {
      flesh: false, armor: true, plate: "front_plate", covers: "chest",
    }),
    attach("back_plate", chest, { x: 0, y: -chest.hy - 0.006, z: 0 }, chest.hx * 0.82, 0.016, chest.hz * 0.78, {
      flesh: false, armor: true, plate: "back_plate", covers: "chest",
    }),
    attach("l_side_plate", chest, { x: -chest.hx - 0.016, y: 0, z: -0.02 }, 0.016, chest.hy * 0.7, chest.hz * 0.55, {
      flesh: false, armor: true, plate: "l_side_plate", covers: "chest",
    }),
    attach("r_side_plate", chest, { x: chest.hx + 0.016, y: 0, z: -0.02 }, 0.016, chest.hy * 0.7, chest.hz * 0.55, {
      flesh: false, armor: true, plate: "r_side_plate", covers: "chest",
    }),
  ];
  if (abd) {
    plates.push(attach("abdomen_plate", abd, { x: 0, y: abd.hy + 0.018, z: 0 }, abd.hx * 0.85, 0.016, abd.hz * 0.7, {
      flesh: false, armor: true, plate: "abdomen_plate", covers: "abdomen",
    }));
  }
  if (lsh) {
    plates.push(attach("l_shoulder_pad", lsh, { x: 0, y: 0, z: lsh.hz + 0.02 }, 0.075, 0.055, 0.028, {
      flesh: false, armor: true, plate: "l_shoulder_pad", covers: "l_shoulder",
    }));
  }
  if (rsh) {
    plates.push(attach("r_shoulder_pad", rsh, { x: 0, y: 0, z: rsh.hz + 0.02 }, 0.075, 0.055, 0.028, {
      flesh: false, armor: true, plate: "r_shoulder_pad", covers: "r_shoulder",
    }));
  }
  return plates;
}

export function partFamily(name) {
  if (!name) return "";
  if (/plate|pad/.test(name)) return "armor";
  if (/skull|face|neck|jaw|head|eye/.test(name)) return "head";
  if (/foot|ankle|shin|knee|thigh|hip|leg/.test(name)) return "legs";
  if (/thumb|index|middle|ring|pinky|palm|wrist|hand/.test(name)) return "hands";
  if (/arm|elbow|shoulder|clavicle/.test(name)) return "arms";
  if (/pelvis|abdomen|chest|torso/.test(name)) return "torso";
  if (name === "gun" || name.startsWith("gun_")) return "gear";
  return name;
}

export function prettyPart(name) {
  if (!name) return "";
  const named = {
    front_plate: "front plate",
    back_plate: "back plate",
    l_side_plate: "left side plate",
    r_side_plate: "right side plate",
    abdomen_plate: "abdomen plate",
    l_shoulder_pad: "left shoulder pad",
    r_shoulder_pad: "right shoulder pad",
    gun: "rifle",
  };
  if (named[name]) return named[name];
  let side = "";
  let rest = name;
  if (rest.startsWith("l_")) { side = "left "; rest = rest.slice(2); }
  else if (rest.startsWith("r_")) { side = "right "; rest = rest.slice(2); }
  const finger = rest.match(/^(thumb|index|middle|ring|pinky)_(prox|dist)$/);
  if (finger) {
    const who = { thumb: "thumb", index: "index finger", middle: "middle finger", ring: "ring finger", pinky: "pinky" }[finger[1]];
    return `${side}${who} ${finger[2] === "dist" ? "tip" : "knuckle"}`;
  }
  const words = {
    upper_arm: "upper arm", foot: "foot", ankle: "ankle", shin: "shin", knee: "knee",
    thigh: "thigh", hip: "hip", pelvis: "pelvis", abdomen: "abdomen", chest: "chest",
    neck: "neck", skull: "skull", face: "face", jaw: "jaw", eye: "eye", shoulder: "shoulder",
    elbow: "elbow", forearm: "forearm", wrist: "wrist", palm: "palm", clavicle: "clavicle",
  };
  return side + (words[rest] || rest.replace(/_/g, " "));
}

function partStem(name) {
  return String(name || "").replace(/^[lr]_/, "").replace(/_(prox|dist)$/, "");
}

function partSide(name) {
  if (name.startsWith("l_")) return "l";
  if (name.startsWith("r_")) return "r";
  return "";
}

const CLIP_NEIGHBORS = {
  foot: ["ankle", "shin"], ankle: ["foot", "shin"], shin: ["ankle", "knee", "thigh", "foot"],
  knee: ["shin", "thigh"], thigh: ["knee", "hip", "pelvis", "abdomen", "shin"],
  hip: ["thigh", "pelvis", "abdomen"],
  pelvis: ["hip", "abdomen", "thigh"], abdomen: ["pelvis", "chest", "thigh", "hip"],
  chest: ["abdomen", "neck", "clavicle", "shoulder", "upper_arm"],
  neck: ["chest", "skull"], skull: ["neck", "face"], face: ["skull", "eye"],
  eye: ["face", "skull"], clavicle: ["chest", "shoulder", "upper_arm"],
  shoulder: ["clavicle", "upper_arm", "chest"],
  upper_arm: ["shoulder", "elbow", "forearm", "clavicle", "chest"],
  elbow: ["upper_arm", "forearm"],
  forearm: ["elbow", "wrist", "upper_arm", "palm"],
  wrist: ["forearm", "palm"],
  palm: ["wrist", "forearm", "thumb", "index", "middle", "ring", "pinky"],
  thumb: ["palm"], index: ["palm"], middle: ["palm"], ring: ["palm"], pinky: ["palm"],
};

function isHandish(name) {
  return /palm|wrist|thumb|index|middle|ring|pinky|hand/.test(name);
}

function expectedClip(a, b) {
  if (a.armor || b.armor) {
    const other = a.armor ? b : a;
    return !other.name.startsWith("gun") && other.kind !== "gear";
  }
  if (a.name.startsWith("gun") && b.name.startsWith("gun")) return true;
  if (a.name.startsWith("gun") || b.name.startsWith("gun")) {
    const other = a.name.startsWith("gun") ? b.name : a.name;
    return isHandish(other);
  }
  const sa = partStem(a.name);
  const sb = partStem(b.name);
  const as = partSide(a.name);
  const bs = partSide(b.name);
  if (as && bs && as !== bs) return false;
  return !!(CLIP_NEIGHBORS[sa] && CLIP_NEIGHBORS[sa].includes(sb));
}

function boxCornersLocal(b) {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        out.push(add3(b.origin, rotApply({ x: sx * b.hx, y: sy * b.hy, z: sz * b.hz }, b.rx || 0, b.ry || 0, b.rz || 0)));
      }
    }
  }
  return out;
}

function boxSamples(b, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const x = n === 1 ? 0 : (-1 + (2 * i) / (n - 1)) * b.hx * 0.92;
        const y = n === 1 ? 0 : (-1 + (2 * j) / (n - 1)) * b.hy * 0.92;
        const z = n === 1 ? 0 : (-1 + (2 * k) / (n - 1)) * b.hz * 0.92;
        out.push(add3(b.origin, rotApply({ x, y, z }, b.rx || 0, b.ry || 0, b.rz || 0)));
      }
    }
  }
  return out;
}

function pointDepthInBox(p, b) {
  const loc = rotApplyInv(sub3(p, b.origin), b.rx || 0, b.ry || 0, b.rz || 0);
  const ox = b.hx - Math.abs(loc.x);
  const oy = b.hy - Math.abs(loc.y);
  const oz = b.hz - Math.abs(loc.z);
  if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
  return Math.min(ox, oy, oz);
}

function worldAabbOf(b) {
  const cs = boxCornersLocal(b);
  const mn = { x: Infinity, y: Infinity, z: Infinity };
  const mx = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of cs) {
    mn.x = Math.min(mn.x, p.x); mn.y = Math.min(mn.y, p.y); mn.z = Math.min(mn.z, p.z);
    mx.x = Math.max(mx.x, p.x); mx.y = Math.max(mx.y, p.y); mx.z = Math.max(mx.z, p.z);
  }
  return { mn, mx };
}

function aabbOverlap(a, b) {
  return a.mn.x < b.mx.x && a.mx.x > b.mn.x
    && a.mn.y < b.mx.y && a.mx.y > b.mn.y
    && a.mn.z < b.mx.z && a.mx.z > b.mn.z;
}

export function clipReport(parts, opts = {}) {
  const floorZ = opts.floorZ ?? 0;
  const minDepth = opts.minDepth ?? 0.008;
  const aabbs = parts.map(worldAabbOf);
  const pairs = [];
  const floor = [];
  for (let i = 0; i < parts.length; i++) {
    const lo = aabbs[i].mn.z;
    if (lo < floorZ - 0.005) {
      floor.push({ name: parts[i].name, depth: +(floorZ - lo).toFixed(3) });
    }
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!aabbOverlap(aabbs[i], aabbs[j])) continue;
      let depth = 0;
      for (const p of boxSamples(parts[i], 3)) depth = Math.max(depth, pointDepthInBox(p, parts[j]));
      for (const p of boxSamples(parts[j], 3)) depth = Math.max(depth, pointDepthInBox(p, parts[i]));
      if (depth < minDepth) continue;
      const expected = expectedClip(parts[i], parts[j]);
      pairs.push({
        a: parts[i].name,
        b: parts[j].name,
        depth: +depth.toFixed(3),
        kind: expected ? "expected" : "odd",
      });
    }
  }
  pairs.sort((x, y) => (x.kind === y.kind ? y.depth - x.depth : x.kind === "odd" ? -1 : 1));
  floor.sort((x, y) => y.depth - x.depth);
  return { pairs, floor };
}

export function formatClipReport(label, report) {
  const lines = [`clip ${label}`];
  for (const f of report.floor) {
    const kind = /foot|toe|heel|ankle|plate|chest|abdomen|pelvis/.test(f.name) ? "expected" : "odd";
    if (kind === "expected" && f.depth < 0.045) continue;
    lines.push(`  floor ${kind.padEnd(8)} ${f.name.padEnd(16)} ${f.depth.toFixed(3)}`);
  }
  for (const p of report.pairs) {
    if (p.kind === "expected" && p.depth < 0.045) continue;
    lines.push(`  ${p.kind.padEnd(8)} ${p.a} × ${p.b}  ${p.depth.toFixed(3)}`);
  }
  if (lines.length === 1) lines.push("  none");
  return lines.join("\n");
}

function poseFor(posture, coverUse, unit = null) {
  if (unit?.downed || unit?.dead || posture === Posture.Dead) return deadPose();
  if (coverUse?.mode === CoverMode.Post && Number.isFinite(coverUse.lip)) return postPose(coverUse.lip);
  if (coverUse?.mode === CoverMode.Hide && Number.isFinite(coverUse.lip)) return hidePose(coverUse.lip);
  if (posture === Posture.Prone) return proneShootPose();
  if (posture === Posture.Crouching) return crouchShootPose();
  return shootPose();
}

export function localHitboxes(posture, coverUse = null, unit = null) {
  const pose = poseFor(posture, coverUse, unit);
  const have = new Set((unit?.armor || []).map((a) => a.id || a.region));
  const plates = armorPlates(pose).filter((p) => {
    if (!unit) return true;
    if (!have.size) return false;
    return have.has(p.plate) || have.has(p.covers) || have.has("torso") || have.has("abdomen");
  });
  return pose.concat(plates);
}

export function muzzleHeight(posture) {
  if (posture === Posture.Prone) return 0.18;
  if (posture === Posture.Crouching) return 1.12;
  return 1.39;
}

export function muzzleWorld(unit) {
  const boxes = localHitboxes(unit.posture, unit.cover_use, unit);
  const tip = gunTip(boxes);
  return toWorld(tip, unit.pos, unit.facing || 0);
}

export function toLocal(p, pos, facing) {
  const dx = p.x - pos.x;
  const dy = p.y - pos.y;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  return { x: dx * s - dy * c, y: dx * c + dy * s, z: p.z || 0 };
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
  for (const sx of [0, 1]) {
    for (const sy of [0, 1]) {
      for (const sz of [0, 1]) {
        const local = rotApply(
          { x: (sx ? 1 : -1) * b.hx, y: (sy ? 1 : -1) * b.hy, z: (sz ? 1 : -1) * b.hz },
          b.rx || 0, b.ry || 0, b.rz || 0,
        );
        corners.push(toWorld({
          x: local.x + b.origin.x,
          y: local.y + b.origin.y,
          z: local.z + b.origin.z,
        }, pos, facing));
      }
    }
  }
  return corners;
}

export function unitHitboxes(unit) {
  return localHitboxes(unit.posture, unit.cover_use, unit).map((b) => ({
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
  const raw = toLocal({ x: origin.x + dir.x, y: origin.y + dir.y, z: (origin.z || 0) + dir.z }, pos, facing);
  const d = { x: raw.x - o.x, y: raw.y - o.y, z: raw.z - o.z };
  if (box.origin && box.hx != null) {
    const rel = { x: o.x - box.origin.x, y: o.y - box.origin.y, z: o.z - box.origin.z };
    const ol = rotApplyInv(rel, box.rx || 0, box.ry || 0, box.rz || 0);
    const dl = rotApplyInv(d, box.rx || 0, box.ry || 0, box.rz || 0);
    return rayAabb3(ol, dl, { x: -box.hx, y: -box.hy, z: -box.hz }, { x: box.hx, y: box.hy, z: box.hz }, maxT);
  }
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
  const perpX = dy / dist;
  const perpY = -dx / dist;
  return boxes.filter((b) => b.flesh !== false || b.armor).map((b) => {
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
  const cover = target?.cover_use || null;
  const picked = localHitboxes(posture, cover, target).filter((b) => names.includes(b.name) || names.includes(partFamily(b.name)));
  if (!picked.length) return { x: 0, z: 1.15 };
  if (!attacker || !target) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of picked) {
      x0 = Math.min(x0, b.origin.x - b.hx);
      x1 = Math.max(x1, b.origin.x + b.hx);
      z0 = Math.min(z0, b.origin.z - b.hz);
      z1 = Math.max(z1, b.origin.z + b.hz);
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
    : aim === "legs" ? ["legs"]
    : ["torso"];
  return boxesCenterOffset(want, posture, attacker, target);
}

export function partCenterOffset(partName, posture, attacker, target) {
  if (!partName || partName === "gun") return regionCenterOffset("torso", posture, attacker, target);
  return boxesCenterOffset([partName, partFamily(partName)], posture, attacker, target);
}

export { COVER_STANDOFF };
