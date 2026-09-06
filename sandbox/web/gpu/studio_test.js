import { loadRepoCatalog } from "../engine/catalog-node.js";
import { PHOTO_ANGLES, PHOTO_SHEET_ANGLES, buildStudioFrame, frameObjectCam, objectBounds, objectParts, photoObjects } from "./studio.js";

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const catalog = loadRepoCatalog();
const props = photoObjects(catalog);
if (props.length < 12) fail(`studio should photograph the catalog props, got ${props.length}`);
if (props.some((p) => p.id === "panel" || p.id === "block")) fail("mosaic should skip material swatches");

const crate = catalog.props.crate;
const tower = catalog.props.tower;
if (!crate || !tower) fail("crate and tower should be in the catalog");

const crateB = objectBounds(objectParts(crate));
const towerB = objectBounds(objectParts(tower));
if (towerB.r <= crateB.r) fail(`tower should be larger than a crate: ${towerB.r} vs ${crateB.r}`);

const crateCam = frameObjectCam(crateB, PHOTO_ANGLES[0]);
const towerCam = frameObjectCam(towerB, PHOTO_ANGLES[0]);
if (towerCam.dist <= crateCam.dist + 1) fail(`camera should back up for the tower: ${towerCam.dist} vs ${crateCam.dist}`);

const framed = buildStudioFrame(tower, { angle: PHOTO_ANGLES[2] });
if (!framed.solids.length) fail("studio frame should instance the object");
if (framed.cam.dist < 6) fail(`tower side shot should stay framed, dist=${framed.cam.dist}`);
if (!framed.lights.length) fail("studio should light the object");
if (framed.sun !== true) fail("studio should use a photo sun");

const office = buildStudioFrame(catalog.props.office);
if (!office.solids.some((s) => s.surf === "concrete_panel")) fail("studio should keep object surfs");

if (PHOTO_SHEET_ANGLES.length !== 16) fail(`object sheet should be 4x4, got ${PHOTO_SHEET_ANGLES.length}`);
if (PHOTO_SHEET_ANGLES.some((a) => a.pitch < 0.16 || a.pitch > 1.12)) fail("sheet pitches should stay tilted, never flat or top-down");
if (PHOTO_SHEET_ANGLES.some((a) => {
  const y = ((a.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].some((card) => Math.abs(y - card) < 0.05);
})) fail("sheet yaws should stay off the cardinals");

const boulder = catalog.props.boulder;
if (!boulder) fail("catalog should rename rock to boulder");
if (boulder.parts.some((p) => p.surf !== "boulder")) fail("boulder should wear the boulder surf");
if (catalog.props.rock) fail("old rock prop should be gone");

console.log("studio", props.map((p) => p.id).join(" "), "crate", crateCam.dist.toFixed(1), "tower", towerCam.dist.toFixed(1));
console.log("ok");
