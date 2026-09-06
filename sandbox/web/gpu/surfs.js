import { SURF_TILES } from "./surf-tiles.js";

export { SURF_TILES };

export const SURF_TEX_BASE = 80;

export const SURF_KIND_TILE = Object.fromEntries(SURF_TILES.map((t, i) => [t.id, i]));

let atlasInfo = null;

function tileIndex(name) {
  const tiles = atlasInfo?.tiles;
  if (tiles?.length) {
    const i = tiles.findIndex((t) => t.id === name);
    return i < 0 ? undefined : i;
  }
  return SURF_KIND_TILE[name];
}

export function surfTexId(name) {
  if (!atlasInfo || !name) return 0;
  const tile = tileIndex(name);
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
  if (meta.tiles?.length) {
    for (const key of Object.keys(SURF_KIND_TILE)) delete SURF_KIND_TILE[key];
    meta.tiles.forEach((t, i) => { SURF_KIND_TILE[t.id] = i; });
  }
  return atlasInfo;
}
