export const SURF_TEX_BASE = 80;

export const SURF_TILES = [
  { id: "steel", name: "Bare steel", mat: "metal" },
  { id: "steel_worn", name: "Worn steel", mat: "metal" },
  { id: "steel_od", name: "Olive drab steel", mat: "paint" },
  { id: "steel_tan", name: "Tan steel", mat: "paint" },
  { id: "steel_grey", name: "Grey steel", mat: "paint" },
  { id: "galvanized", name: "Galvanized", mat: "metal" },
  { id: "aluminum", name: "Aluminum", mat: "metal" },
  { id: "gunmetal", name: "Gunmetal", mat: "metal" },
  { id: "rust_heavy", name: "Heavy rust", mat: "metal" },
  { id: "rust_streak", name: "Rust streaks", mat: "metal" },
  { id: "brass", name: "Brass", mat: "metal" },
  { id: "copper", name: "Copper", mat: "metal" },
  { id: "chrome", name: "Chrome", mat: "metal" },
  { id: "anodized", name: "Anodized blue", mat: "metal" },
  { id: "corrugated", name: "Corrugated", mat: "metal" },
  { id: "riveted", name: "Riveted plate", mat: "metal" },
  { id: "paint_peel", name: "Peeling paint", mat: "paint" },
  { id: "enamel_white", name: "White enamel", mat: "paint" },
  { id: "enamel_black", name: "Black enamel", mat: "paint" },
  { id: "hazard_yel", name: "Hazard yellow", mat: "paint" },
  { id: "hazard_red", name: "Hazard red", mat: "paint" },
  { id: "primer", name: "Red primer", mat: "paint" },
  { id: "camo_paint", name: "Camo paint", mat: "paint" },
  { id: "rubber_coat", name: "Rubber coat", mat: "rubber" },
  { id: "brick_wall", name: "Brick wall", mat: "concrete" },
  { id: "brick_white", name: "White brick", mat: "concrete" },
  { id: "cinder", name: "Cinder block", mat: "concrete" },
  { id: "stucco", name: "Stucco", mat: "concrete" },
  { id: "plaster", name: "Plaster", mat: "concrete" },
  { id: "concrete_panel", name: "Concrete panel", mat: "concrete" },
  { id: "concrete_board", name: "Form board", mat: "concrete" },
  { id: "tile_white", name: "White tile", mat: "concrete" },
  { id: "tile_dirty", name: "Dirty tile", mat: "concrete" },
  { id: "stone_block", name: "Stone block", mat: "stone" },
  { id: "adobe", name: "Adobe", mat: "dirt" },
  { id: "terrazzo", name: "Terrazzo", mat: "concrete" },
  { id: "pine", name: "Pine plank", mat: "wood" },
  { id: "plywood", name: "Plywood", mat: "wood" },
  { id: "osb", name: "OSB", mat: "wood" },
  { id: "crate_wood", name: "Crate wood", mat: "wood" },
  { id: "pallet", name: "Pallet wood", mat: "wood" },
  { id: "teak", name: "Teak", mat: "wood" },
  { id: "charred", name: "Charred wood", mat: "wood" },
  { id: "laminate", name: "Laminate", mat: "paint" },
  { id: "canvas", name: "Canvas", mat: "canvas" },
  { id: "tarp_green", name: "Green tarp", mat: "canvas" },
  { id: "tarp_tan", name: "Tan tarp", mat: "canvas" },
  { id: "camo_cloth", name: "Camo cloth", mat: "canvas" },
  { id: "net", name: "Netting", mat: "canvas" },
  { id: "sandbag", name: "Sandbag cloth", mat: "canvas" },
  { id: "leather", name: "Leather", mat: "rubber" },
  { id: "felt", name: "Felt", mat: "canvas" },
  { id: "hull_white", name: "White hull", mat: "paint" },
  { id: "hull_dark", name: "Dark hull", mat: "metal" },
  { id: "polymer_panel", name: "Polymer panel", mat: "paint" },
  { id: "carbon_panel", name: "Carbon panel", mat: "metal" },
  { id: "hex_panel", name: "Hex panel", mat: "metal" },
  { id: "insulation", name: "Foam insulation", mat: "default" },
  { id: "ceramic_heat", name: "Heat shield", mat: "stone" },
  { id: "server", name: "Server face", mat: "metal" },
  { id: "plastic", name: "Hard plastic", mat: "paint" },
  { id: "pvc", name: "PVC", mat: "paint" },
  { id: "grate_wall", name: "Wall grate", mat: "metal" },
  { id: "stripe_panel", name: "Stripe panel", mat: "paint" },
];

export const SURF_KIND_TILE = Object.fromEntries(SURF_TILES.map((t, i) => [t.id, i]));

let atlasInfo = null;

export function surfTexId(name) {
  if (!atlasInfo || !name) return 0;
  const tile = SURF_KIND_TILE[name];
  if (tile == null) return 0;
  return SURF_TEX_BASE + tile;
}

export function surfAtlas() {
  return atlasInfo;
}

export async function loadSurfAtlas(fetchText, fetchBlob) {
  const meta = JSON.parse(await fetchText("textures/surf/atlas.json"));
  const blob = await fetchBlob("textures/surf/atlas.png");
  const url = URL.createObjectURL(blob);
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("surf atlas failed to load"));
    image.src = url;
  });
  URL.revokeObjectURL(url);
  atlasInfo = { ...meta, image: img };
  return atlasInfo;
}
