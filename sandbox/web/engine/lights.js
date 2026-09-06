function hexRgb(hex) {
  if (!hex || hex[0] !== "#") return [1, 0.74, 0.42];
  if (hex.length === 4) {
    return [
      parseInt(hex[1] + hex[1], 16) / 255,
      parseInt(hex[2] + hex[2], 16) / 255,
      parseInt(hex[3] + hex[3], 16) / 255,
    ];
  }
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function xy(p, fallback = { x: 0, y: 0 }) {
  if (!p) return { ...fallback };
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x ?? fallback.x, y: p.y ?? fallback.y };
}

function vec3(v, fallback = { x: 0, y: 0, z: 0 }) {
  if (!v) return { ...fallback };
  if (Array.isArray(v)) return { x: v[0] || 0, y: v[1] || 0, z: v[2] || 0 };
  return { x: v.x || 0, y: v.y || 0, z: v.z || 0 };
}

function rotYaw(v, yaw) {
  const c = Math.cos(yaw || 0);
  const s = Math.sin(yaw || 0);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export function coneCos(angleDeg, penumbraDeg = 10) {
  const outer = Math.max(4, angleDeg ?? 36);
  const inner = Math.max(1, outer - Math.max(0, penumbraDeg ?? 10));
  return {
    outerCos: Math.cos((outer * Math.PI) / 180),
    innerCos: Math.cos((inner * Math.PI) / 180),
  };
}

export function parseLight(spec) {
  if (!spec) throw new Error("light spec missing");
  const kind = spec.kind === "spot" ? "spot" : "omni";
  const rgb = hexRgb(spec.color || "#e8c86a");
  const dir = vec3(spec.dir);
  const cone = kind === "spot" ? coneCos(spec.angle, spec.penumbra) : { outerCos: 0.42, innerCos: 0.78 };
  const dlen = Math.hypot(dir.x, dir.y, dir.z);
  return {
    id: spec.id,
    name: spec.name || spec.id,
    kind,
    color: spec.color || "#e8c86a",
    r: rgb[0],
    g: rgb[1],
    b: rgb[2],
    intensity: spec.intensity ?? 1.6,
    range: spec.range ?? (kind === "spot" ? 10 : 14),
    z: spec.z ?? (kind === "spot" ? 1.2 : 3.2),
    dir: dlen > 0.01 ? { x: dir.x / dlen, y: dir.y / dlen, z: dir.z / dlen } : { x: 0, y: 0, z: kind === "spot" ? -1 : 0 },
    angle: spec.angle ?? 36,
    penumbra: spec.penumbra ?? 10,
    parts: spec.parts || [],
    ...cone,
  };
}

export function placeLight(spec, place) {
  const base = parseLight(spec);
  const pos = xy(place.pos);
  const yaw = place.yaw || 0;
  const dir = rotYaw(place.dir ? vec3(place.dir) : base.dir, yaw);
  const dlen = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const cone = place.angle != null || place.penumbra != null
    ? coneCos(place.angle ?? base.angle, place.penumbra ?? base.penumbra)
    : { outerCos: base.outerCos, innerCos: base.innerCos };
  const rgb = place.color ? hexRgb(place.color) : [base.r, base.g, base.b];
  return {
    id: place.id || base.id,
    light: base.id,
    kind: base.kind,
    x: pos.x,
    y: pos.y,
    z: place.z ?? base.z,
    range: place.range ?? base.range,
    r: rgb[0],
    g: rgb[1],
    b: rgb[2],
    intensity: place.intensity ?? base.intensity,
    dx: base.kind === "spot" ? dir.x / dlen : 0,
    dy: base.kind === "spot" ? dir.y / dlen : 0,
    dz: base.kind === "spot" ? dir.z / dlen : 0,
    outerCos: cone.outerCos,
    innerCos: cone.innerCos,
  };
}

export function instantiateLights(places, catalog) {
  const out = [];
  for (const place of places || []) {
    const spec = catalog?.[place.light];
    if (!spec) throw new Error(`unknown light: ${place.light}`);
    out.push(placeLight(spec, place));
  }
  return out;
}

function isPolePart(part) {
  return part?.role === "pole" || part?.id === "pole";
}

export function instantiateLightFixtures(places, catalog, instantiatePlace) {
  const boxes = [];
  for (const place of places || []) {
    const spec = catalog?.[place.light];
    const parts = spec?.parts;
    if (!parts?.length) continue;
    const skipPole = place.pole === false;
    const zOff = place.z_off || 0;
    const glow = place.color || spec.color;
    const shifted = [];
    for (const part of parts) {
      if (skipPole && isPolePart(part)) continue;
      const next = { ...part };
      if (zOff) {
        next.z0 = (part.z0 ?? 0) + zOff;
        next.z1 = (part.z1 ?? part.height ?? 1) + zOff;
      }
      if (part.mat === "emit" && glow) next.color = glow;
      shifted.push(next);
    }
    if (!shifted.length) continue;
    const placed = instantiatePlace({ parts: shifted }, {
      id: place.id,
      pos: place.pos,
      yaw: place.yaw || 0,
    });
    for (const box of placed) {
      box.cover = false;
      box.usable = false;
      box.block_move = false;
      boxes.push(box);
    }
  }
  return boxes;
}
