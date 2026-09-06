import { Engine, worldFromCatalog } from "../engine/engine.js";
import { loadRepoCatalog } from "../engine/catalog-node.js";
import { coverBox } from "../engine/body.js";
import { collectLights } from "./world.js";
import { buildLightGrid, buildOccluderGrid, collectOccluders, lightsInCell, occluded, packLights, reservoirCombine, reservoirUpdate, makeReservoir } from "./restir.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const packed = packLights([
  { x: 8, y: 19.5, z: 3.3, range: 15, r: 1, g: 0.8, b: 0.4, intensity: 1.8 },
  { x: 38.8, y: 18.6, z: 0.9, range: 7, r: 1, g: 0.9, b: 0.6, intensity: 1.3, dx: 1, dy: 0, dz: 0 },
]);
if (packed.n !== 2) fail(`pack ${packed.n}`);
if (packed.data[11] !== 0) fail("lamp should be omni");
if (packed.data[16 + 11] !== 1) fail("headlight should be a spot");

const wall = { x0: 10, x1: 10.2, y0: 0, y1: 4, z0: 0, z1: 3 };
const boxes = collectOccluders([{ corners: [
  { x: 10, y: 0, z: 0 }, { x: 10.2, y: 0, z: 0 }, { x: 10, y: 4, z: 0 }, { x: 10.2, y: 4, z: 0 },
  { x: 10, y: 0, z: 3 }, { x: 10.2, y: 0, z: 3 }, { x: 10, y: 4, z: 3 }, { x: 10.2, y: 4, z: 3 },
], emit: 0 }]);
if (boxes.length !== 1) fail("should keep the wall");
const grid = buildOccluderGrid(boxes, { min: [0, 0], max: [20, 8] }, 2);
const lamp = { x: 8, y: 2, z: 1.2 };
const behind = { x: 12, y: 2, z: 0.05 };
const open = { x: 6, y: 2, z: 0.05 };
if (!occluded(behind, lamp, boxes, grid)) fail("wall should block the lamp");
if (occluded(open, lamp, boxes, grid)) fail("open ground should see the lamp");
if (occluded(behind, lamp, [wall], null) !== occluded(behind, lamp, boxes, grid)) {
  fail("grid walk should match a linear test");
}

const r = makeReservoir();
reservoirUpdate(r, 0, 2, 2, 0.1);
reservoirUpdate(r, 1, 10, 10, 0.2);
if (r.y !== 1) fail(`reservoir should keep the bright light, y=${r.y}`);
const other = makeReservoir();
reservoirUpdate(other, 2, 1, 1, 0.2);
const merged = reservoirCombine(r, other, 0.99);
if (merged.m < r.m) fail("combine should accumulate M");

const catalog = loadRepoCatalog();
const eng = new Engine();
if (!eng.loadWorld(worldFromCatalog(catalog, "outpost"))) fail("outpost load");
const view = eng.view({ fog: false });
const map = view.map;
const lights = collectLights([...(map.decor || []), ...(map.cover || [])]);
if (lights.length < 10) fail(`outpost should keep its lamps, got ${lights.length}`);
const casters = [];
for (const c of [...(map.decor || []), ...(map.cover || [])]) {
  const slab = {
    min: { x: Array.isArray(c.min) ? c.min[0] : c.min.x, y: Array.isArray(c.min) ? c.min[1] : c.min.y },
    max: { x: Array.isArray(c.max) ? c.max[0] : c.max.x, y: Array.isArray(c.max) ? c.max[1] : c.max.y },
    z0: c.z0 ?? 0,
    z1: c.z1 ?? c.height ?? 1,
  };
  casters.push({ ...coverBox(slab), emit: c.emit || 0 });
}
const worldBoxes = collectOccluders(casters);
const worldGrid = buildOccluderGrid(worldBoxes, map);
const lampW1 = lights.find((L) => Math.abs(L.x - 8) < 0.2 && Math.abs(L.y - 19.23) < 0.3);
if (!lampW1) fail("lamp-w1 missing");
if (occluded({ x: 9.5, y: 19.23, z: 0.05 }, lampW1, worldBoxes, worldGrid)) fail("road beside lamp-w1 should see the lamp");
if (occluded({ x: 8, y: 20.7, z: 0.05 }, lampW1, worldBoxes, worldGrid)) fail("pole should not eat the lamp pool");
const lgrid = buildLightGrid(lights, worldGrid);
const nearLamp = lightsInCell(lgrid, 8, 19.23);
if (!nearLamp.includes(lights.indexOf(lampW1))) fail("light grid should list lamp-w1 in its own cell");
let maxLocal = 0;
for (let r = 0; r < lgrid.rows; r++) {
  for (let c = 0; c < lgrid.cols; c++) {
    maxLocal = Math.max(maxLocal, lgrid.header[(r * lgrid.cols + c) * 2 + 1]);
  }
}
if (maxLocal < 1) fail("light grid is empty");
if (maxLocal > 8) fail(`outpost cells should stay in the exact path, max=${maxLocal}`);

const head = lights.find((L) => Math.abs(L.x - 38.97) < 0.3 && Math.abs(L.y - 17.93) < 0.3);
if (!head) fail("workshop headlight missing");
if (!occluded({ x: 38, y: 13, z: 0.05 }, head, worldBoxes, worldGrid)) fail("tent interior should not see the workshop headlights");
if (occluded({ x: 41, y: 17.93, z: 0.05 }, head, worldBoxes, worldGrid)) fail("open gravel in the beam should see the headlight");

const rangeEng = new Engine();
if (!rangeEng.loadWorld(worldFromCatalog(catalog, "night_range"))) fail("night_range load");
const rangeView = rangeEng.view({ fog: false });
const rangeLights = collectLights([...(rangeView.map.decor || []), ...(rangeView.map.cover || [])]);
if (rangeLights.length < 60) fail(`night range should be crowded, lights=${rangeLights.length}`);

const yardEng = new Engine();
if (!yardEng.loadWorld(worldFromCatalog(catalog, "light_yard"))) fail("light_yard load");
const yardView = yardEng.view({ fog: false });
if ((yardView.map.lights || []).length < 80) fail(`light yard view should keep catalog lights, got ${yardView.map.lights?.length}`);
const packedYard = packLights(yardView.map.lights);
const searchIdx = yardView.map.lights.findIndex((L) => L.light === "search");
if (searchIdx < 0) fail("light yard should keep a searchlight");
if (packedYard.data[searchIdx * 16 + 11] !== 1) fail("searchlight should pack as a spot");
if (!(packedYard.data[searchIdx * 16 + 13] > 0.9)) fail("tight search cone should pack a high outer cosine");

console.log("restir_test ok");
