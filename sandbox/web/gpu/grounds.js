export const GROUND_TEX_BASE = 16;

export const GROUND_TILES = [
  { id: "dirt", name: "Packed dirt" },
  { id: "dirt_dry", name: "Dry dirt" },
  { id: "dirt_red", name: "Red earth" },
  { id: "mud", name: "Wet mud" },
  { id: "clay", name: "Clay" },
  { id: "cracked", name: "Cracked earth" },
  { id: "sand", name: "Sand" },
  { id: "ash", name: "Ash" },
  { id: "grass", name: "Grass" },
  { id: "grass_dry", name: "Dry grass" },
  { id: "moss", name: "Moss" },
  { id: "leaf", name: "Leaf litter" },
  { id: "gravel", name: "Gravel" },
  { id: "pebbles", name: "Pebbles" },
  { id: "rock", name: "Bedrock" },
  { id: "snow", name: "Packed snow" },
  { id: "concrete", name: "Concrete" },
  { id: "concrete_worn", name: "Worn concrete" },
  { id: "asphalt", name: "Asphalt" },
  { id: "tarmac", name: "Tarmac" },
  { id: "brick", name: "Brick pavers" },
  { id: "cobble", name: "Cobblestone" },
  { id: "wood", name: "Wood deck" },
  { id: "wood_worn", name: "Worn wood" },
  { id: "metal", name: "Deck plate" },
  { id: "rust", name: "Rusted plate" },
  { id: "tread", name: "Tread plate" },
  { id: "hex", name: "Hex tile" },
  { id: "polymer", name: "Polymer floor" },
  { id: "carbon", name: "Carbon weave" },
  { id: "grate", name: "Metal grate" },
  { id: "hazard", name: "Hazard deck" },
];

export const GROUND_KIND_TILE = Object.fromEntries(GROUND_TILES.map((t, i) => [t.id, i]));
GROUND_KIND_TILE.road = GROUND_KIND_TILE.asphalt;
GROUND_KIND_TILE.tracks = GROUND_KIND_TILE.dirt_dry;

let atlasInfo = null;

export function groundTexId(kind, explicit) {
  if (!atlasInfo) return 0;
  if (explicit != null && Number.isFinite(explicit)) return GROUND_TEX_BASE + explicit;
  const tile = GROUND_KIND_TILE[kind];
  if (tile == null) return 0;
  return GROUND_TEX_BASE + tile;
}

export function setGroundAtlas(info) {
  atlasInfo = info;
}

export function groundAtlas() {
  return atlasInfo;
}

export async function loadGroundAtlas(fetchText, fetchBlob) {
  const meta = JSON.parse(await fetchText("textures/ground/atlas.json"));
  const blob = await fetchBlob("textures/ground/atlas.png");
  const url = URL.createObjectURL(blob);
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("ground atlas failed to load"));
    image.src = url;
  });
  URL.revokeObjectURL(url);
  atlasInfo = { ...meta, image: img };
  return atlasInfo;
}
