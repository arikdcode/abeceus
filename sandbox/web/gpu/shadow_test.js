import { assignShadowLayers, assignSpotLayers, cubeFaceCam, projectShadow, spotShadowCam, sunShadowCam } from "./shadow.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const map = { min: [0, 0], max: [64, 48] };
const sun = sunShadowCam(map);
const corners = [
  { x: 0, y: 0, z: 0 }, { x: 64, y: 0, z: 0 }, { x: 0, y: 48, z: 0 }, { x: 64, y: 48, z: 0 },
  { x: 32, y: 24, z: 3 }, { x: 8, y: 19.5, z: 1.4 },
];
for (const p of corners) {
  const s = projectShadow(p, sun);
  if (s.u < 0.02 || s.u > 0.98 || s.v < 0.02 || s.v > 0.98) {
    fail(`sun uv out of range at ${p.x},${p.y},${p.z}: ${s.u},${s.v}`);
  }
  if (s.depth < 0.02 || s.depth > 0.98) fail(`sun depth ${s.depth} at ${p.x},${p.y}`);
}

const lamp = { x: 8, y: 19.55, z: 3.3, range: 15 };
const down = cubeFaceCam(lamp, 5);
const under = projectShadow({ x: 8, y: 19.55, z: 0 }, down);
if (Math.abs(under.u - 0.5) > 0.02 || Math.abs(under.v - 0.5) > 0.02) {
  fail(`down face should look at ground under lamp, uv=${under.u},${under.v}`);
}
const plusX = cubeFaceCam(lamp, 0);
const east = projectShadow({ x: 12, y: 19.55, z: 3.3 }, plusX);
if (Math.abs(east.u - 0.5) > 0.08 || Math.abs(east.v - 0.5) > 0.08) {
  fail(`+X face should see a point due east, uv=${east.u},${east.v}`);
}

const lights = assignShadowLayers([
  { x: 8, y: 19, z: 3.3, intensity: 1.85 },
  { x: 50, y: 32, z: 1.55, intensity: 1.1 },
]);
if (lights.length !== 1) fail(`only elevated lamps should get cubes, got ${lights.length}`);
if (lights[0].shadowLayer !== 0) fail("lamp should take cube 0");

const mixed = [
  { x: 8, y: 19, z: 3.3, intensity: 1.85 },
  { x: 38, y: 18, z: 0.9, intensity: 1.3, dx: 1, dy: 0, dz: 0 },
];
assignShadowLayers(mixed);
const spots = assignSpotLayers(mixed);
if (spots.length !== 1) fail(`headlights should get a spot map, got ${spots.length}`);
if (mixed[1].shadowLayer !== -2 || mixed[1].spotLayer !== 0) fail("spot layer encoding");
const beam = spotShadowCam(mixed[1]);
const ahead = projectShadow({ x: 41, y: 18, z: 0.9 }, beam);
if (Math.abs(ahead.u - 0.5) > 0.04 || Math.abs(ahead.v - 0.5) > 0.04) {
  fail(`spot cam should look down the beam, uv=${ahead.u},${ahead.v}`);
}

console.log("shadow_test ok");
