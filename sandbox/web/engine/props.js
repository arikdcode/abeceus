function xy(p, fallback = { x: 0, y: 0 }) {
  if (!p) return { ...fallback };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

function rot2(x, y, yaw) {
  const c = Math.cos(yaw || 0);
  const s = Math.sin(yaw || 0);
  return { x: x * c - y * s, y: x * s + y * c };
}

function worldAabb(localMin, localMax, pos, yaw) {
  const corners = [
    [localMin[0], localMin[1]],
    [localMin[0], localMax[1]],
    [localMax[0], localMin[1]],
    [localMax[0], localMax[1]],
  ].map(([x, y]) => {
    const r = rot2(x, y, yaw);
    return { x: r.x + pos.x, y: r.y + pos.y };
  });
  return {
    min: { x: Math.min(...corners.map((c) => c.x)), y: Math.min(...corners.map((c) => c.y)) },
    max: { x: Math.max(...corners.map((c) => c.x)), y: Math.max(...corners.map((c) => c.y)) },
  };
}

function localExtents(part, place) {
  let min = [...(part.min || [-0.5, -0.5])];
  let max = [...(part.max || [0.5, 0.5])];
  if (place.size) {
    min = [min[0] * place.size[0], min[1] * place.size[1]];
    max = [max[0] * place.size[0], max[1] * place.size[1]];
  }
  return { min, max };
}

export function isRoofBox(c) {
  if (!c) return false;
  if (c.roof || c.role === "roof") return true;
  const id = c.id || "";
  return id === "roof" || id.endsWith("-roof");
}

export function parseBox(c) {
  const z0 = c.z0 ?? 0;
  const z1 = c.z1 ?? c.height ?? 1.1;
  const blockMove = c.block_move != null ? !!c.block_move : z0 <= 0.35;
  const usable = c.usable != null ? !!c.usable : z0 <= 0.25;
  const id = c.id || null;
  const roof = !!(c.roof || c.role === "roof" || (id && (id === "roof" || id.endsWith("-roof"))));
  return {
    id,
    min: xy(c.min),
    max: xy(c.max),
    z0,
    z1,
    height: z1,
    color: c.color || "#6a7b66",
    mat: c.mat || null,
    tex: c.tex || null,
    emit: c.emit || 0,
    protection: c.protection ?? 16,
    durability: c.durability ?? 10,
    durability_max: c.durability_max ?? c.durability ?? 10,
    usable,
    block_move: blockMove,
    roof,
    role: c.role || (roof ? "roof" : null),
  };
}

export function parseSurface(s) {
  return {
    kind: s.kind || "dirt",
    min: s.min ? (Array.isArray(s.min) ? s.min : [s.min.x, s.min.y]) : null,
    max: s.max ? (Array.isArray(s.max) ? s.max : [s.max.x, s.max.y]) : null,
    color: s.color || null,
  };
}

function partId(place, part, index, partCount) {
  if (place.id && part.id) return `${place.id}-${part.id}`;
  if (place.id) return partCount > 1 ? `${place.id}-${index}` : place.id;
  return part.id || null;
}

export function instantiatePlace(def, place) {
  const pos = xy(place.pos);
  const yaw = place.yaw || 0;
  const parts = def.parts || [];
  return parts.map((part, i) => {
    const ext = localExtents(part, place);
    const aabb = worldAabb(ext.min, ext.max, pos, yaw);
    const z0 = place.z0 ?? part.z0 ?? 0;
    const z1 = place.z1 ?? part.z1 ?? part.height ?? 1;
    return {
      ...parseBox({
        id: partId(place, part, i, parts.length),
        min: [aabb.min.x, aabb.min.y],
        max: [aabb.max.x, aabb.max.y],
        z0,
        z1,
        color: place.color || part.color,
        mat: place.mat || part.mat,
        tex: place.tex || part.tex,
        emit: place.emit ?? part.emit,
        protection: place.protection ?? part.protection,
        durability: place.durability ?? part.durability,
        usable: place.usable ?? part.usable,
        block_move: place.block_move ?? part.block_move,
        roof: part.roof,
        role: part.role,
      }),
      cover: place.cover ?? part.cover ?? true,
    };
  });
}

export function instantiatePlaces(places, props) {
  const cover = [];
  const decor = [];
  for (const place of places || []) {
    const def = props?.[place.prop];
    if (!def) throw new Error(`unknown prop: ${place.prop}`);
    for (const box of instantiatePlace(def, place)) {
      if (box.cover) cover.push(box);
      else decor.push(box);
    }
  }
  return { cover, decor };
}
