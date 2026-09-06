import { hashSeed, rockMesh, transformMesh } from "./rock.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const a = rockMesh({ seed: 1, budget: 480, extent: [1.18, 1.02, 1.36] });
const b = rockMesh({ seed: 1, budget: 480, extent: [1.18, 1.02, 1.36] });
const c = rockMesh({ seed: 7, budget: 480, extent: [1.18, 1.02, 1.36] });
if (a !== b) fail("same seed should reuse the cached local mesh");
if (a.verts.length === c.verts.length && a.verts.every((v, i) => v.x === c.verts[i].x && v.y === c.verts[i].y && v.z === c.verts[i].z)) {
  fail("different seeds should sculpt a different rock");
}
if (a.faces.length > 480) fail(`seed 1 exceeded budget: ${a.faces.length}`);
if (c.faces.length > 480) fail(`seed 7 exceeded budget: ${c.faces.length}`);
if (a.verts.length < 20) fail(`rock should be more than a box, got ${a.verts.length} verts`);
if (a.verts.length > a.faces.length * 2) fail(`seed 1 mesh looks exploded: ${a.verts.length} verts / ${a.faces.length} faces`);
if (a.bounds.z0 < -0.02) fail(`rock should sit on the ground, z0=${a.bounds.z0}`);
if (a.bounds.z1 < 0.8) fail(`rock should have height, z1=${a.bounds.z1}`);

const tight = rockMesh({ seed: 3, budget: 120, extent: [1, 1, 1] });
if (tight.faces.length > 120) fail(`tight budget leaked: ${tight.faces.length}`);

const slid = transformMesh(a, { x: 10, y: -4 }, 0);
if (slid.verts === a.verts) fail("instancing should not mutate the cached mesh");
if (Math.abs(slid.bounds.x0 - (a.bounds.x0 + 10)) > 1e-6) fail("translate should slide the instance");
const turned = transformMesh(a, { x: 0, y: 0 }, Math.PI / 2);
const p0 = a.verts[0];
const q0 = turned.verts[0];
if (Math.abs(q0.x + p0.y) > 1e-6 || Math.abs(q0.y - p0.x) > 1e-6) fail("yaw should rotate the instance in XY");

if (hashSeed("boulder-a1") === hashSeed("boulder-a2")) fail("place ids should hash to different seeds");

console.log("rock", a.faces.length, "tris", a.verts.length, "verts chip-or-not", a.faces.length > 320 ? "chip" : "body");
console.log("ok");
