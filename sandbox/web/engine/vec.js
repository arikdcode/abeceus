export function vec(x = 0, y = 0) {
  return { x, y };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function lengthSq(v) {
  return dot(v, v);
}

export function length(v) {
  return Math.sqrt(lengthSq(v));
}

export function normalize(v) {
  const l = length(v);
  if (l < 1e-8) return { x: 1, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

export function rotate(v, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function angleOf(v) {
  return Math.atan2(v.y, v.x);
}

export function clampToAabb(p, mn, mx) {
  return {
    x: Math.min(mx.x, Math.max(mn.x, p.x)),
    y: Math.min(mx.y, Math.max(mn.y, p.y)),
  };
}

export function pointInAabb(p, mn, mx) {
  return p.x >= mn.x && p.x <= mx.x && p.y >= mn.y && p.y <= mx.y;
}

export function rayAabb(o, d, mn, mx, maxT) {
  let tmin = 0;
  let tmax = maxT;
  for (let i = 0; i < 2; i++) {
    const oi = i === 0 ? o.x : o.y;
    const di = i === 0 ? d.x : d.y;
    const a = i === 0 ? mn.x : mn.y;
    const b = i === 0 ? mx.x : mx.y;
    if (Math.abs(di) < 1e-8) {
      if (oi < a || oi > b) return null;
      continue;
    }
    let t1 = (a - oi) / di;
    let t2 = (b - oi) / di;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  if (tmin > maxT || tmax < 0) return null;
  const tHit = tmin >= 0 ? tmin : tmax;
  if (tHit >= 0 && tHit <= maxT) return tHit;
  return null;
}

export function rayEllipse(o, d, c, facing, hw, hd, maxT) {
  if (hw < 1e-6 || hd < 1e-6) return null;
  const ca = Math.cos(-facing);
  const sa = Math.sin(-facing);
  const toLocal = (p) => {
    const t = sub(p, c);
    return { x: t.x * ca - t.y * sa, y: t.x * sa + t.y * ca };
  };
  const ol = toLocal(o);
  const dl = { x: d.x * ca - d.y * sa, y: d.x * sa + d.y * ca };
  ol.x /= hw;
  ol.y /= hd;
  dl.x /= hw;
  dl.y /= hd;
  const A = dot(dl, dl);
  if (A < 1e-12) return null;
  const B = 2 * dot(ol, dl);
  const C = dot(ol, ol) - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t0 = (-B - s) / (2 * A);
  const t1 = (-B + s) / (2 * A);
  let best = 1e30;
  if (t0 > 1e-4 && t0 <= maxT) best = t0;
  if (t1 > 1e-4 && t1 <= maxT && t1 < best) best = t1;
  if (best > maxT) return null;
  return best;
}
