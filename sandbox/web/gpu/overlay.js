import { camBasis, project3 } from "./camera.js";
import { parseRgba } from "./theme.js";
import {
  pushBoxEdges, pushDisc, pushLabel, pushPolyline, pushRing, lineSideXY,
} from "./mesh.js";

function asXY(p, z) {
  if (Array.isArray(p)) return { x: p[0], y: p[1], z: z ?? 0.06 };
  return { x: p.x, y: p.y, z: p.z ?? z ?? 0.06 };
}

export function pushOverlayGrid(out, map) {
  if (!map?.min || !map?.max) return;
  const min = Array.isArray(map.min) ? { x: map.min[0], y: map.min[1] } : map.min;
  const max = Array.isArray(map.max) ? { x: map.max[0], y: map.max[1] } : map.max;
  const z = 0.05;
  for (let x = min.x; x <= max.x + 1e-6; x += 1) {
    const major = Math.abs(x - min.x) % 5 < 1e-6;
    pushPolyline(out, [
      { x, y: min.y, z }, { x, y: max.y, z },
    ], [0.82, 0.86, 0.90, major ? 0.2 : 0.08], major ? 0.04 : 0.022, false, lineSideXY);
  }
  for (let y = min.y; y <= max.y + 1e-6; y += 1) {
    const major = Math.abs(y - min.y) % 5 < 1e-6;
    pushPolyline(out, [
      { x: min.x, y, z }, { x: max.x, y, z },
    ], [0.82, 0.86, 0.90, major ? 0.2 : 0.08], major ? 0.04 : 0.022, false, lineSideXY);
  }
}

export function buildOverlay(out, marks, cam) {
  const basis = camBasis(cam);
  const camSide = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z || 0) - (a.z || 0);
    const cx = dy * basis.f.z - dz * basis.f.y;
    const cy = dz * basis.f.x - dx * basis.f.z;
    const cz = dx * basis.f.y - dy * basis.f.x;
    const l = Math.hypot(cx, cy, cz) || 1;
    return { x: cx / l, y: cy / l, z: cz / l };
  };

  for (const path of marks.paths || []) {
    const pts = (path.points || []).map((p) => asXY(p, path.z ?? 0.14));
    pushPolyline(out, pts, parseRgba(path.color), path.width ?? 0.11, path.dashed !== false, lineSideXY);
  }
  for (const ring of marks.rings || []) {
    pushRing(out, asXY(ring.origin, 0), ring.radius, parseRgba(ring.color), ring.width ?? 0.07, ring.z ?? 0.05);
  }
  for (const line of marks.lines || []) {
    const pts = (line.points || [line.a, line.b]).filter(Boolean).map((p) => asXY(p, p.z ?? 0.08));
    pushPolyline(out, pts, parseRgba(line.color), line.width ?? 0.05, !!line.dashed, line.ground ? lineSideXY : camSide);
  }
  for (const rect of marks.rects || []) {
    const z = rect.z ?? 0.05;
    const min = asXY(rect.min, z);
    const max = asXY(rect.max, z);
    const rgba = parseRgba(rect.color);
    const pts = [
      { x: min.x, y: min.y, z }, { x: max.x, y: min.y, z },
      { x: max.x, y: max.y, z }, { x: min.x, y: max.y, z }, { x: min.x, y: min.y, z },
    ];
    pushPolyline(out, pts, rgba, rect.width ?? 0.05, true, lineSideXY);
  }
  for (const disk of marks.disks || []) {
    pushDisc(out, asXY(disk.origin, 0), disk.radius, parseRgba(disk.color, [0.85, 0.7, 0.35, 0.22]), disk.z ?? 0.04);
  }
  for (const poly of marks.polys || []) {
    const pts = (poly.points || []).map((p) => asXY(p, p.z ?? 0.05));
    if (pts.length < 3) continue;
    const rgba = parseRgba(poly.color);
    for (let i = 1; i < pts.length - 1; i++) {
      out.push([pts[0].x, pts[0].y, pts[0].z, 0, rgba[0], rgba[1], rgba[2], rgba[3]]);
      out.push([pts[i].x, pts[i].y, pts[i].z, 0, rgba[0], rgba[1], rgba[2], rgba[3]]);
      out.push([pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, 0, rgba[0], rgba[1], rgba[2], rgba[3]]);
    }
  }
  for (const edge of marks.edges || []) {
    pushBoxEdges(out, edge.corners, parseRgba(edge.color), edge.width ?? 0.025, basis);
  }
}

export function buildLabels(out, marks, cam, w, h) {
  for (const lab of marks.labels || []) {
    const s = project3(cam, w, h, asXY(lab.pos, lab.pos?.z ?? 1.9));
    if (!s) continue;
    pushLabel(out, s, lab.text, parseRgba(lab.color, [0.91, 0.93, 0.96, 1]), lab.scale ?? 1.15);
  }
}
