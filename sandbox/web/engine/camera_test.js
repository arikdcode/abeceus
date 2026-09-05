import { makeCam3, project3 } from "../view3d.js";
import { ORBIT_YAW, applyHeldCam, stepHeldCam, stepOrbitKey, writeCam } from "./camstep.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function nearly(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

const start = makeCam3();
const y0 = start.yaw;
const t0 = { ...start.target };

let cam = makeCam3();
for (let i = 0; i < 20; i++) {
  const next = applyHeldCam(cam, { e: true }, 0.2);
  writeCam(cam, next);
}
if (!nearly(cam.yaw, y0 + 20 * ORBIT_YAW)) {
  fail(`hold E should accumulate yaw: got ${cam.yaw} want ${y0 + 20 * ORBIT_YAW}`);
}
if (cam.target.x !== t0.x || cam.target.y !== t0.y) fail("E must not move the look-at");

const afterE = cam.yaw;
for (let i = 0; i < 20; i++) {
  const next = applyHeldCam(cam, {}, 0.2);
  writeCam(cam, next);
}
if (!nearly(cam.yaw, afterE)) fail(`releasing E reset yaw from ${afterE} to ${cam.yaw}`);

cam = makeCam3();
for (let i = 0; i < 20; i++) {
  const next = applyHeldCam(cam, { q: true }, 0.2);
  writeCam(cam, next);
}
if (!nearly(cam.yaw, y0 - 20 * ORBIT_YAW)) fail(`hold Q should accumulate yaw: got ${cam.yaw}`);
const afterQ = cam.yaw;
for (let i = 0; i < 10; i++) writeCam(cam, applyHeldCam(cam, {}, 0.2));
if (!nearly(cam.yaw, afterQ)) fail("releasing Q reset yaw");

cam = makeCam3();
const keys = new Set(["e"]);
for (let i = 0; i < 12; i++) stepHeldCam(cam, keys, 0.25);
if (!nearly(cam.yaw, y0 + 12 * ORBIT_YAW)) fail("stepHeldCam(E) did not stick");
keys.delete("e");
const frozen = cam.yaw;
for (let i = 0; i < 12; i++) stepHeldCam(cam, keys, 0.25);
if (!nearly(cam.yaw, frozen)) fail("stepHeldCam after release reset the camera");

cam = makeCam3();
stepHeldCam(cam, new Set(["KeyE"]), 0.25);
if (!nearly(cam.yaw, y0 + ORBIT_YAW)) fail("KeyE code should rotate");

cam = makeCam3();
for (let i = 0; i < 10; i++) {
  stepOrbitKey(cam, "e");
  writeCam(cam, applyHeldCam(cam, {}, 0));
}
if (!nearly(cam.yaw, y0 + 10 * ORBIT_YAW)) {
  fail(`keydown/keyup pairs must still accumulate: got ${cam.yaw} want ${y0 + 10 * ORBIT_YAW}`);
}
const afterPairs = cam.yaw;
writeCam(cam, applyHeldCam(cam, {}, 0));
writeCam(cam, applyHeldCam(cam, {}, 0));
if (!nearly(cam.yaw, afterPairs)) fail("orbit from key pairs reset after release");

const moved = makeCam3();
moved.target = { x: 4, y: 3, z: 0 };
moved.yaw = -0.2;
moved.pitch = 0.9;
moved.dist = 18;
const saved = null;
if (!saved) {
  const yawBefore = moved.yaw;
  const txBefore = moved.target.x;
  stepOrbitKey(moved, "e");
  if (nearly(moved.yaw, y0) && moved.target.x === 10) {
    fail("Q/E must not snap a moved camera back to makeCam3 defaults");
  }
  if (moved.target.x !== txBefore) fail("E must not move look-at of an already-positioned camera");
  if (!nearly(moved.yaw, yawBefore + ORBIT_YAW)) fail("E on a moved camera should only add yaw");
}

const zoomed = makeCam3();
zoomed.target = { x: 1, y: 1, z: 0 };
zoomed.dist = 3.2;
zoomed.pitch = 0.55;
zoomed.yaw = Math.PI * 0.75;
const mapCorners = [
  { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 },
  { x: 20, y: 16, z: 0 }, { x: 0, y: 16, z: 0 },
].map((p) => project3(zoomed, 800, 600, p));
let visibleCells = 0;
for (let x = 0; x < 20; x++) {
  for (let y = 0; y < 16; y++) {
    const a = project3(zoomed, 800, 600, { x, y, z: 0 });
    const b = project3(zoomed, 800, 600, { x: x + 1, y, z: 0 });
    const c = project3(zoomed, 800, 600, { x: x + 1, y: y + 1, z: 0 });
    const d = project3(zoomed, 800, 600, { x, y: y + 1, z: 0 });
    if ((a && b && c) || (a && c && d)) visibleCells++;
  }
}
if (visibleCells < 6) {
  fail(`zoomed corner should still show nearby floor tiles; visible=${visibleCells} wholeFloor=${mapCorners.every(Boolean)}`);
}

console.log("camera_test ok", { y0, afterE, afterQ, frozen, afterPairs, visibleCells, wholeFloor: mapCorners.every(Boolean) });
