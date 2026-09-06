export const SUN = (() => {
  const v = { x: -0.58, y: -0.34, z: 0.74 };
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
})();

export const FOG = { r: 92 / 255, g: 78 / 255, b: 62 / 255 };

export const MAX_LIGHTS = 16;
export const MAX_LAMP_SHADOWS = 8;
export const MAX_SPOT_SHADOWS = 4;
export const LAMP_FACES = 6;
export const SUN_SHADOW_SIZE = 1024;
export const LAMP_SHADOW_SIZE = 256;
export const SPOT_HALF_TAN = Math.tan((36 * Math.PI) / 180);
export const WARM_LIGHT = [1, 0.74, 0.42];

export const GROUND = {
  dirt: "#4a3d30",
  grass: "#35462a",
  gravel: "#5a5648",
  concrete: "#6e706a",
  road: "#2a2b30",
  tracks: "#3a3228",
};

export const MAT = {
  default: { spec: 0.07, shine: 16, wrap: 0.04 },
  metal: { spec: 0.46, shine: 44, wrap: 0 },
  concrete: { spec: 0.11, shine: 14, wrap: 0.02 },
  canvas: { spec: 0.035, shine: 8, wrap: 0.16 },
  wood: { spec: 0.08, shine: 12, wrap: 0.05 },
  foliage: { spec: 0.05, shine: 9, wrap: 0.38 },
  paint: { spec: 0.22, shine: 30, wrap: 0.02 },
  rubber: { spec: 0.04, shine: 7, wrap: 0.1 },
  glass: { spec: 0.62, shine: 70, wrap: 0 },
  stone: { spec: 0.07, shine: 11, wrap: 0.08 },
  dirt: { spec: 0.025, shine: 6, wrap: 0.1 },
  emit: { spec: 0, shine: 1, wrap: 0 },
};

export const TEX = {
  none: 0,
  ribs: 1,
  planks: 2,
  bags: 3,
  siding: 4,
  canvas: 5,
  mesh: 6,
  stripe: 7,
  leaves: 8,
};

export function matOf(name) {
  return MAT[name] || MAT.default;
}

export function texId(name) {
  return TEX[name] || TEX.none;
}

export function hexRgb(hex) {
  if (!hex || hex[0] !== "#") return [0.42, 0.48, 0.4];
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

export function parseRgba(color, fallback = [1, 1, 1, 1]) {
  if (!color) return fallback;
  if (color[0] === "#") {
    const rgb = hexRgb(color);
    return [rgb[0], rgb[1], rgb[2], 1];
  }
  const m = color.match(/[\d.]+/g);
  if (!m) return fallback;
  if (m.length >= 4) return [+m[0] / 255, +m[1] / 255, +m[2] / 255, +m[3]];
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255, 1];
}
