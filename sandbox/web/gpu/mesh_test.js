import { LIT_STRIDE, MeshWriter, pushBox, pushMesh } from "./mesh.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const corners = [];
for (const x of [0, 2]) {
  for (const y of [0, 2]) {
    for (const z of [0, 1]) corners.push({ x, y, z });
  }
}

const out = new MeshWriter(LIT_STRIDE);
pushBox(out, corners, [1, 1, 1], 1, { spec: 0, shine: 1, wrap: 0 });
const data = out.view();
const verts = data.length / LIT_STRIDE;
if (verts !== 36) fail(`box should be 12 tris, got ${verts} verts`);

let top = 0;
let outward = 0;
for (let i = 0; i < verts; i++) {
  const o = i * LIT_STRIDE;
  const nx = data[o + 4];
  const ny = data[o + 5];
  const nz = data[o + 6];
  if (nz > 0.9) top += 1;
  const px = data[o] - 1;
  const py = data[o + 1] - 1;
  const pz = data[o + 2] - 0.5;
  if (nx * px + ny * py + nz * pz > 0) outward += 1;
}
if (top !== 6) fail(`top face should be 6 verts with +z, got ${top}`);
if (outward !== verts) fail(`every box normal should point outward, ${outward}/${verts}`);

const meshOut = new MeshWriter(LIT_STRIDE);
pushMesh(meshOut, {
  verts: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
  faces: [[0, 1, 2]],
}, [1, 1, 1], 1, { spec: 0, shine: 1, wrap: 0 });
if (meshOut.vertexCount() !== 3) fail(`pushMesh should write one triangle, got ${meshOut.vertexCount()}`);

console.log("mesh_test ok");
