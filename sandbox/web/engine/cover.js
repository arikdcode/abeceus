const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const COVER_STANDOFF = 0.42;
export const COVER_USE_PAD = 0.95;
export const COVER_POST_CLEAR = 0.08;
export const COVER_POST_MAX = 1.55;

export const CoverMode = { Post: "post", Hide: "hide" };

export function coverDistXY(p, c) {
  const cx = clamp(p.x, c.min.x, c.max.x);
  const cy = clamp(p.y, c.min.y, c.max.y);
  return Math.hypot(p.x - cx, p.y - cy);
}

export function pointInCoverXY(p, c, pad = 0) {
  return p.x >= c.min.x - pad && p.x <= c.max.x + pad && p.y >= c.min.y - pad && p.y <= c.max.y + pad;
}

export function inUseZone(p, c) {
  if (!c || c.durability <= 0) return false;
  if (pointInCoverXY(p, c, -0.02)) return false;
  return coverDistXY(p, c) <= COVER_USE_PAD;
}

export function useBounds(c) {
  return {
    min: { x: c.min.x - COVER_USE_PAD, y: c.min.y - COVER_USE_PAD },
    max: { x: c.max.x + COVER_USE_PAD, y: c.max.y + COVER_USE_PAD },
  };
}

export function nearestFace(p, c) {
  const outside = [
    { face: "minx", d: c.min.x - p.x },
    { face: "maxx", d: p.x - c.max.x },
    { face: "miny", d: c.min.y - p.y },
    { face: "maxy", d: p.y - c.max.y },
  ];
  let best = outside[0];
  for (const f of outside) {
    if (f.d > best.d) best = f;
  }
  return best.face;
}

export function slotOnFace(c, face, hint) {
  const y = clamp(hint?.y ?? (c.min.y + c.max.y) * 0.5, c.min.y + 0.2, c.max.y - 0.2);
  const x = clamp(hint?.x ?? (c.min.x + c.max.x) * 0.5, c.min.x + 0.2, c.max.x - 0.2);
  if (face === "minx") return { x: c.min.x - COVER_STANDOFF, y };
  if (face === "maxx") return { x: c.max.x + COVER_STANDOFF, y };
  if (face === "miny") return { x, y: c.min.y - COVER_STANDOFF };
  return { x, y: c.max.y + COVER_STANDOFF };
}

export function faceInward(face) {
  if (face === "minx") return { x: 1, y: 0 };
  if (face === "maxx") return { x: -1, y: 0 };
  if (face === "miny") return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

export function canPostOver(c) {
  return (c?.height || 1) <= COVER_POST_MAX;
}

export function nearestUse(world, pos) {
  let best = null;
  let bestD = 1e9;
  (world?.map?.cover || []).forEach((c, index) => {
    if (!inUseZone(pos, c) && coverDistXY(pos, c) > COVER_USE_PAD) return;
    if (pointInCoverXY(pos, c, -0.02)) return;
    const d = coverDistXY(pos, c);
    if (d < bestD) {
      bestD = d;
      best = { cover: c, index };
    }
  });
  return best;
}

export function resolveCoverUse(world, pos, mode, prefer = null) {
  let index = prefer?.index;
  let cover = index != null ? world.map.cover[index] : null;
  if (!cover || cover.durability <= 0 || (coverDistXY(pos, cover) > COVER_USE_PAD + 0.35 && !inUseZone(pos, cover))) {
    const near = nearestUse(world, pos);
    if (!near) return null;
    cover = near.cover;
    index = near.index;
  }
  if (!inUseZone(pos, cover) && coverDistXY(pos, cover) > COVER_USE_PAD + 0.35) return null;
  if (mode === CoverMode.Post && !canPostOver(cover)) return null;
  const face = prefer?.face || nearestFace(pos, cover);
  const inward = faceInward(face);
  return {
    index,
    face,
    mode,
    lip: cover.height || 1,
    slot: slotOnFace(cover, face, pos),
    facing: Math.atan2(inward.y, inward.x),
  };
}

export function coverTransitionCost(fromMode, toMode) {
  if (fromMode === toMode) return null;
  if (toMode === CoverMode.Post && fromMode === CoverMode.Hide) {
    return { hands: 0.35, legs: 0.25, focus: 0.15, label: "post" };
  }
  if (toMode === CoverMode.Hide && fromMode === CoverMode.Post) {
    return { hands: 0.4, legs: 0.2, focus: 0.1, label: "hide" };
  }
  if (toMode === CoverMode.Post) return { hands: 0.55, legs: 0.55, focus: 0.25, label: "post" };
  return { hands: 0.45, legs: 0.5, focus: 0.15, label: "hide" };
}
