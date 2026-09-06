import { collectLights, isPoleLike } from "./world.js";
import { instantiatePlace } from "../engine/props.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const none = collectLights([]);
if (none.length) fail("empty boxes should yield no lights");

const lights = collectLights([
  {
    min: { x: 7.72, y: 19.03 },
    max: { x: 8.28, y: 19.43 },
    z0: 3.12,
    z1: 3.48,
    emit: 1,
    color: "#e8c86a",
  },
  {
    min: [-2.55, -3.04],
    max: [-1.15, -2.78],
    z0: 1.05,
    z1: 2.05,
    emit: 0.35,
    color: "#1c2830",
  },
  { min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, emit: 0, color: "#fff" },
]);

if (lights.length !== 2) fail(`want 2 lights, got ${lights.length}`);

const lamp = lights[0];
if (Math.abs(lamp.x - 8) > 1e-6 || Math.abs(lamp.y - 19.23) > 1e-6) {
  fail(`lamp xy ${lamp.x},${lamp.y}`);
}
if (Math.abs(lamp.z - 3.3) > 1e-6) fail(`lamp should sit in the head, z=${lamp.z}`);
if (lamp.range < 12 || lamp.range > 20) fail(`lamp range ${lamp.range}`);
if (lamp.intensity < 1.4 || lamp.intensity > 2.4) fail(`lamp intensity ${lamp.intensity}`);

const window = lights[1];
if (window.r < 0.9 || window.g > 0.8) fail("dark glass should leak warm light, not its albedo");
if (Math.hypot(lamp.dx || 0, lamp.dy || 0, lamp.dz || 0) > 0.01) fail("omni lamp should have no spot dir");

const spots = collectLights(instantiatePlace({
  parts: [{
    min: [2.22, -0.2], max: [2.32, 0.2], z0: 0.78, z1: 1.02,
    emit: 0.55, emit_dir: [1, 0, 0], color: "#e8d090",
  }],
}, { pos: [0, 0], yaw: Math.PI / 2 }));
if (spots.length !== 1) fail(`want 1 spot, got ${spots.length}`);
if (Math.abs(spots[0].dx) > 0.05 || Math.abs(spots[0].dy - 1) > 0.05) {
  fail(`spot dir should follow yaw, got ${spots[0].dx},${spots[0].dy}`);
}
if (spots[0].range >= lamp.range) fail(`headlight range should be tighter than a lamp: ${spots[0].range}`);
if (Math.abs(spots[0].y - 2.47) > 0.05) fail(`spot should sit in front of the fixture, y=${spots[0].y}`);

const pole = { x0: -0.07, x1: 0.07, y0: -0.07, y1: 0.07, z0: 0, z1: 3.45 };
const hull = { x0: 0, x1: 4, y0: 0, y1: 2, z0: 0, z1: 1.2 };
if (!isPoleLike(pole)) fail("lamp pole should skip lamp-shadow casters");
if (isPoleLike(hull)) fail("wide hull should still cast lamp shadows");

console.log("lights_test ok");
