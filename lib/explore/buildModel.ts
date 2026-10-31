// Turns OSM features + elevation into printable per-layer GLB files that the
// Studio configurator loads exactly like the hand-made city tiles.
//
// Coordinates: local metres, x = east, y = north. three.js is Y-up, so a local
// point (x, y) at height h becomes (x, h, -y).

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ModelFile } from "@/app/studio/actions";
import {
  bounds,
  centroid,
  clipPolygon,
  densify,
  insideFrame,
  isConvex,
  mulberry32,
  pointInRing,
  shapePolygon,
  signedArea,
  type FrameShape,
  type Vec2,
} from "./geo";
import type { Area, OsmBuilding, OsmData, Roof, RoofShape } from "./osm";
import type { HeightSampler } from "./elevation";
import type { MeshBuilding } from "./lod2";
import type { TreeTemplate } from "./trees";
import { intersection, type Pair } from "polygon-clipping";

export type ExploreLayer =
  | "terrain"
  | "main-building"
  | "small-building"
  | "roads"
  | "trees"
  | "grass"
  | "water";

export const LAYER_LABELS: Record<ExploreLayer, string> = {
  terrain: "Terrain",
  "main-building": "Main buildings",
  "small-building": "Small buildings",
  roads: "Roads",
  trees: "Trees",
  grass: "Grass & parks",
  water: "Water",
};

export type LayerSummary = { key: ExploreLayer; label: string; count: number; detail: string };

/** Target print width the min-feature sizes are tuned for. */
export const PRINT_MM = 200;

const isMainBuilding = (b: OsmBuilding) => b.main ?? (b.height >= 30 || b.footprint >= 4000);

/** Smallest building that prints as a clean block, in printed millimetres. */
const MIN_BUILDING_MM = 1.6; // footprint side, as a square
const MIN_BUILDING_WIDTH_MM = 1; // narrowest side: thinner walls print as wisps
/** Buildings standing in water (houseboats, pier sheds) smaller than this go too. */
const MIN_WATER_BUILDING_MM = 10;

/**
 * Buildings big enough to print. Drops tiny sheds, slivers and small
 * structures out on the water. Parts of one landmark stay or go together,
 * judged by the whole building, so a spire never loses its small pieces.
 */
function printableBuildings(data: OsmData, mpm: number): { osm: OsmBuilding[]; meshes: MeshBuilding[] } {
  const minArea = (MIN_BUILDING_MM * mpm) ** 2;
  const minWidth = MIN_BUILDING_WIDTH_MM * mpm;
  const waterArea = (MIN_WATER_BUILDING_MM * mpm) ** 2;
  const inWater = (p: Vec2) => data.water.some((w) => pointInRing(p, w.outer) && !w.holes.some((h) => pointInRing(p, h)));
  const ok = (area: number, width: number, centre: Vec2) =>
    area >= minArea && width >= minWidth && (area >= waterArea || !inWater(centre));

  const groups = new Map<string, { area: number; width: number; centre: Vec2 }>();
  for (const b of data.buildings) {
    if (!b.group) continue;
    const g = groups.get(b.group);
    // Width of a footprint ≈ 2·area / perimeter (exact for long thin strips).
    const width = (2 * b.footprint) / (perimeter(b.outer) || 1);
    if (!g) groups.set(b.group, { area: b.footprint, width, centre: centroid(b.outer) });
    else {
      g.area = Math.max(g.area, b.footprint);
      g.width = Math.max(g.width, width);
    }
  }
  const osm = data.buildings.filter((b) => {
    const g = b.group ? groups.get(b.group)! : null;
    if (g) return ok(g.area, g.width, g.centre);
    return ok(b.footprint, (2 * b.footprint) / (perimeter(b.outer) || 1), centroid(b.outer));
  });
  const meshes = (data.meshBuildings ?? []).filter((b) => {
    const { minX, minY, maxX, maxY } = b.box;
    return ok(b.footprint, Math.min(maxX - minX, maxY - minY), [(minX + maxX) / 2, (minY + maxY) / 2]);
  });
  return { osm, meshes };
}

type V3 = [number, number, number];
const P = (x: number, y: number, h: number): V3 => [x, h, -y];
const UP: V3 = [0, 1, 0];
const DOWN: V3 = [0, -1, 0];
/** Local horizontal direction → three.js direction. */
const dir2 = (dx: number, dy: number): V3 => [dx, 0, -dy];

/**
 * Per-vertex scale anchor, exported as the `_anchor` attribute. The Studio
 * scales each object about its own anchor — a building about its ground
 * centre, a road vertex about the ground under it — so resized objects stay
 * standing on the terrain instead of the whole layer stretching from one point.
 */
type AnchorFn = (v: V3) => V3;

class TriMesh {
  pos: number[] = [];
  anc: number[] = [];
  /** Anchor for the triangles added next; null for layers that never scale. */
  anchor: AnchorFn | null = null;

  /** Adds a triangle, flipping it if needed so its normal faces `face`. */
  tri(a: V3, b: V3, c: V3, face?: V3) {
    if (face) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * face[0] + ny * face[1] + nz * face[2] < 0) [b, c] = [c, b];
    }
    this.pos.push(...a, ...b, ...c);
    if (this.anchor) this.anc.push(...this.anchor(a), ...this.anchor(b), ...this.anchor(c));
  }

  quad(a: V3, b: V3, c: V3, d: V3, face: V3) {
    this.tri(a, b, c, face);
    this.tri(a, c, d, face);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.anc.length === this.pos.length) g.setAttribute("_anchor", new THREE.Float32BufferAttribute(this.anc, 3));
    g.computeVertexNormals();
    return g;
  }
}

type Ctx = {
  clip: Vec2[];
  mpm: number; // metres per printed millimetre
  cell: number; // terrain grid cell size, metres
  drape: number; // max edge for surfaces that follow the ground (Infinity when flat)
  H: (x: number, y: number) => number;
};

function makeCtx(shape: FrameShape, heights: HeightSampler, relief: number): Ctx {
  const clip = shapePolygon(shape);
  const b = bounds(clip);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  // Flat ground needs no dense mesh — subdividing it only bloats the file.
  const flat = heights.flat || heights.relief * relief < 1;
  const cell = span / (flat ? 48 : 200);
  return {
    clip,
    mpm: shape.size / PRINT_MM,
    cell,
    drape: flat ? Infinity : cell * 2.5,
    H: (x, y) => heights.at(x, y) * relief,
  };
}

/* ── Terrain ─────────────────────────────────────────────────────────── */

function buildTerrain(ctx: Ctx): THREE.BufferGeometry | null {
  const { clip, cell, H } = ctx;
  const m = new TriMesh();
  const b = bounds(clip);
  const base = -5 * ctx.mpm;
  const top = (p: Vec2) => P(p[0], p[1], H(p[0], p[1]));
  const convex = isConvex(clip);

  const nx = Math.ceil((b.maxX - b.minX) / cell);
  const ny = Math.ceil((b.maxY - b.minY) / cell);
  const cellOf = (p: Vec2) => [
    Math.min(nx - 1, Math.max(0, Math.floor((p[0] - b.minX) / cell))),
    Math.min(ny - 1, Math.max(0, Math.floor((p[1] - b.minY) / cell))),
  ];

  // Concave frames: only cells the outline passes through need a real clip;
  // every other cell is wholly inside or outside. Samples ≤ cell/4 apart can
  // only skip a cell by cutting its corner, which the diagonal marks cover.
  const edge = new Set<number>();
  if (!convex) {
    const pts = densify(clip, cell / 4, true);
    for (let k = 0; k < pts.length; k++) {
      const [ia, ja] = cellOf(pts[k]);
      const [ib, jb] = cellOf(pts[(k + 1) % pts.length]);
      for (const [i, j] of [[ia, ja], [ib, jb], [ia, jb], [ib, ja]]) edge.add(j * nx + i);
    }
  }

  const emit = (poly: Vec2[]) => {
    for (let k = 1; k < poly.length - 1; k++) m.tri(top(poly[0]), top(poly[k]), top(poly[k + 1]), UP);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = b.minX + i * cell, x1 = x0 + cell;
      const y0 = b.minY + j * cell, y1 = y0 + cell;
      const tris: Vec2[][] = [
        [[x0, y0], [x1, y0], [x1, y1]],
        [[x0, y0], [x1, y1], [x0, y1]],
      ];
      if (convex) {
        for (const t of tris) emit(t.every((p) => insideFrame(p, clip)) ? t : clipPolygon(t, clip));
      } else if (!edge.has(j * nx + i)) {
        if (insideFrame([(x0 + x1) / 2, (y0 + y1) / 2], clip)) tris.forEach(emit);
      } else {
        for (const t of tris) for (const piece of clipToFrame(t, clip)) triangulate(piece).forEach(emit);
      }
    }
  }

  const ring = densify(clip, cell / 2, true);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const c = ring[(k + 1) % ring.length];
    const out = dir2(c[1] - a[1], -(c[0] - a[0]));
    m.quad(P(a[0], a[1], base), P(c[0], c[1], base), top(c), top(a), out);
  }
  for (const [a, c, d] of triangulate(clip)) {
    m.tri(P(a[0], a[1], base), P(c[0], c[1], base), P(d[0], d[1], base), DOWN);
  }
  return m.geometry();
}

/** Intersection of a convex piece with a concave frame — hole-free, possibly several parts. */
function clipToFrame(poly: Vec2[], clip: Vec2[]): Vec2[][] {
  const close = (r: Vec2[]): Pair[] => [...r, r[0]];
  try {
    return intersection([close(poly)], [close(clip)]).map((p) => p[0].slice(0, -1) as Vec2[]);
  } catch {
    return [];
  }
}

function triangulate(ring: Vec2[]): Vec2[][] {
  if (ring.length === 3) return [ring];
  return THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []).map(
    ([i, j, k]) => [ring[i], ring[j], ring[k]]
  );
}

/* ── Draped slabs: grass, water areas ────────────────────────────────── */

function subdivide(a: Vec2, b: Vec2, c: Vec2, maxEdge: number, out: Vec2[][], depth = 0) {
  const d2 = (p: Vec2, q: Vec2) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  const longest = Math.max(d2(a, b), d2(b, c), d2(c, a));
  if (depth >= 7 || longest <= maxEdge * maxEdge) {
    out.push([a, b, c]);
    return;
  }
  const mid = (p: Vec2, q: Vec2): Vec2 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
  subdivide(a, ab, ca, maxEdge, out, depth + 1);
  subdivide(ab, b, bc, maxEdge, out, depth + 1);
  subdivide(ca, bc, c, maxEdge, out, depth + 1);
  subdivide(ab, bc, ca, maxEdge, out, depth + 1);
}

function drapedArea(m: TriMesh, area: Area, ctx: Ctx, topOff: number, botOff: number) {
  const { H } = ctx;
  const maxEdge = ctx.drape;
  const contour = area.outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const holes = area.holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
  const all = [...area.outer, ...area.holes.flat()];
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);

  const tris: Vec2[][] = [];
  for (const [i, j, k] of faces) subdivide(all[i], all[j], all[k], maxEdge, tris);
  const at = (p: Vec2, off: number) => P(p[0], p[1], H(p[0], p[1]) + off);
  for (const [a, b, c] of tris) {
    m.tri(at(a, topOff), at(b, topOff), at(c, topOff), UP);
    m.tri(at(a, botOff), at(b, botOff), at(c, botOff), DOWN);
  }

  // Outer ring is CCW and holes are CW, so the right-hand normal always
  // points away from the slab's material.
  for (const ring of [area.outer, ...area.holes]) {
    const pts = densify(ring, maxEdge, true);
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      const c = pts[(k + 1) % pts.length];
      const out = dir2(c[1] - a[1], -(c[0] - a[0]));
      m.quad(at(a, botOff), at(c, botOff), at(c, topOff), at(a, topOff), out);
    }
  }
}

/* ── Ribbons: roads, rivers ──────────────────────────────────────────── */

/** Pull a ribbon edge point back inside the frame along its cross-section. */
function keepInside(p: Vec2, center: Vec2, clip: Vec2[]): Vec2 {
  if (insideFrame(p, clip)) return p;
  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) {
    const t = (lo + hi) / 2;
    const q: Vec2 = [center[0] + (p[0] - center[0]) * t, center[1] + (p[1] - center[1]) * t];
    if (insideFrame(q, clip)) lo = t;
    else hi = t;
  }
  return [center[0] + (p[0] - center[0]) * lo, center[1] + (p[1] - center[1]) * lo];
}

function ribbon(m: TriMesh, line: Vec2[], width: number, ctx: Ctx, topOff: number, botOff: number) {
  const { H, clip } = ctx;
  const pts = densify(line, ctx.drape, false).filter(
    (p, i, arr) => i === 0 || Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) > 1e-3
  );
  if (pts.length < 2) return;
  const hw = width / 2;
  const L: Vec2[] = [];
  const R: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // Miter: widen at corners so the ribbon keeps its width, capped for hairpins.
    let miter = 1;
    if (i > 0 && i < pts.length - 1) {
      const ax = pts[i][0] - prev[0], ay = pts[i][1] - prev[1];
      const al = Math.hypot(ax, ay) || 1;
      const cos = (ax / al) * tx + (ay / al) * ty;
      miter = Math.min(2, 1 / Math.max(0.5, cos));
    }
    const nx = -ty * hw * miter, ny = tx * hw * miter;
    L.push(keepInside([pts[i][0] + nx, pts[i][1] + ny], pts[i], clip));
    R.push(keepInside([pts[i][0] - nx, pts[i][1] - ny], pts[i], clip));
  }
  const at = (p: Vec2, off: number) => P(p[0], p[1], H(p[0], p[1]) + off);
  for (let i = 0; i < pts.length - 1; i++) {
    const tx = pts[i + 1][0] - pts[i][0], ty = pts[i + 1][1] - pts[i][1];
    m.quad(at(L[i], topOff), at(R[i], topOff), at(R[i + 1], topOff), at(L[i + 1], topOff), UP);
    m.quad(at(L[i], botOff), at(R[i], botOff), at(R[i + 1], botOff), at(L[i + 1], botOff), DOWN);
    m.quad(at(L[i], botOff), at(L[i + 1], botOff), at(L[i + 1], topOff), at(L[i], topOff), dir2(-ty, tx));
    m.quad(at(R[i], botOff), at(R[i + 1], botOff), at(R[i + 1], topOff), at(R[i], topOff), dir2(ty, -tx));
  }
  // End caps face away from the neighbouring point.
  const n = pts.length - 1;
  for (const [i, j] of [[0, 1], [n, n - 1]]) {
    const face = dir2(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
    m.quad(at(L[i], botOff), at(R[i], botOff), at(R[i], topOff), at(L[i], topOff), face);
  }
}

/* ── Buildings ───────────────────────────────────────────────────────── */

/** Closed vertical prism of an OSM footprint from `bottom` to `top`. */
function prism(m: TriMesh, b: Area, bottom: number, top: number) {
  floor(m, b, bottom);
  surface(m, b, () => top);
  for (const ring of [b.outer, ...b.holes]) walls(m, ring, bottom, () => top);
}

function floor(m: TriMesh, a: Area, z: number) {
  const all = [...a.outer, ...a.holes.flat()];
  for (const [i, j, k] of triangulateArea(a)) {
    m.tri(P(all[i][0], all[i][1], z), P(all[j][0], all[j][1], z), P(all[k][0], all[k][1], z), DOWN);
  }
}

/** Upward-facing surface over an area, each vertex at `h(p)`. */
function surface(m: TriMesh, a: Area, h: (p: Vec2) => number) {
  const all = [...a.outer, ...a.holes.flat()];
  const at = (p: Vec2) => P(p[0], p[1], h(p));
  for (const [i, j, k] of triangulateArea(a)) m.tri(at(all[i]), at(all[j]), at(all[k]), UP);
}

function triangulateArea(a: Area): number[][] {
  return THREE.ShapeUtils.triangulateShape(
    a.outer.map((p) => new THREE.Vector2(p[0], p[1])),
    a.holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])))
  );
}

/** Vertical walls under a ring whose top edge follows `h(p)`. Outer rings are
 *  CCW and holes CW, so the right-hand normal always points out of the solid. */
function walls(m: TriMesh, ring: Vec2[], bottom: number, h: (p: Vec2) => number) {
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const c = ring[(k + 1) % ring.length];
    m.quad(P(a[0], a[1], bottom), P(c[0], c[1], bottom), P(c[0], c[1], h(c)), P(a[0], a[1], h(a)), dir2(c[1] - a[1], -(c[0] - a[0])));
  }
}

/* Roofs. Every sloped roof is a height function over the footprint that is
   planar inside a few regions (two halves for a gable, four for a hip). The
   footprint is cut into those regions so ridges and hips stay crisp, and the
   walls get extra corners where a crease meets them (gable ends). */

type RoofFrame = { o: Vec2; a: Vec2; n: Vec2; halfL: number; halfW: number };

const compassVec = (deg: number): Vec2 => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];

/** Oriented box of a footprint: `a` along the ridge, `n` across it. */
function roofFrame(ring: Vec2[], roof: Roof): RoofFrame {
  let a: Vec2 = [1, 0];
  const tagged = roof.direction != null && roof.shape !== "skillion";
  if (tagged) {
    const d = compassVec(roof.direction!);
    a = [d[1], -d[0]]; // ridge runs perpendicular to the slope direction
  } else {
    let best = 0;
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k], q = ring[(k + 1) % ring.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len > best) {
        best = len;
        a = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      }
    }
  }
  const box = (ax: Vec2): RoofFrame => {
    const nx: Vec2 = [-ax[1], ax[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of ring) {
      const u = p[0] * ax[0] + p[1] * ax[1];
      const v = p[0] * nx[0] + p[1] * nx[1];
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const o: Vec2 = [ax[0] * cu + nx[0] * cv, ax[1] * cu + nx[1] * cv];
    return { o, a: ax, n: nx, halfL: (u1 - u0) / 2, halfW: (v1 - v0) / 2 };
  };
  let f = box(a);
  // Untagged ridges run along the long side, or across it when asked.
  if (!tagged && (f.halfW > f.halfL) !== !!roof.across) f = box([-a[1], a[0]]);
  return f;
}

const uvOf = (f: RoofFrame, p: Vec2): Vec2 => {
  const dx = p[0] - f.o[0], dy = p[1] - f.o[1];
  return [dx * f.a[0] + dy * f.a[1], dx * f.n[0] + dy * f.n[1]];
};
const fromUv = (f: RoofFrame, [u, v]: Vec2): Vec2 => [
  f.o[0] + f.a[0] * u + f.n[0] * v,
  f.o[1] + f.a[1] * u + f.n[1] * v,
];

/** Insert the points where a ring crosses each crease line (uv: nu·u + nv·v = d). */
function cutRing(ring: Vec2[], f: RoofFrame, lines: [number, number, number][]): Vec2[] {
  const out: Vec2[] = [];
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k], q = ring[(k + 1) % ring.length];
    out.push(p);
    const up = uvOf(f, p), uq = uvOf(f, q);
    const ts: number[] = [];
    for (const [nu, nv, d] of lines) {
      const sp = nu * up[0] + nv * up[1] - d;
      const sq = nu * uq[0] + nv * uq[1] - d;
      if ((sp < -1e-6 && sq > 1e-6) || (sp > 1e-6 && sq < -1e-6)) ts.push(sp / (sp - sq));
    }
    ts.sort((x, y) => x - y);
    for (const t of ts) out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  return out;
}

/** Footprint ∩ each region (given in uv), as roof pieces. */
function regionPieces(b: Area, f: RoofFrame, regions: Vec2[][]): Area[] {
  const close = (r: Vec2[]): Pair[] => [...r, r[0]];
  const subject = [b.outer, ...b.holes].map(close);
  const pieces: Area[] = [];
  for (const reg of regions) {
    try {
      for (const poly of intersection(subject, [close(reg.map((p) => fromUv(f, p)))])) {
        const rings = poly.map((r) => r.slice(0, -1) as Vec2[]);
        if (rings[0].length >= 3) pieces.push({ outer: rings[0], holes: rings.slice(1) });
      }
    } catch {
      /* degenerate sliver — skip it */
    }
  }
  return pieces;
}

/** Every edge of a CCW ring sees `c` — needed for fans and domes. */
function starShaped(ring: Vec2[], c: Vec2) {
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k], q = ring[(k + 1) % ring.length];
    if ((p[0] - c[0]) * (q[1] - c[1]) - (p[1] - c[1]) * (q[0] - c[0]) <= 1e-9) return false;
  }
  return true;
}

function areaCentroid(ring: Vec2[]): Vec2 {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cr = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cr;
    x += (ring[j][0] + ring[i][0]) * cr;
    y += (ring[j][1] + ring[i][1]) * cr;
  }
  return Math.abs(a) < 1e-9 ? ring[0] : [x / (3 * a), y / (3 * a)];
}

function perimeter(ring: Vec2[]) {
  let s = 0;
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k], q = ring[(k + 1) % ring.length];
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return s;
}

// [radius scale, height fraction] from the eave up to the tip.
const PYRAMID_PROFILE: Vec2[] = [[1, 0], [0, 1]];
const DOME_PROFILE: Vec2[] = Array.from({ length: 9 }, (_, k) => {
  const t = (k / 8) * (Math.PI / 2);
  return [Math.cos(t), Math.sin(t)] as Vec2;
});
// Bulges past the walls, then tapers to a point.
const ONION_PROFILE: Vec2[] = [[1, 0], [1.12, 0.12], [1.18, 0.28], [1.05, 0.48], [0.75, 0.66], [0.42, 0.8], [0.16, 0.92], [0, 1]];

/** Roof height as a multiple of the half-width when OSM gives none. */
const DEFAULT_PITCH: Record<RoofShape, number> = {
  flat: 0,
  skillion: 0.4,
  gabled: 0.6,
  hipped: 0.6,
  pyramidal: 0.9,
  dome: 1,
  onion: 1.7,
};

/** One building: floor, walls and its roof. Falls back to a simpler roof when
 *  the footprint can't carry the tagged one (holes, not star-shaped). */
function roofedSolid(m: TriMesh, b: OsmBuilding, bottom: number, top: number) {
  const roof = b.roof;
  if (!roof || roof.shape === "flat") return prism(m, b, bottom, top);
  const f = roofFrame(b.outer, roof);
  const rh = Math.min(roof.height ?? DEFAULT_PITCH[roof.shape] * f.halfW, (top - bottom) * 0.85);
  if (rh < 0.3) return prism(m, b, bottom, top);
  const eave = top - rh;
  let shape = roof.shape;
  const c = areaCentroid(b.outer);
  if ((shape === "dome" || shape === "onion" || shape === "pyramidal") && (b.holes.length || !starShaped(b.outer, c))) {
    shape = "hipped";
  }

  if (shape === "skillion") {
    const d = roof.direction != null ? compassVec(roof.direction) : f.n;
    let d0 = Infinity, d1 = -Infinity;
    for (const p of b.outer) {
      const t = p[0] * d[0] + p[1] * d[1];
      d0 = Math.min(d0, t);
      d1 = Math.max(d1, t);
    }
    // The slope faces `direction`: eave height at the front, full height at the back.
    const h = (p: Vec2) => eave + (rh * (d1 - (p[0] * d[0] + p[1] * d[1]))) / Math.max(1e-6, d1 - d0);
    floor(m, b, bottom);
    surface(m, b, h);
    for (const ring of [b.outer, ...b.holes]) walls(m, ring, bottom, h);
    return;
  }

  if (shape === "pyramidal" || shape === "dome" || shape === "onion") {
    const ring = shape === "pyramidal" ? b.outer : densify(b.outer, perimeter(b.outer) / 48, true);
    floor(m, { outer: ring, holes: [] }, bottom);
    walls(m, ring, bottom, () => eave);
    const profile = shape === "pyramidal" ? PYRAMID_PROFILE : shape === "dome" ? DOME_PROFILE : ONION_PROFILE;
    const at = (p: Vec2, [s, z]: Vec2): V3 => P(c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s, eave + rh * z);
    for (let k = 0; k < profile.length - 1; k++) {
      const lo = profile[k], hi = profile[k + 1];
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        const out = dir2((p[0] + q[0]) / 2 - c[0], (p[1] + q[1]) / 2 - c[1]);
        const face: V3 = [out[0], 0.5, out[2]];
        if (hi[0] < 1e-6) m.tri(at(p, lo), at(q, lo), at(p, hi), face);
        else m.quad(at(p, lo), at(q, lo), at(q, hi), at(p, hi), face);
      }
    }
    return;
  }

  // Gabled / hipped. Regions overshoot the box by `e`; hip lines keep 45°.
  const { halfL, halfW } = f;
  const r = Math.max(0, halfL - halfW);
  const e = halfW * 0.05 + 0.05;
  const L = halfL + e, W = halfW + e;
  let h: (p: Vec2) => number;
  let regions: Vec2[][];
  let lines: [number, number, number][];
  if (shape === "gabled") {
    h = (p) => eave + rh * Math.max(0, 1 - Math.abs(uvOf(f, p)[1]) / halfW);
    regions = [
      [[-L, 0], [L, 0], [L, W], [-L, W]],
      [[-L, -W], [L, -W], [L, 0], [-L, 0]],
    ];
    lines = [[0, 1, 0]];
  } else {
    h = (p) => {
      const [u, v] = uvOf(f, p);
      return eave + rh * Math.max(0, Math.min(halfW - Math.abs(v), halfL - Math.abs(u)) / halfW);
    };
    regions = [
      [[-r, 0], [r, 0], [L, W], [-L, W]],
      [[-L, -W], [L, -W], [r, 0], [-r, 0]],
      [[r, 0], [L, -W], [L, W]],
      [[-r, 0], [-L, W], [-L, -W]],
    ];
    lines = [[0, 1, 0], [1, -1, r], [1, 1, r], [1, 1, -r], [1, -1, -r]];
  }
  const pieces = regionPieces(b, f, regions);
  if (!pieces.length) return prism(m, b, bottom, top);
  floor(m, b, bottom);
  for (const pc of pieces) surface(m, pc, h);
  for (const ring of [b.outer, ...b.holes]) walls(m, cutRing(ring, f, lines), bottom, h);
}

function buildBuildings(list: OsmBuilding[], ctx: Ctx): TriMesh {
  const { H, mpm } = ctx;
  const sink = 0.4 * mpm;
  const m = new TriMesh();

  // Ground span and centre per building. Parts of one building share them, so
  // stacked parts meet on sloped ground and scale as one object in the Studio.
  type Site = { gMin: number; gMax: number; minX: number; maxX: number; minY: number; maxY: number };
  const sites = new Map<string, Site>();
  const siteOf = (b: OsmBuilding, key: string) => {
    let s = sites.get(key);
    if (!s) {
      s = { gMin: Infinity, gMax: -Infinity, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      sites.set(key, s);
    }
    for (const p of b.outer) {
      const g = H(p[0], p[1]);
      s.gMin = Math.min(s.gMin, g);
      s.gMax = Math.max(s.gMax, g);
      s.minX = Math.min(s.minX, p[0]);
      s.maxX = Math.max(s.maxX, p[0]);
      s.minY = Math.min(s.minY, p[1]);
      s.maxY = Math.max(s.maxY, p[1]);
    }
    return s;
  };
  const kept = list;
  const keys = kept.map((b, i) => b.group ?? `#${i}`);
  kept.forEach((b, i) => siteOf(b, keys[i]));

  kept.forEach((b, i) => {
    const { gMin, gMax, minX, maxX, minY, maxY } = sites.get(keys[i])!;
    // A few metres of min_height (e.g. tower legs tagged from 4 m) would leave
    // the part floating in print — stand it on the ground instead.
    const lifted = b.minHeight >= 6;
    const height = Math.max(b.height, b.minHeight + 1.2 * mpm);
    const bottom = lifted ? gMin + b.minHeight : gMin - sink;
    const top = gMax + height;
    const anchor = P((minX + maxX) / 2, (minY + maxY) / 2, gMin);
    m.anchor = () => anchor;
    roofedSolid(m, b, bottom, top);
  });
  return m;
}

/** Measured LOD2 meshes, set on the terrain like OSM buildings: the lowest
 *  ground under the footprint, with the base pushed slightly into it. */
function buildMeshBuildings(list: MeshBuilding[], ctx: Ctx, m: TriMesh) {
  const { H, mpm } = ctx;
  const sink = 0.4 * mpm;
  for (const b of list) {
    const { minX, minY, maxX, maxY } = b.box;
    let ground = Infinity;
    const t = b.tris;
    for (let i = 0; i < t.length; i += 3) if (t[i + 2] < 0.5) ground = Math.min(ground, H(t[i], t[i + 1]));
    if (!Number.isFinite(ground)) ground = H((minX + maxX) / 2, (minY + maxY) / 2);
    const anchor = P((minX + maxX) / 2, (minY + maxY) / 2, ground);
    m.anchor = () => anchor;
    const at = (i: number): V3 => P(t[i], t[i + 1], t[i + 2] < 0.3 ? ground - sink : ground + t[i + 2]);
    for (let i = 0; i < t.length; i += 9) m.tri(at(i), at(i + 3), at(i + 6));
  }
}

const isMainMesh = (b: MeshBuilding) => b.height >= 30 || b.footprint >= 4000;

/* ── Trees ───────────────────────────────────────────────────────────── */

/** Printed tree height. Smaller trees print as blobs or snap off the plate. */
export const TREE_PRINT_MM = 6;
const MAX_TREES = 6000;
/** Total triangles the tree layer may hold, so dense parks don't explode the file. */
const TREE_TRI_BUDGET = 800_000;

/** What planning needs to know about the tree model: its crown radius
 *  (fraction of height) and how many triangles one copy costs. */
export type TreeSpec = { radius: number; triangles: number };

/** The built-in cone tree, used until a model from R2 has loaded. */
function coneTemplate(): THREE.BufferGeometry {
  const crown = new THREE.ConeGeometry(0.34, 0.78, 7).translate(0, 0.22 + 0.39, 0);
  const trunk = new THREE.CylinderGeometry(0.07, 0.09, 0.3, 5).translate(0, 0.1, 0);
  const g = mergeGeometries([crown, trunk].map((x) => {
    x.deleteAttribute("uv");
    x.deleteAttribute("normal");
    return x;
  }))!;
  g.computeVertexNormals();
  return g;
}
const CONE_SPEC: TreeSpec = { radius: 0.34, triangles: 40 };

const treeHeight = (mpm: number) => Math.max(8, TREE_PRINT_MM * mpm);

/** Spatial index of what trees must keep clear of: buildings, roads, water. */
function obstacles(data: OsmData, cellSize: number) {
  type Seg = { ax: number; ay: number; bx: number; by: number; pad: number };
  type Poly = { area: Area; box: ReturnType<typeof bounds> };
  const segs = new Map<string, Seg[]>();
  const polys = new Map<string, Poly[]>();
  const key = (ix: number, iy: number) => `${ix},${iy}`;
  const cells = (minX: number, minY: number, maxX: number, maxY: number, fn: (k: string) => void) => {
    for (let iy = Math.floor(minY / cellSize); iy <= Math.floor(maxY / cellSize); iy++)
      for (let ix = Math.floor(minX / cellSize); ix <= Math.floor(maxX / cellSize); ix++) fn(key(ix, iy));
  };
  const addSeg = (a: Vec2, b: Vec2, pad: number) => {
    const s = { ax: a[0], ay: a[1], bx: b[0], by: b[1], pad };
    const r = pad + cellSize; // reach of the widest clearance we test with
    cells(Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, (k) => {
      const l = segs.get(k);
      if (l) l.push(s);
      else segs.set(k, [s]);
    });
  };
  const addPoly = (area: Area) => {
    const box = bounds(area.outer);
    const p = { area, box };
    cells(box.minX, box.minY, box.maxX, box.maxY, (k) => {
      const l = polys.get(k);
      if (l) l.push(p);
      else polys.set(k, [p]);
    });
    for (const ring of [area.outer, ...area.holes])
      for (let i = 0; i < ring.length; i++) addSeg(ring[i], ring[(i + 1) % ring.length], 0);
  };
  for (const b of data.buildings) addPoly(b);
  for (const b of data.meshBuildings ?? []) {
    const { minX, minY, maxX, maxY } = b.box;
    addPoly({ outer: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]], holes: [] });
  }
  for (const a of data.water) addPoly(a);
  for (const r of [...data.roads, ...data.waterLines])
    for (let i = 1; i < r.line.length; i++) addSeg(r.line[i - 1], r.line[i], r.width / 2);

  /** True when a crown of radius `clear` centred on p would touch an obstacle. */
  return (p: Vec2, clear: number) => {
    const k = key(Math.floor(p[0] / cellSize), Math.floor(p[1] / cellSize));
    for (const { area, box } of polys.get(k) ?? []) {
      if (p[0] < box.minX || p[0] > box.maxX || p[1] < box.minY || p[1] > box.maxY) continue;
      if (pointInRing(p, area.outer) && !area.holes.some((h) => pointInRing(p, h))) return true;
    }
    for (const s of segs.get(k) ?? []) {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - s.ax) * dx + (p[1] - s.ay) * dy) / len2));
      if (Math.hypot(p[0] - s.ax - t * dx, p[1] - s.ay - t * dy) < s.pad + clear) return true;
    }
    return false;
  };
}

/**
 * Every tree position the model will contain: mapped single trees and rows,
 * forests filled edge to edge, and open grass and parks planted in loose
 * groves. Scattered trees keep clear of buildings, roads and water.
 */
export function planTrees(data: OsmData, shape: FrameShape, tree: TreeSpec = CONE_SPEC): Vec2[] {
  const mpm = shape.size / PRINT_MM;
  const clip = shapePolygon(shape);
  const treeH = treeHeight(mpm);
  const r = tree.radius * treeH; // crown radius, metres
  const maxTrees = Math.min(MAX_TREES, Math.floor(TREE_TRI_BUDGET / Math.max(1, tree.triangles)));
  const inFrame = (p: Vec2) =>
    insideFrame([p[0] + r, p[1]], clip) &&
    insideFrame([p[0] - r, p[1]], clip) &&
    insideFrame([p[0], p[1] + r], clip) &&
    insideFrame([p[0], p[1] - r], clip);
  const blocked = obstacles(data, Math.max(20, r * 4));

  // Occupancy grid: no two trees closer than `gap`, so crowns touch but
  // never merge into one shapeless lump.
  const gap = r * 1.15;
  const taken = new Map<string, Vec2[]>();
  const out: Vec2[] = [];
  const place = (p: Vec2) => {
    const ix = Math.floor(p[0] / gap), iy = Math.floor(p[1] / gap);
    for (let y = iy - 1; y <= iy + 1; y++)
      for (let x = ix - 1; x <= ix + 1; x++)
        for (const q of taken.get(`${x},${y}`) ?? []) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < gap) return false;
    const k = `${ix},${iy}`;
    const l = taken.get(k);
    if (l) l.push(p);
    else taken.set(k, [p]);
    out.push(p);
    return true;
  };

  // Mapped trees are real — keep every one that fits, only off rooftops.
  const real: Vec2[] = [...data.trees];
  for (const row of data.treeRows) real.push(...densify(row, gap, false));
  for (const p of real) {
    if (out.length >= maxTrees) return out;
    if (inFrame(p) && !blocked(p, 0)) place(p);
  }

  const rnd = mulberry32(Math.round(shape.center[0] * 1e5) ^ Math.round(shape.center[1] * 1e5));
  const areaOf = (list: Area[]) => list.reduce((s, a) => s + Math.abs(signedArea(a.outer)), 0);
  const forests = new Set(data.treeAreas);
  // Pitches and lawns too small for a proper tree stay open.
  const lawns = data.grass.filter((a) => !forests.has(a) && !a.open && Math.abs(signedArea(a.outer)) > Math.PI * (r * 3) ** 2);
  const left = () => maxTrees - out.length;

  // Jittered grid over an area; spacing grows when the area would overflow the budget.
  const scatter = (areas: Area[], spacing: number, keep: (p: Vec2) => boolean): Vec2[] => {
    const pts: Vec2[] = [];
    for (const a of areas) {
      const bb = bounds(a.outer);
      for (let y = bb.minY + spacing / 2; y < bb.maxY; y += spacing) {
        for (let x = bb.minX + spacing / 2; x < bb.maxX; x += spacing) {
          const p: Vec2 = [x + (rnd() - 0.5) * spacing * 0.8, y + (rnd() - 0.5) * spacing * 0.8];
          if (!pointInRing(p, a.outer) || a.holes.some((h) => pointInRing(p, h))) continue;
          if (keep(p) && inFrame(p) && !blocked(p, r * 0.6)) pts.push(p);
        }
      }
    }
    // Shuffle, so trimming to the budget thins evenly instead of dropping whole areas.
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    return pts;
  };

  const forestArea = areaOf([...forests]);
  const lawnArea = areaOf(lawns);
  // Forests are dense (crowns touching); parks get about a third of that, in groves.
  const share = forestArea + lawnArea / 3 || 1;
  const fit = (density: number) => Math.sqrt((forestArea * density + lawnArea * density / 3) / share);
  // Slightly under-spaced: obstacles and the occupancy check reject some candidates.
  const budgetSpacing = 0.8 * Math.sqrt(share / Math.max(1, left()));
  const forestSpacing = Math.max(r * 1.9, budgetSpacing * fit(1) * 0.95);
  const lawnSpacing = Math.max(r * 2, forestSpacing * 1.1);

  for (const p of scatter([...forests], forestSpacing, () => true)) {
    if (!left()) return out;
    place(p);
  }
  // Low-frequency waves split lawns into groves and open meadow.
  const phase = rnd() * 100;
  const grove = (p: Vec2) => {
    const w = r * 14;
    const n = Math.sin(p[0] / w + phase) * Math.sin(p[1] / (w * 0.8) - phase) + 0.5 * Math.sin((p[0] + p[1]) / (w * 0.55));
    return rnd() < 0.25 + 0.7 * Math.max(0, n + 0.3);
  };
  for (const p of scatter(lawns, lawnSpacing, grove)) {
    if (!left()) return out;
    place(p);
  }
  return out;
}

function buildTrees(points: Vec2[], ctx: Ctx, seed: number, template?: THREE.BufferGeometry): THREE.BufferGeometry | null {
  if (!points.length) return null;
  // Unit-tall tree, base at y = 0. Indexed, so every copy shares its welded vertices.
  const tpl = template ?? coneTemplate();
  const indexed = tpl.index ? tpl : mergeVertices(tpl, 1e-6);
  const tp = indexed.getAttribute("position").array as ArrayLike<number>;
  const tn = indexed.getAttribute("normal").array as ArrayLike<number>;
  const ti = indexed.index!.array as ArrayLike<number>;
  const nv = tp.length / 3;

  const treeH = treeHeight(ctx.mpm);
  const rnd = mulberry32(seed);
  const pos = new Float32Array(tp.length * points.length);
  const nrm = new Float32Array(tn.length * points.length);
  const anc = new Float32Array(tp.length * points.length);
  const idx = new Uint32Array(ti.length * points.length);
  points.forEach(([x, y], i) => {
    const s = treeH * (0.85 + rnd() * 0.3);
    const a = rnd() * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const h = ctx.H(x, y);
    // Sink the trunk a little so it stays planted on sloped ground.
    const ground = h - 0.06 * s;
    const o = i * tp.length;
    for (let k = 0; k < tp.length; k += 3) {
      const vx = tp[k], vz = tp[k + 2];
      pos[o + k] = x + (vx * c - vz * sn) * s;
      pos[o + k + 1] = ground + tp[k + 1] * s;
      pos[o + k + 2] = -y + (vx * sn + vz * c) * s;
      const nx = tn[k], nz = tn[k + 2];
      nrm[o + k] = nx * c - nz * sn;
      nrm[o + k + 1] = tn[k + 1];
      nrm[o + k + 2] = nx * sn + nz * c;
      // Each tree grows from the ground under its trunk.
      anc[o + k] = x;
      anc[o + k + 1] = h;
      anc[o + k + 2] = -y;
    }
    const io = i * ti.length, vo = i * nv;
    for (let k = 0; k < ti.length; k++) idx[io + k] = ti[k] + vo;
  });
  if (!template) tpl.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("_anchor", new THREE.BufferAttribute(anc, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/* ── Public API ──────────────────────────────────────────────────────── */

export function summarize(data: OsmData, shape: FrameShape, heights: HeightSampler, tree?: TreeSpec): LayerSummary[] {
  const { osm, meshes } = printableBuildings(data, shape.size / PRINT_MM);
  const mainMesh = meshes.filter(isMainMesh).length;
  const main = osm.filter(isMainBuilding).length + mainMesh;
  const small = osm.length + meshes.length - main;
  const roadKm = data.roads.reduce((s, r) => {
    let len = 0;
    for (let i = 1; i < r.line.length; i++) {
      len += Math.hypot(r.line[i][0] - r.line[i - 1][0], r.line[i][1] - r.line[i - 1][1]);
    }
    return s + len;
  }, 0) / 1000;
  const trees = planTrees(data, shape, tree).length;
  const water = data.water.length + data.waterLines.length;

  const list: LayerSummary[] = [
    {
      key: "terrain",
      label: LAYER_LABELS.terrain,
      count: 1,
      detail: heights.flat ? "Flat base" : `${Math.round(heights.relief)} m relief`,
    },
  ];
  // Tile buildings are footprints merged into blocks, so their count means little.
  const roofs = osm.filter((b) => b.roof).length;
  const note = data.lod2
    ? ` · ${meshes.length} measured (${data.lod2.name})`
    : data.detailed
      ? roofs
        ? ` · ${roofs} shaped roofs`
        : ""
      : " · flat roofs (detail tiles unavailable)";
  if (main) list.push({ key: "main-building", label: LAYER_LABELS["main-building"], count: main, detail: `${main} landmark / tall${data.detailed ? "" : " · simplified"}` });
  if (small) list.push({ key: "small-building", label: LAYER_LABELS["small-building"], count: small, detail: data.detailed ? `${small} buildings${note}` : `Building blocks${note}` });
  if (data.roads.length) list.push({ key: "roads", label: LAYER_LABELS.roads, count: data.roads.length, detail: `${roadKm.toFixed(1)} km` });
  if (trees) list.push({ key: "trees", label: LAYER_LABELS.trees, count: trees, detail: `${trees} trees` });
  if (data.grass.length) list.push({ key: "grass", label: LAYER_LABELS.grass, count: data.grass.length, detail: `${data.grass.length} areas` });
  if (water) list.push({ key: "water", label: LAYER_LABELS.water, count: water, detail: `${water} features` });
  return list;
}

const SMOOTH_LAYERS = new Set<ExploreLayer>(["terrain", "grass", "water", "roads"]);

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function buildExploreModel(
  shape: FrameShape,
  data: OsmData,
  heights: HeightSampler,
  opts: { relief: number; tree?: TreeTemplate },
  onProgress?: (label: string) => void
): Promise<ModelFile[]> {
  const ctx = makeCtx(shape, heights, opts.relief);
  const { mpm } = ctx;
  const layers: { key: ExploreLayer; geom: THREE.BufferGeometry | null }[] = [];

  onProgress?.("Sculpting terrain");
  await tick();
  layers.push({ key: "terrain", geom: buildTerrain(ctx) });

  onProgress?.("Raising buildings");
  await tick();
  const { osm, meshes } = printableBuildings(data, mpm);
  const mainM = buildBuildings(osm.filter(isMainBuilding), ctx);
  buildMeshBuildings(meshes.filter(isMainMesh), ctx, mainM);
  layers.push({ key: "main-building", geom: mainM.geometry() });
  await tick();
  const smallM = buildBuildings(osm.filter((b) => !isMainBuilding(b)), ctx);
  buildMeshBuildings(meshes.filter((b) => !isMainMesh(b)), ctx, smallM);
  layers.push({ key: "small-building", geom: smallM.geometry() });

  onProgress?.("Laying roads");
  await tick();
  const roads = new TriMesh();
  roads.anchor = (v) => [v[0], ctx.H(v[0], -v[2]), v[2]];
  const minRoad = 0.7 * mpm;
  for (const r of data.roads) ribbon(roads, r.line, Math.max(r.width, minRoad), ctx, 0.45 * mpm, -0.4 * mpm);
  layers.push({ key: "roads", geom: roads.geometry() });

  onProgress?.("Planting greenery");
  await tick();
  const grass = new TriMesh();
  for (const a of data.grass) drapedArea(grass, a, ctx, 0.3 * mpm, -0.4 * mpm);
  layers.push({ key: "grass", geom: grass.geometry() });
  const seed = Math.round(shape.center[0] * 1e4) ^ Math.round(shape.center[1] * 1e4);
  layers.push({ key: "trees", geom: buildTrees(planTrees(data, shape, opts.tree), ctx, seed, opts.tree?.geometry) });

  onProgress?.("Filling water");
  await tick();
  const water = new TriMesh();
  water.anchor = (v) => [v[0], ctx.H(v[0], -v[2]), v[2]];
  for (const a of data.water) drapedArea(water, a, ctx, 0.35 * mpm, -0.5 * mpm);
  for (const l of data.waterLines) ribbon(water, l.line, Math.max(l.width, minRoad), ctx, 0.35 * mpm, -0.5 * mpm);
  layers.push({ key: "water", geom: water.geometry() });

  onProgress?.("Packing layers");
  await tick();
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const exporter = new GLTFExporter();
  const files: ModelFile[] = [];
  for (const { key, geom: raw } of layers) {
    if (!raw || !raw.getAttribute("position")?.count) continue;
    // Ground-hugging layers: weld shared corners (≈5× smaller files, smooth
    // shading). Buildings and trees keep crisp per-face normals.
    let geom = raw;
    if (SMOOTH_LAYERS.has(key)) {
      raw.deleteAttribute("normal");
      geom = mergeVertices(raw, 1e-4);
      geom.computeVertexNormals();
      raw.dispose();
    }
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ color: "#e9e6df", roughness: 0.6, metalness: 0.05 })
    );
    mesh.name = key;
    // Exported as glTF extras → userData in the Studio: the terrain's bottom is
    // one flat plane, the only part that moves when the base is thickened.
    if (key === "terrain") mesh.userData.flatBase = true;
    scene.add(mesh);
    const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
    geom.dispose();
    const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
    files.push({ name: `${key}.glb`, url, ext: "glb", layer: key, isSubPart: false, partKey: key, partName: LAYER_LABELS[key] });
    await tick();
  }
  return files;
}
