// Printable picture frame for a city tile, sized to the tile's print size.
//
// Built like the hand-made sample frame: a border around a pocket the tile
// drops into, a ledge (or solid back) it rests on, and a keyhole hanger cut
// into the back of the top rail. The frame prints face-up with its back on
// the bed, so geometry is in millimetres, Z up, back at z = 0, centred on XY.
//
// The body is one swept surface: a cross-section profile (inset from the outer
// edge, height) is placed on rounded-rectangle rings that all share the same
// sample layout, so neighbouring rings stitch into clean quads. Textures and
// the nameplate displace the front face's vertices in Z.

import * as THREE from "three";

export type FrameProfile = "flat" | "chamfer" | "rounded" | "stepped" | "cove";
export type LabelFont = "sans" | "serif" | "mono";
export type FrameTexture = "smooth" | "wood" | "reeded" | "crackle" | "hammered" | "knurl";

export type FrameOptions = {
  border: number; // rail width, mm
  depth: number; // total thickness, mm
  radius: number; // outer corner radius, mm (≤ border)
  profile: FrameProfile;
  texture: FrameTexture;
  textureDepth: number; // mm carved into the face
  textureScale: number; // 1 = default pattern size
  back: "open" | "solid";
  lip: number; // ledge the tile rests on, open back only, mm
  backThickness: number; // ledge / back panel thickness, mm
  clearance: number; // gap around the tile on each side, mm
  hanger: boolean;
  label: string; // nameplate text on the bottom rail, "" for none
  labelSize: number; // letter height, mm; 0 picks one to suit the rail
  labelColor: string; // letters print as their own part in this colour
  labelFont: LabelFont;
  color: string;
};

export const FRAME_DEFAULTS: FrameOptions = {
  border: 15,
  depth: 20,
  radius: 0,
  profile: "flat",
  texture: "smooth",
  textureDepth: 0.6,
  textureScale: 1,
  back: "open",
  lip: 10,
  backThickness: 1.5,
  clearance: 0.3,
  hanger: true,
  label: "",
  labelSize: 0,
  labelColor: "#FFFFFF",
  labelFont: "sans",
  color: "#000000",
};

export const PROFILE_LABELS: Record<FrameProfile, string> = {
  flat: "Flat",
  chamfer: "Chamfer",
  rounded: "Rounded",
  stepped: "Stepped",
  cove: "Cove",
};

export const TEXTURE_LABELS: Record<FrameTexture, string> = {
  smooth: "Smooth",
  wood: "Wood grain",
  reeded: "Lines",
  crackle: "Cracks",
  hammered: "Hammered",
  knurl: "Diamond",
};

export const FONT_LABELS: Record<LabelFont, string> = { sans: "Sans", serif: "Serif", mono: "Mono" };

const FONT_STACKS: Record<LabelFont, string> = {
  sans: '700 {px}px "Inter", "Helvetica Neue", Arial, sans-serif',
  serif: '700 {px}px Georgia, "Times New Roman", serif',
  mono: '700 {px}px "SF Mono", Menlo, Consolas, monospace',
};

/** Letters stand this far proud of the frame face, mm (four 0.2 mm layers). */
const LABEL_RAISE = 0.8;

/** Narrowest rail that still has room for the keyhole and its walls. */
export const MIN_HANGER_BORDER = 15;

export type FrameSize = { w: number; d: number; h: number; opening: { w: number; d: number } };

export function frameSize(tile: { w: number; d: number }, o: FrameOptions): FrameSize {
  const ow = tile.w + o.clearance * 2;
  const od = tile.d + o.clearance * 2;
  return { w: ow + o.border * 2, d: od + o.border * 2, h: o.depth, opening: { w: ow, d: od } };
}

/** Height above the frame's back where the tile's base sits. */
export const seatHeight = (o: FrameOptions) => o.backThickness;

/* ── Textures ─────────────────────────────────────────────────────────── */

function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise(x * f, y * f);
    f *= 2;
    amp *= 0.5;
  }
  return v;
}

/** Distances to the nearest and second-nearest feature point of a jittered grid. */
function worley(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = Infinity, f2 = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const px = cx + hash(cx, cy), py = cy + hash(cy * 1.7, cx * 0.3);
      const dd = Math.hypot(px - x, py - y);
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
      } else if (dd < f2) f2 = dd;
    }
  }
  return [f1, f2];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Surface height in [0, 1] (1 = the untouched face) at a point on the frame.
 * `along` runs down the length of the rail the point is on and `across` over
 * its width, so grain and lines follow each rail and meet at mitred corners.
 */
export function textureHeight(t: FrameTexture, x: number, y: number, along: number, across: number, scale: number) {
  const s = Math.max(0.25, scale);
  switch (t) {
    case "smooth":
      return 1;
    case "wood": {
      // Growth rings: stripes along the rail, bent by low-frequency noise,
      // with fine fibre streaks running the same way.
      const warp = 2.2 * fbm(along * 0.025 / s, across * 0.18 / s, 3) + 0.6 * fbm(along * 0.12 / s, across * 0.6 / s, 2);
      const ring = 0.5 + 0.5 * Math.sin(((across / (1.9 * s)) + warp * 2.4) * Math.PI);
      const fibre = valueNoise(along * 0.35 / s, across * 3.2 / s);
      return Math.min(1, 0.25 + 0.75 * Math.pow(ring, 0.55) * (0.78 + 0.22 * fibre));
    }
    case "reeded": {
      // Rounded flutes running along each rail.
      const p = 1.8 * s;
      const f = (((across / p) % 1) + 1) % 1;
      return Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2));
    }
    case "crackle": {
      // Thin cracks along cell borders; a little noise breaks up the cells.
      const cell = 7 * s;
      const nx = x / cell + 0.35 * fbm(x * 0.08 / s, y * 0.08 / s, 2);
      const ny = y / cell + 0.35 * fbm(y * 0.08 / s + 9, x * 0.08 / s, 2);
      const [f1, f2] = worley(nx, ny);
      return smooth(0.02, 0.09, f2 - f1);
    }
    case "hammered": {
      const cell = 4.5 * s;
      const [f1] = worley(x / cell, y / cell);
      return Math.min(1, 0.15 + f1 * f1 * 1.6);
    }
    case "knurl": {
      // Diamond pyramids, like a knurled grip.
      const p = 2.4 * s;
      const tri = (v: number) => Math.abs(((((v / p) % 1) + 1) % 1) * 2 - 1);
      return 1 - Math.min(tri(x + y), tri(x - y));
    }
  }
}

/* ── Profile ──────────────────────────────────────────────────────────── */

/** One cross-section point: inset from the outer edge, height above the back. */
type PP = { u: number; z: number; face?: boolean };

/** Outer side and front face, from the back's outer edge to the pocket's rim. */
function frontProfile(o: FrameOptions): PP[] {
  const B = o.border, D = o.depth;
  const c = Math.min(B * 0.3, D * 0.3, 4);
  switch (o.profile) {
    case "flat":
      return [{ u: 0, z: 0 }, { u: 0, z: D, face: true }, { u: B, z: D, face: true }];
    case "chamfer":
      return [{ u: 0, z: 0 }, { u: 0, z: D - c }, { u: c, z: D, face: true }, { u: B, z: D, face: true }];
    case "rounded": {
      const R = Math.min(B * 0.45, D * 0.45, 6);
      const pts: PP[] = [{ u: 0, z: 0 }, { u: 0, z: D - R }];
      for (let k = 1; k <= 10; k++) {
        const a = (k / 10) * (Math.PI / 2);
        pts.push({ u: R - R * Math.cos(a), z: D - R + R * Math.sin(a), face: k === 10 });
      }
      pts.push({ u: B, z: D, face: true });
      return pts;
    }
    case "stepped": {
      const step = Math.min(2.5, D * 0.2);
      const m = B * 0.5;
      return [
        { u: 0, z: 0 },
        { u: 0, z: D, face: true },
        { u: m, z: D, face: true },
        { u: m, z: D - step },
        { u: m + 0.01, z: D - step, face: true },
        { u: B, z: D - step, face: true },
      ];
    }
    case "cove": {
      // Flat outer band, then a concave sweep down toward the opening.
      const h = Math.min(4, D * 0.3);
      const m = B * 0.35;
      const pts: PP[] = [{ u: 0, z: 0 }, { u: 0, z: D, face: true }, { u: m, z: D, face: true }];
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        pts.push({ u: m + t * (B - m), z: D - h * Math.sqrt(1 - (1 - t) ** 2), face: true });
      }
      return pts;
    }
  }
}

/** Splits long face segments so the texture has vertices to move. */
function densify(pts: PP[], step: number): PP[] {
  const out: PP[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a.face && b.face) {
      const len = Math.hypot(b.u - a.u, b.z - a.z);
      const n = Math.ceil(len / step);
      for (let k = 1; k < n; k++) out.push({ u: a.u + ((b.u - a.u) * k) / n, z: a.z + ((b.z - a.z) * k) / n, face: true });
    }
    out.push(b);
  }
  return out;
}

/* ── Rings ────────────────────────────────────────────────────────────── */

type Layout = { nx: number; ny: number; m: number };

/** Rounded rectangle sampled with a fixed layout: every ring has the same
 *  point count, so ring i and ring i+1 stitch index for index. */
function ring(hw: number, hd: number, rad: number, L: Layout): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const sx = hw - rad, sy = hd - rad;
  const arc = (cx: number, cy: number, a0: number) => {
    for (let k = 0; k <= L.m; k++) {
      const a = a0 + (k / L.m) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + rad * Math.cos(a), cy + rad * Math.sin(a)));
    }
  };
  const side = (ax: number, ay: number, bx: number, by: number, n: number) => {
    for (let k = 1; k < n; k++) pts.push(new THREE.Vector2(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n));
  };
  arc(sx, sy, 0);
  side(sx, hd, -sx, hd, L.nx);
  arc(-sx, sy, Math.PI / 2);
  side(-hw, sy, -hw, -sy, L.ny);
  arc(-sx, -sy, Math.PI);
  side(-sx, -hd, sx, -hd, L.nx);
  arc(sx, -sy, (3 * Math.PI) / 2);
  side(hw, -sy, hw, sy, L.ny);
  return pts;
}

/* ── Nameplate ────────────────────────────────────────────────────────── */

/** Letter outlines in frame millimetres, plus the box they occupy. */
type Plate = { cx: number; cy: number; w: number; h: number; shapes: THREE.Shape[] };

/** Usable band of the bottom rail for letters: [inset from outer edge, width]. */
function labelBand(o: FrameOptions): [number, number] {
  const B = o.border, D = o.depth;
  switch (o.profile) {
    case "stepped":
      return [0, B * 0.5]; // the raised outer step
    case "chamfer": {
      const c = Math.min(B * 0.3, D * 0.3, 4);
      return [c, B - c];
    }
    case "rounded": {
      const R = Math.min(B * 0.45, D * 0.45, 6);
      return [R, B - R];
    }
    default:
      return [0, B];
  }
}

/** Largest letter height that fits the rail. */
export const maxLabelSize = (o: FrameOptions) => Math.max(2, labelBand(o)[1] * 0.75);
/** Letter height used when the user hasn't picked one. */
export const autoLabelSize = (o: FrameOptions) => Math.max(2, labelBand(o)[1] * 0.42);

/**
 * Draws the label on a canvas and traces the ink into vector outlines
 * (marching squares at 50 % coverage), so the letters become a clean solid
 * that prints in its own colour.
 */
function nameplate(o: FrameOptions, railY: number, maxW: number): Plate | null {
  const text = o.label.trim();
  if (typeof document === "undefined" || !text) return null;
  const PX = 14; // canvas pixels per mm
  const cap = Math.min(o.labelSize > 0 ? o.labelSize : autoLabelSize(o), maxLabelSize(o));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const font = (px: number) => FONT_STACKS[o.labelFont].replace("{px}", px.toFixed(1));
  // Cap height is roughly 0.72 of the font size for these faces.
  let fontPx = (cap / 0.72) * PX;
  ctx.font = font(fontPx);
  let tw = ctx.measureText(text).width;
  if (tw > maxW * PX) {
    fontPx *= (maxW * PX) / tw;
    ctx.font = font(fontPx);
    tw = ctx.measureText(text).width;
  }
  const pad = 4;
  const W = Math.ceil(tw) + pad * 2;
  const H = Math.ceil(fontPx * 1.35) + pad * 2;
  canvas.width = W;
  canvas.height = H;
  ctx.font = font(fontPx);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2 + fontPx * 0.04);
  const data = ctx.getImageData(0, 0, W, H).data;
  const val = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : data[(j * W + i) * 4 + 3] / 255);

  const wMm = W / PX, hMm = H / PX;
  // Pixel centre (i + 0.5, j + 0.5) → frame mm; canvas y runs down, frame y up.
  const toMm = (x: number, y: number) => new THREE.Vector2((x + 0.5) / PX - wMm / 2, railY + hMm / 2 - (y + 0.5) / PX);

  const loops = traceContours(val, W, H).map((l) => simplifyLoop(l.map(([x, y]) => toMm(x, y)), 0.01));
  // Specks and hairline slivers (gaps a pixel wide) are far below a nozzle
  // line, and the extruder can't cap them cleanly either.
  const printable = (l: THREE.Vector2[]) => {
    const area = Math.abs(THREE.ShapeUtils.area(l));
    let perim = 0;
    for (let i = 0; i < l.length; i++) perim += l[i].distanceTo(l[(i + 1) % l.length]);
    return l.length >= 4 && area > 0.08 && (2 * area) / perim > 0.1;
  };
  const shapes = loopsToShapes(loops.filter(printable));
  if (!shapes.length) return null;
  return { cx: 0, cy: railY, w: wMm, h: hMm, shapes };
}

/** Closed iso-0.5 contours of a sampled field, in pixel coordinates. */
function traceContours(v: (i: number, j: number) => number, W: number, H: number): [number, number][][] {
  const iso = 0.5;
  const segs = new Map<string, { to: string; p: [number, number] }>();
  const lerp = (a: number, b: number) => (iso - a) / (b - a || 1e-9);

  for (let j = -1; j < H; j++) {
    for (let i = -1; i < W; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      const code = (a >= iso ? 8 : 0) | (b >= iso ? 4 : 0) | (c >= iso ? 2 : 0) | (d >= iso ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const E: Record<string, [string, [number, number]]> = {
        T: [`h${i},${j}`, [i + lerp(a, b), j]],
        R: [`v${i + 1},${j}`, [i + 1, j + lerp(b, c)]],
        B: [`h${i},${j + 1}`, [i + lerp(d, c), j + 1]],
        L: [`v${i},${j}`, [i, j + lerp(a, d)]],
      };
      const centre = (a + b + c + d) / 4 >= iso;
      const pairs: Record<number, string[][]> = {
        1: [["L", "B"]], 2: [["B", "R"]], 3: [["L", "R"]], 4: [["T", "R"]],
        5: centre ? [["T", "L"], ["R", "B"]] : [["T", "R"], ["L", "B"]],
        6: [["T", "B"]], 7: [["T", "L"]], 8: [["T", "L"]], 9: [["T", "B"]],
        10: centre ? [["T", "R"], ["L", "B"]] : [["T", "L"], ["R", "B"]],
        11: [["T", "R"]], 12: [["L", "R"]], 13: [["R", "B"]], 14: [["L", "B"]],
      };
      const corners: [number, number, boolean][] = [
        [i, j, a >= iso],
        [i + 1, j, b >= iso],
        [i + 1, j + 1, c >= iso],
        [i, j + 1, d >= iso],
      ];
      for (const [e1, e2] of pairs[code]) {
        let [k1, p1] = E[e1], [k2, p2] = E[e2];
        // Orient every segment with the ink on its left (positive cross), so
        // they chain into loops. Decided from the corners, not by sampling:
        // a corner the segment cuts off on its own (or either of a 2–2 split)
        // tells which side is ink.
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        const side = corners.map(([cx, cy, inside]) => ({ left: dx * (cy - p1[1]) - dy * (cx - p1[0]) > 0, inside }));
        const lefts = side.filter((c) => c.left), rights = side.filter((c) => !c.left);
        const inkLeft = lefts.length === 1 ? lefts[0].inside : rights.length === 1 ? !rights[0].inside : lefts[0].inside;
        if (!inkLeft) {
          [k1, k2] = [k2, k1];
          [p1, p2] = [p2, p1];
        }
        segs.set(k1, { to: k2, p: p1 });
      }
    }
  }
  const loops: [number, number][][] = [];
  const seen = new Set<string>();
  for (const start of segs.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let k = start;
    while (!seen.has(k) && segs.has(k)) {
      seen.add(k);
      const s = segs.get(k)!;
      loop.push(s.p);
      k = s.to;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Drops points that sit within `tol` of the line through their neighbours. */
function simplifyLoop(pts: THREE.Vector2[], tol: number): THREE.Vector2[] {
  let out = pts;
  for (let pass = 0; pass < 3; pass++) {
    const next: THREE.Vector2[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = next.length ? next[next.length - 1] : out[out.length - 1];
      const b = out[i], c = out[(i + 1) % out.length];
      const abx = c.x - a.x, aby = c.y - a.y;
      const d = Math.abs((b.x - a.x) * aby - (b.y - a.y) * abx) / (Math.hypot(abx, aby) || 1);
      if (d > tol || out.length - (i - next.length) <= 4) next.push(b);
    }
    out = next;
  }
  return out;
}

/** Groups outlines into shapes with holes (the counters of a, o, e…) by nesting depth. */
function loopsToShapes(loops: THREE.Vector2[][]): THREE.Shape[] {
  const inside = (p: THREE.Vector2, l: THREE.Vector2[]) => {
    let c = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      if (l[i].y > p.y !== l[j].y > p.y && p.x < ((l[j].x - l[i].x) * (p.y - l[i].y)) / (l[j].y - l[i].y) + l[i].x) c = !c;
    }
    return c;
  };
  const area = (l: THREE.Vector2[]) => Math.abs(THREE.ShapeUtils.area(l));
  const info = loops.map((l, i) => ({
    l,
    parents: loops.map((m, k) => k).filter((k) => k !== i && inside(l[0], loops[k])),
  }));
  const shapes = new Map<number, THREE.Shape>();
  info.forEach((n, i) => {
    if (n.parents.length % 2 === 0) shapes.set(i, new THREE.Shape(n.l));
  });
  info.forEach((n) => {
    if (n.parents.length % 2 === 1) {
      // The hole belongs to the smallest outline around it.
      const owner = n.parents.filter((k) => shapes.has(k)).sort((a, b) => area(loops[a]) - area(loops[b]))[0];
      if (owner !== undefined) shapes.get(owner)!.holes.push(new THREE.Path(n.l));
    }
  });
  return [...shapes.values()];
}

/* ── Build ────────────────────────────────────────────────────────────── */

export type FrameBuild = {
  geometry: THREE.BufferGeometry;
  /** Nameplate letters as a separate solid, for printing in a second colour. */
  text: THREE.BufferGeometry | null;
  size: FrameSize;
};

export async function buildFrame(tile: { w: number; d: number }, o: FrameOptions): Promise<FrameBuild> {
  const size = frameSize(tile, o);
  const hw = size.w / 2, hd = size.d / 2;
  const B = o.border;
  const r = Math.min(Math.max(0, o.radius), B);
  const detailed = o.texture !== "smooth";
  const step = detailed ? 0.4 : 2;

  // Cross-section, as one closed loop for an open back, or open with two caps
  // (pocket floor, back panel) for a solid back.
  const front = frontProfile(o);
  const rimZ = front[front.length - 1].z;
  const T = o.backThickness;
  let loop: PP[];
  const solid = o.back === "solid";
  if (solid) {
    loop = [{ u: B, z: T }, { u: B, z: rimZ }, ...front.slice().reverse()];
  } else {
    const lip = Math.min(o.lip, Math.min(size.opening.w, size.opening.d) / 2 - 5);
    loop = [...front, { u: B, z: T }, { u: B + lip, z: T }, { u: B + lip, z: 0 }];
  }
  // A repeated point would make a zero-width strip of slivers.
  loop = densify(loop, step).filter((p, i, a) => i === 0 || Math.hypot(p.u - a[i - 1].u, p.z - a[i - 1].z) > 1e-6);
  // Face arc length from each end, for fading the texture out at the edges.
  const faceIdx = loop.map((p, i) => (p.face ? i : -1)).filter((i) => i >= 0);
  const faceDist = new Map<number, number>();
  {
    let acc = 0;
    const along: number[] = [];
    for (let k = 0; k < faceIdx.length; k++) {
      if (k) acc += Math.hypot(loop[faceIdx[k]].u - loop[faceIdx[k - 1]].u, loop[faceIdx[k]].z - loop[faceIdx[k - 1]].z);
      along.push(acc);
    }
    faceIdx.forEach((i, k) => faceDist.set(i, Math.min(along[k], acc - along[k])));
  }

  const L: Layout = {
    nx: Math.max(1, Math.ceil((2 * (hw - r)) / step)),
    ny: Math.max(1, Math.ceil((2 * (hd - r)) / step)),
    m: Math.max(r > 0 ? 12 : 1, Math.ceil(((Math.PI / 2) * r) / step)),
  };

  // Letters sit centred on the flat band of the bottom rail.
  const [bandU, bandW] = labelBand(o);
  const plate = nameplate(o, -(hd - bandU - bandW / 2), Math.min(size.opening.w * 0.75, 2 * hw - 2 * B));
  const amp = o.texture === "smooth" ? 0 : Math.max(0, o.textureDepth);

  const pos: number[] = [];
  const rings: number[][] = [];
  const vert = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };

  loop.forEach((p, li) => {
    const pts = ring(hw - p.u, hd - p.u, Math.max(0, r - p.u), L);
    const fade = p.face ? smooth(0, 1.2, faceDist.get(li) ?? 0) : 0;
    const idx: number[] = [];
    let last: THREE.Vector2 | null = null;
    for (const q of pts) {
      // Square corners collapse a corner's samples onto one point: share it,
      // so no zero-area triangles reach the slicer.
      if (last && last.distanceToSquared(q) < 1e-12) {
        idx.push(idx[idx.length - 1]);
        continue;
      }
      last = q;
      let z = p.z;
      if (p.face && fade > 0) {
        const dx = hw - Math.abs(q.x), dy = hd - Math.abs(q.y);
        const onRail = dy < dx; // top/bottom rail vs left/right stile (mitred)
        const along = onRail ? q.x : q.y;
        const across = onRail ? dy : dx;
        let a = amp;
        if (plate) {
          const inX = Math.abs(q.x - plate.cx) - plate.w / 2;
          const inY = Math.abs(q.y - plate.cy) - plate.h / 2;
          // A smooth band under the letters keeps them readable on any texture.
          a *= smooth(0, 1.5, Math.max(inX, inY));
        }
        if (a > 0) z -= a * (1 - textureHeight(o.texture, q.x, q.y, along, across, o.textureScale)) * fade;

      }
      idx.push(vert(q.x, q.y, z));
    }
    // The first and last samples may also coincide.
    if (pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-12) idx[idx.length - 1] = idx[0];
    rings.push(idx);
  });

  const index: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    if (a !== b && b !== c && a !== c) index.push(a, b, c);
  };
  const N = rings[0].length;
  // Rings run counter-clockwise; walking the open-back profile outward-first
  // gives outward normals, the solid-back profile runs the other way.
  const strip = (A: number[], Bn: number[]) => {
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      if (solid) {
        tri(A[j], Bn[j1], A[j1]);
        tri(A[j], Bn[j], Bn[j1]);
      } else {
        tri(A[j], A[j1], Bn[j1]);
        tri(A[j], Bn[j1], Bn[j]);
      }
    }
  };
  for (let i = 0; i + 1 < rings.length; i++) strip(rings[i], rings[i + 1]);

  /** Flat face at a ring-loop's height: outer loop minus holes, facing up or down. */
  const cap = (outer: number[], holes: number[][], up: boolean) => {
    const clean = (l: number[]) => l.filter((v, i) => v !== l[(i + l.length - 1) % l.length]);
    const loops = [clean(outer), ...holes.map(clean)];
    const v2 = (i: number) => new THREE.Vector2(pos[i * 3], pos[i * 3 + 1]);
    const flat = loops.flat();
    const faces = THREE.ShapeUtils.triangulateShape(loops[0].map(v2), loops.slice(1).map((l) => l.map(v2)));
    for (const [a, b, c] of faces) {
      const A = flat[a], Bv = flat[b], C = flat[c];
      const cross =
        (pos[Bv * 3] - pos[A * 3]) * (pos[C * 3 + 1] - pos[A * 3 + 1]) -
        (pos[Bv * 3 + 1] - pos[A * 3 + 1]) * (pos[C * 3] - pos[A * 3]);
      if (cross > 0 === up) tri(A, Bv, C);
      else tri(A, C, Bv);
    }
  };

  const backRing = solid ? rings[rings.length - 1] : rings[0];
  const backHoles: number[][] = solid ? [] : [rings[rings.length - 1]];
  const hanger = o.hanger && B >= MIN_HANGER_BORDER && o.depth >= 10;
  if (hanger) backHoles.push(keyhole(hd - B / 2, o, vert, tri));
  cap(backRing, backHoles, false);
  if (solid) cap(rings[0], [], true); // pocket floor

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  if (signedVolume(g) < 0) flip(g);
  g.computeVertexNormals();

  // Letters run from just inside the face to LABEL_RAISE above its highest
  // point. In Bambu Studio the frame part comes first, so it claims the
  // buried bit and the letters print exactly on the face.
  let text: THREE.BufferGeometry | null = null;
  if (plate) {
    // Face height across the letters' span of the rail, from the profile
    // (the texture is smoothed away under them).
    const faceZ = (u: number) => {
      let z = -Infinity;
      for (let i = 1; i < front.length; i++) {
        const a = front[i - 1], b = front[i];
        if (u < Math.min(a.u, b.u) - 1e-6 || u > Math.max(a.u, b.u) + 1e-6) continue;
        z = Math.max(z, b.u === a.u ? Math.max(a.z, b.z) : a.z + ((b.z - a.z) * (u - a.u)) / (b.u - a.u));
      }
      return z;
    };
    let plateLo = Infinity, plateHi = -Infinity;
    const u0 = hd - (plate.cy + plate.h / 2), u1 = hd - (plate.cy - plate.h / 2);
    for (let k = 0; k <= 24; k++) {
      const z = faceZ(Math.max(0, Math.min(B, u0 + ((u1 - u0) * k) / 24)));
      plateLo = Math.min(plateLo, z);
      plateHi = Math.max(plateHi, z);
    }
    const base = plateLo - 0.6;
    const ext = new THREE.ExtrudeGeometry(plate.shapes, {
      depth: plateHi + LABEL_RAISE - base,
      bevelEnabled: false,
      curveSegments: 1,
    });
    ext.translate(0, 0, base);
    ext.deleteAttribute("uv");
    ext.computeVertexNormals();
    text = ext;
  }
  return { geometry: g, text, size };

  /**
   * Keyhole hanger in the back of the top rail: a round entry for a screw
   * head, a narrow slot the shank slides up into, and a pocket behind for the
   * head. Hung up, the frame drops so the screw rests at the top of the slot.
   * Builds the walls, pocket floor and ceiling; returns the outline at z = 0
   * for the back face to leave open.
   */
  function keyhole(
    railY: number,
    opt: FrameOptions,
    vtx: (x: number, y: number, z: number) => number,
    t: (a: number, b: number, c: number) => void
  ): number[] {
    const lipZ = 2; // material in front of the screw head
    const topZ = lipZ + Math.min(4, opt.depth - lipZ - 4);
    const R = 3.8, w = 1.8; // entry radius, slot half-width
    const yc = railY - 1.8, ys = railY + 3.8; // entry centre, slot top
    const h = Math.sqrt(R * R - w * w);
    const alpha = Math.atan2(h, w);
    const outline: [number, number][] = [];
    // Entry circle, the long way round from the slot's right side to its left.
    for (let k = 0; k <= 40; k++) {
      const a = alpha - (k / 40) * (Math.PI + 2 * alpha);
      outline.push([R * Math.cos(a), yc + R * Math.sin(a)]);
    }
    // Up the slot and round its top.
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI - (k / 12) * Math.PI;
      outline.push([w * Math.cos(a), ys + w * Math.sin(a)]);
    }
    const pocket: [number, number][] = [
      [-4.25, railY - 6],
      [4.25, railY - 6],
      [4.25, railY + 6],
      [-4.25, railY + 6],
    ];
    const ccw = (l: [number, number][]) => {
      let a = 0;
      for (let i = 0; i < l.length; i++) {
        const [x1, y1] = l[i], [x2, y2] = l[(i + 1) % l.length];
        a += x1 * y2 - x2 * y1;
      }
      return a > 0 ? l : l.slice().reverse();
    };
    const K = ccw(outline), P = ccw(pocket);
    const K0 = K.map(([x, y]) => vtx(x, y, 0));
    const K1 = K.map(([x, y]) => vtx(x, y, lipZ));
    const P1 = P.map(([x, y]) => vtx(x, y, lipZ));
    const P2 = P.map(([x, y]) => vtx(x, y, topZ));
    // Walls face into the cut-out (left of each counter-clockwise edge).
    const walls = (lo: number[], hi: number[]) => {
      for (let j = 0; j < lo.length; j++) {
        const j1 = (j + 1) % lo.length;
        t(lo[j], hi[j], hi[j1]);
        t(lo[j], hi[j1], lo[j1]);
      }
    };
    walls(K0, K1);
    walls(P1, P2);
    cap(P1, [K1], true); // ledge the screw head hooks behind
    cap(P2, [], false); // pocket ceiling
    return K0;
  }
}

function signedVolume(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position");
  const idx = g.index!.array;
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    v +=
      p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c)) -
      p.getY(a) * (p.getX(b) * p.getZ(c) - p.getZ(b) * p.getX(c)) +
      p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c));
  }
  return v / 6;
}

function flip(g: THREE.BufferGeometry) {
  const idx = g.index!.array as Uint32Array | Uint16Array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.index!.needsUpdate = true;
}

/** STL bytes of a frame (and its letters), ready for a slicer. STL has no
 *  colours, so the letters print in the frame's filament. */
export async function frameSTL(parts: THREE.BufferGeometry[]): Promise<Blob> {
  const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
  const group = new THREE.Group();
  for (const g of parts) group.add(new THREE.Mesh(g));
  const data = new STLExporter().parse(group, { binary: true }) as DataView;
  return new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
}
