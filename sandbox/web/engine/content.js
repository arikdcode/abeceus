import { makeWorld, makeUnit, Posture } from "./model.js";
import { resolveCoverUse, CoverMode } from "./cover.js";
import { DEFAULT_RULES, mergeRules } from "./rules.js";
import { instantiatePlace, instantiatePlaces, parseBox, parseSurface } from "./props.js";
import { instantiateLightFixtures, instantiateLights, parseLight } from "./lights.js";

function loadProps(index, readOne) {
  const props = {};
  for (const id of index.props || []) props[id] = JSON.parse(readOne(`props/${id}.json`));
  return props;
}

function loadLights(index, readOne) {
  const lights = {};
  for (const id of index.lights || []) lights[id] = parseLight(JSON.parse(readOne(`lights/${id}.json`)));
  return lights;
}

export function loadCatalogSync(readSync) {
  const index = JSON.parse(readSync("index.json"));
  const weapons = {};
  for (const id of index.weapons) weapons[id] = JSON.parse(readSync(`weapons/${id}.json`));
  const characters = {};
  for (const id of index.characters) characters[id] = JSON.parse(readSync(`characters/${id}.json`));
  const maps = {};
  for (const id of index.maps || []) maps[id] = JSON.parse(readSync(`maps/${id}.json`));
  const scenarios = {};
  for (const s of index.scenarios) scenarios[s.id] = JSON.parse(readSync(`scenarios/${s.id}.json`));
  const rules = index.rules ? JSON.parse(readSync(`${index.rules}.json`)) : JSON.parse(readSync("rules.json"));
  return { index, weapons, characters, maps, scenarios, rules, props: loadProps(index, readSync), lights: loadLights(index, readSync) };
}

export async function loadCatalog(read) {
  const index = JSON.parse(await read("index.json"));
  const weapons = {};
  for (const id of index.weapons) weapons[id] = JSON.parse(await read(`weapons/${id}.json`));
  const characters = {};
  for (const id of index.characters) characters[id] = JSON.parse(await read(`characters/${id}.json`));
  const maps = {};
  for (const id of index.maps || []) maps[id] = JSON.parse(await read(`maps/${id}.json`));
  const scenarios = {};
  for (const s of index.scenarios) scenarios[s.id] = JSON.parse(await read(`scenarios/${s.id}.json`));
  const rules = index.rules ? JSON.parse(await read(`${index.rules}.json`)) : JSON.parse(await read("rules.json"));
  const props = {};
  for (const id of index.props || []) props[id] = JSON.parse(await read(`props/${id}.json`));
  const lights = {};
  for (const id of index.lights || []) lights[id] = parseLight(JSON.parse(await read(`lights/${id}.json`)));
  return { index, weapons, characters, maps, scenarios, rules, props, lights };
}

function xy(p, fallback = { x: 0, y: 0 }) {
  if (!p) return { ...fallback };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function applyMap(w, map, catalog) {
  if (!map) return;
  w.map.id = map.id || w.map.id || "";
  if (map.min) w.map.min = xy(map.min);
  if (map.max) w.map.max = xy(map.max);
  if (map.grid != null) w.map.grid = map.grid;
  if (map.surprise0 != null) w.map.surprise0 = map.surprise0;
  if (map.surprise1 != null) w.map.surprise1 = map.surprise1;
  w.map.ground = map.ground || "dirt";
  const placed = instantiatePlaces(map.places, catalog?.props);
  const inline = (map.cover || []).map(parseBox);
  const inlineDecor = (map.decor || []).map(parseBox);
  w.map.cover = [...inline, ...placed.cover];
  w.map.decor = [...inlineDecor, ...placed.decor];
  w.map.surfaces = (map.surfaces || []).map(parseSurface);
  w.map.lights = instantiateLights(map.lights, catalog?.lights);
  const fixtures = instantiateLightFixtures(map.lights, catalog?.lights, instantiatePlace);
  w.map.decor = [...w.map.decor, ...fixtures];
}

function mergePlacement(character, weapon, placement) {
  const out = {
    ...character,
    ...placement,
    name: placement.name || character.name,
    team: placement.team ?? character.team,
    pos: placement.pos,
    facing: placement.facing,
    posture: placement.posture || Posture.Standing,
    character_id: character.id,
    weapon_id: weapon?.id || character.weapon || null,
  };
  if (weapon) {
    out.weapon_spread = weapon.spread;
    out.weapon_pen = weapon.pen;
    out.max_range = weapon.max_range;
    out.mag_size = placement.mag_size ?? weapon.mag_size;
    out.mag = placement.mag ?? weapon.mag_size;
    out.ammo = placement.ammo ?? weapon.ammo;
    out.ammo_max = placement.ammo_max ?? weapon.ammo_max;
  }
  if (character.armor) out.armor = character.armor.map((a) => ({ ...a, durability_max: a.durability_max ?? a.durability }));
  return out;
}

function applyCoverPlacement(world, unit, cover) {
  if (!cover) return;
  const mode = cover.mode || CoverMode.Post;
  const use = resolveCoverUse(world, unit.pos, mode, cover);
  if (!use) return;
  unit.pos = { ...use.slot };
  if (cover.facing == null) unit.facing = use.facing;
  unit.cover_use = { index: use.index, face: use.face, mode: use.mode, lip: use.lip };
}

export function assembleWorld(catalog, scenario) {
  const src = typeof scenario === "string" ? catalog.scenarios[scenario] : scenario;
  if (!src) throw new Error(`unknown scenario: ${scenario}`);
  const w = makeWorld();
  w.scenario_id = src.id || src.name || "unnamed";
  w.scenario_name = src.name || w.scenario_id;
  w.seed = src.seed || 1;
  w.skip_contact = !!(src.skip_contact || src.start_phase === "play");
  let map = src.map;
  if (typeof map === "string") {
    map = catalog.maps[map];
    if (!map) throw new Error(`unknown map: ${src.map}`);
  }
  applyMap(w, map, catalog);
  w.rules = mergeRules(DEFAULT_RULES, catalog.rules);
  if (src.turn_seconds != null) w.rules.turn_seconds = src.turn_seconds;
  if (src.surprise0 != null) w.map.surprise0 = src.surprise0;
  if (src.surprise1 != null) w.map.surprise1 = src.surprise1;
  let next = 1;
  for (const place of src.units || []) {
    const charId = place.character;
    const character = charId ? catalog.characters[charId] : null;
    if (charId && !character) throw new Error(`unknown character: ${charId}`);
    const base = character || place;
    const weaponId = place.weapon || base.weapon;
    const weapon = weaponId ? catalog.weapons[weaponId] : null;
    if (weaponId && !weapon) throw new Error(`unknown weapon: ${weaponId}`);
    const merged = character ? mergePlacement(character, weapon, place) : { ...place, weapon_id: weapon?.id };
    if (!character && weapon) {
      merged.weapon_spread = weapon.spread;
      merged.weapon_pen = weapon.pen;
      merged.max_range = weapon.max_range;
      merged.mag_size = place.mag_size ?? weapon.mag_size;
      merged.mag = place.mag ?? weapon.mag_size;
      merged.ammo = place.ammo ?? weapon.ammo;
      merged.ammo_max = place.ammo_max ?? weapon.ammo_max;
    }
    const unit = makeUnit(merged, place.id || next++);
    applyCoverPlacement(w, unit, place.cover);
    w.units.push(unit);
  }
  return w;
}

export function worldFromCatalog(catalog, scenarioId) {
  return assembleWorld(catalog, scenarioId);
}
