// Geometry helpers for Explore World: local projection, frame shapes, clipping.
// Local space is metres with x = east, y = north, origin at the frame centre.

export type Vec2 = [number, number];
export type LngLat = [number, number];

export type ShapeKind = "square" | "circle" | "triangle" | "hexagon" | "heart" | "star" | "custom";

export type FrameShape = {
  kind: ShapeKind;
  center: LngLat;
  size: number; // metres — square width, circle diameter, triangle side; custom: longest bbox side
  rotation: number; // degrees, clockwise from north (ignored for custom)
  points?: LngLat[]; // custom outline drawn on the map, open ring
};

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function toLocal([lng, lat]: LngLat, [lng0, lat0]: LngLat): Vec2 {
  return [(lng - lng0) * mPerDegLng(lat0), (lat - lat0) * M_PER_DEG_LAT];
}

export function toLngLat([x, y]: Vec2, [lng0, lat0]: LngLat): LngLat {
  return [lng0 + x / mPerDegLng(lat0), lat0 + y / M_PER_DEG_LAT];
}

/** Frame outline in local metres — always counter-clockwise, convex only for
 *  square/circle/triangle/hexagon. Use the *Frame helpers below for clipping. */
export function shapePolygon(shape: FrameShape): Vec2[] {
  const { kind, size } = shape;
  if (kind === "custom") {
    const pts = (shape.points ?? []).map((p) => toLocal(p, shape.center));
    return pts.length >= 3 ? orient(pts, true) : [];
  }
  let pts: Vec2[];
  if (kind === "square") {
    const h = size / 2;
    pts = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
  } else if (kind === "circle") {
    const r = size / 2;
    const n = 128;
    pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r] as Vec2;
    });
  } else if (kind === "hexagon") {
    const r = size / 2;
    pts = Array.from({ length: 6 }, (_, i) => {
      const a = ((90 + i * 60) * Math.PI) / 180;
      return [Math.cos(a) * r, Math.sin(a) * r] as Vec2;
    });
  } else if (kind === "star") {
    // Fat inner radius keeps the points wide enough to print.
    const R = size / 2;
    pts = Array.from({ length: 10 }, (_, i) => {
      const a = ((90 + i * 36) * Math.PI) / 180;
      const r = i % 2 ? R * 0.5 : R;
      return [Math.cos(a) * r, Math.sin(a) * r] as Vec2;
    });
  } else if (kind === "heart") {
    // Classic parametric heart: x ∈ [-16, 16], y ∈ [-17, 12] → width = size.
    const k = size / 32;
    const n = 120;
    pts = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [x * k, (y + 2.5) * k] as Vec2;
    });
    // Parametric order is clockwise; drop the duplicate cusp points.
    pts = orient(pts, true).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  } else {
    // Equilateral triangle, side = size, centred on its centroid, apex north.
    const R = size / Math.sqrt(3);
    pts = [90, 210, 330].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return [Math.cos(a) * R, Math.sin(a) * R] as Vec2;
    });
  }
  // Clockwise-from-north rotation == negative maths rotation.
  const t = (-shape.rotation * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

export function shapeLngLatRing(shape: FrameShape): LngLat[] {
  const ring = shapePolygon(shape).map((p) => toLngLat(p, shape.center));
  if (ring.length) ring.push(ring[0]);
  return ring;
}

/** Centre (bbox middle) and size (longest bbox side, metres) of a drawn outline. */
export function customFrame(points: LngLat[]): Pick<FrameShape, "center" | "size"> {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of points) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  const center: LngLat = [(w + e) / 2, (s + n) / 2];
  const b = bounds(points.map((p) => toLocal(p, center)));
  return { center, size: Math.max(b.maxX - b.minX, b.maxY - b.minY) };
}

/** Why a drawn outline can't be used, or null when it's fine. */
export function customIssue(points: LngLat[] | undefined, maxSize: number): string | null {
  if (!points || points.length < 3) return "Add at least 3 points";
  const { center, size } = customFrame(points);
  const ring = points.map((p) => toLocal(p, center));
  if (Math.abs(signedArea(ring)) < 100) return "Shape is too small";
  if (size > maxSize) return `Shape is too large — keep it under ${formatMeters(maxSize)}`;
  if (selfIntersects(ring)) return "Edges cross each other — move a point";
  return null;
}

export function selfIntersects(ring: Vec2[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a vertex — not a crossing.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = ring[j], d = ring[(j + 1) % n];
      if (segmentT(a, b, c, d) != null) return true;
    }
  }
  return false;
}

/** Parameter along p→q where it properly crosses segment a→b, or null. */
function segmentT(p: Vec2, q: Vec2, a: Vec2, b: Vec2): number | null {
  const rx = q[0] - p[0], ry = q[1] - p[1];
  const sx = b[0] - a[0], sy = b[1] - a[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den;
  const u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

export function orient(ring: Vec2[], ccw: boolean): Vec2[] {
  return signedArea(ring) > 0 === ccw ? ring : ring.slice().reverse();
}

const convexCache = new WeakMap<Vec2[], boolean>();

/** True when a CCW ring has no reflex corners. Cached per ring array. */
export function isConvex(ring: Vec2[]): boolean {
  let c = convexCache.get(ring);
  if (c === undefined) {
    c = true;
    for (let i = 0; i < ring.length && c; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], d = ring[(i + 2) % ring.length];
      if ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]) < -1e-9) c = false;
    }
    convexCache.set(ring, c);
  }
  return c;
}

/** Inside test against the frame, fast for convex frames, exact for any shape. */
export function insideFrame(p: Vec2, clip: Vec2[]): boolean {
  return isConvex(clip) ? insideConvex(p, clip) : pointInRing(p, clip);
}

export function bounds(pts: Vec2[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function signedArea(ring: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return a / 2; // > 0 means counter-clockwise
}

export function centroid(ring: Vec2[]): Vec2 {
  let x = 0,
    y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

/** Ray-casting test, works for any simple polygon. */
export function pointInRing([px, py]: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Fast inside test for a convex CCW polygon. */
export function insideConvex(p: Vec2, clip: Vec2[]): boolean {
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < -1e-9) return false;
  }
  return true;
}

/** Sutherland–Hodgman: clip any polygon against a convex CCW polygon. */
export function clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: Vec2) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0) {
        if (sp < 0) out.push(intersect(prev, cur, sp, sc));
        out.push(cur);
      } else if (sp >= 0) {
        out.push(intersect(prev, cur, sp, sc));
      }
    }
  }
  return out;
}

function intersect(p: Vec2, q: Vec2, sp: number, sq: number): Vec2 {
  const t = sp / (sp - sq);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/** Clip a polyline against a CCW frame, returning the inside pieces. Cyrus–Beck
 *  for convex frames; concave ones split every segment at boundary crossings. */
export function clipPolyline(line: Vec2[], clip: Vec2[]): Vec2[][] {
  if (!isConvex(clip)) return clipPolylineAny(line, clip);
  const pieces: Vec2[][] = [];
  let current: Vec2[] | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const seg = clipSegment(line[i], line[i + 1], clip);
    if (!seg) {
      current = null;
      continue;
    }
    const [s, e, startClipped] = seg;
    if (!current || startClipped) {
      current = [s];
      pieces.push(current);
    }
    current.push(e);
    if (seg[3]) current = null; // end was clipped, next segment starts fresh
  }
  return pieces.filter((p) => p.length >= 2);
}

function clipPolylineAny(line: Vec2[], ring: Vec2[]): Vec2[][] {
  const b = bounds(ring);
  const pieces: Vec2[][] = [];
  let current: Vec2[] | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const p = line[i], q = line[i + 1];
    if (
      Math.max(p[0], q[0]) < b.minX || Math.min(p[0], q[0]) > b.maxX ||
      Math.max(p[1], q[1]) < b.minY || Math.min(p[1], q[1]) > b.maxY
    ) {
      current = null;
      continue;
    }
    const ts = [0, 1];
    for (let k = 0; k < ring.length; k++) {
      const t = segmentT(p, q, ring[k], ring[(k + 1) % ring.length]);
      if (t != null) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const at = (t: number): Vec2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      if (!pointInRing(at((t0 + t1) / 2), ring)) {
        current = null;
        continue;
      }
      if (!current || t0 > 1e-9) {
        current = [at(t0)];
        pieces.push(current);
      }
      current.push(at(t1));
      if (t1 < 1 - 1e-9) current = null;
    }
  }
  return pieces.filter((p) => p.length >= 2);
}

function clipSegment(p: Vec2, q: Vec2, clip: Vec2[]): [Vec2, Vec2, boolean, boolean] | null {
  let t0 = 0,
    t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    // Inward normal of a CCW edge.
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const num = nx * (p[0] - a[0]) + ny * (p[1] - a[1]);
    const den = nx * dx + ny * dy;
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [p[0] + dx * t0, p[1] + dy * t0],
    [p[0] + dx * t1, p[1] + dy * t1],
    t0 > 1e-9,
    t1 < 1 - 1e-9,
  ];
}

/** Insert points so no edge is longer than `step`. Ring is treated as closed when `closed`. */
export function densify(pts: Vec2[], step: number, closed: boolean): Vec2[] {
  const out: Vec2[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (!closed && pts.length) out.push(pts[pts.length - 1]);
  return out;
}

/** Join open way segments that share endpoints into closed rings (OSM multipolygons). */
export function assembleRings(segments: Vec2[][]): Vec2[][] {
  const eq = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  const pool = segments.filter((s) => s.length >= 2).map((s) => s.slice());
  const rings: Vec2[][] = [];
  while (pool.length) {
    let ring = pool.shift()!;
    let grew = true;
    while (!eq(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        const end = ring[ring.length - 1];
        if (eq(end, s[0])) ring = ring.concat(s.slice(1));
        else if (eq(end, s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse());
        else if (eq(ring[0], s[s.length - 1])) ring = s.slice(0, -1).concat(ring);
        else if (eq(ring[0], s[0])) ring = s.slice(1).reverse().concat(ring);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (eq(ring[0], ring[ring.length - 1])) ring.pop();
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Small deterministic PRNG so the same place always produces the same model. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 2)} km` : `${Math.round(m)} m`;
}
