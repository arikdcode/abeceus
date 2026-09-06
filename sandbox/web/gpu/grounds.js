import { GROUND_TILES } from "./ground-tiles.js";

export { GROUND_TILES };

export const GROUND_TEX_BASE = 16;

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
  if (meta.tiles?.length) {
    meta.tiles.forEach((t, i) => { GROUND_KIND_TILE[t.id] = i; });
    GROUND_KIND_TILE.road = GROUND_KIND_TILE.asphalt;
    GROUND_KIND_TILE.tracks = GROUND_KIND_TILE.dirt_dry;
  }
  return atlasInfo;
}
