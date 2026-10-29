// LOD2 buildings from government city models (LiDAR / photogrammetry), where a
// country publishes them as Cesium 3D Tiles: real measured roofs and heights
// instead of shapes estimated from OSM tags. Everywhere else — and for
// buildings these models miss — the OSM/Overture buildings stay in place.

import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { union, type Pair, type Polygon } from "polygon-clipping";
import { bounds, insideFrame, orient, shapePolygon, signedArea, toLngLat, toLocal, type FrameShape, type LngLat, type Vec2 } from "./geo";
import type { Area } from "./osm";

export type Lod2Source = { id: string; name: string; attribution: string };

/** One building as a closed triangle mesh in local metres: x east, y north,
 *  h metres above the building's lowest point. */
export type MeshBuilding = {
  tris: Float32Array; // x, y, h per vertex, 3 vertices per triangle
  height: number;
  footprint: number; // m², roof area seen from above
  box: { minX: number; minY: number; maxX: number; maxY: number };
};

export type Lod2Data = {
  source: Lod2Source;
  meshes: MeshBuilding[]; // wholly inside the frame
  edges: (Area & { height: number })[]; // crossing the frame edge — flat prisms, cut later
  covers: (p: Vec2) => boolean; // a LOD2 building stands here
};

type Provider = Lod2Source & {
  bbox: [number, number, number, number]; // w, s, e, n — rough national extent
  tilesets: (shape: FrameShape, signal?: AbortSignal) => Promise<string[]>;
};

const PROVIDERS: Provider[] = [
  {
    id: "3dbag",
    name: "3DBAG LoD2.2",
    attribution: "© 3DBAG by tudelft3d and 3DGI (CC BY 4.0)",
    bbox: [3.2, 50.7, 7.3, 53.6],
    tilesets: async () => ["https://data.3dbag.nl/v20250903/cesium3dtiles/lod22/tileset.json"],
  },
  {
    id: "swisstopo",
    name: "swissBUILDINGS3D",
    attribution: "© swisstopo",
    bbox: [5.9, 45.8, 10.5, 47.9],
    tilesets: async () => ["https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json"],
  },
  {
    id: "plateau",
    name: "PLATEAU LOD2",
    attribution: "© MLIT Japan, Project PLATEAU",
    bbox: [122.9, 24, 146, 45.6],
    tilesets: plateauTilesets,
  },
];

/** PLATEAU publishes per municipality: find which ones the frame touches. */
async function plateauTilesets(shape: FrameShape, signal?: AbortSignal): Promise<string[]> {
  const b = bounds(shapePolygon(shape));
  const probes: LngLat[] = [
    shape.center,
    toLngLat([b.minX, b.minY], shape.center),
    toLngLat([b.maxX, b.minY], shape.center),
    toLngLat([b.maxX, b.maxY], shape.center),
    toLngLat([b.minX, b.maxY], shape.center),
  ];
  const codes = await Promise.all(
    probes.map(async ([lng, lat]) => {
      try {
        const res = await fetch(
          `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
          { signal }
        );
        const json = (await res.json()) as { results?: { muniCd?: string } };
        return json.results?.muniCd?.padStart(5, "0") ?? null;
      } catch {
        return null;
      }
    })
  );
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return [];
  const res = await fetch(`/api/explore/plateau?codes=${unique.join(",")}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { tilesets: { url: string }[] };
  return json.tilesets.map((t) => t.url);
}

/* ── Geodesy ─────────────────────────────────────────────────────────── */

const WGS_A = 6378137;
const WGS_F = 1 / 298.257223563;
const WGS_B = WGS_A * (1 - WGS_F);
const WGS_E2 = WGS_F * (2 - WGS_F);
const WGS_EP2 = (WGS_A * WGS_A - WGS_B * WGS_B) / (WGS_B * WGS_B);

/** ECEF → [lng°, lat°, ellipsoidal height m] (Bowring, sub-mm on Earth). */
function geodetic(x: number, y: number, z: number): [number, number, number] {
  const p = Math.hypot(x, y);
  const th = Math.atan2(z * WGS_A, p * WGS_B);
  const st = Math.sin(th), ct = Math.cos(th);
  const lat = Math.atan2(z + WGS_EP2 * WGS_B * st * st * st, p - WGS_E2 * WGS_A * ct * ct * ct);
  const sl = Math.sin(lat);
  const N = WGS_A / Math.sqrt(1 - WGS_E2 * sl * sl);
  return [(Math.atan2(y, x) * 180) / Math.PI, (lat * 180) / Math.PI, p / Math.cos(lat) - N];
}

type Mat = number[]; // 4×4, column-major like 3D Tiles and three.js
const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a: Mat, b: Mat): Mat {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

const apply = (m: Mat, x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/* ── Tileset traversal ───────────────────────────────────────────────── */

type Region = [number, number, number, number]; // w, s, e, n in degrees
type Content = { url: string; transform: Mat };

const MAX_CONTENTS = 160;

function volumeRegion(bv: Record<string, number[]>, m: Mat): Region | null {
  if (bv.region) {
    const [w, s, e, n] = bv.region.map((r) => (r * 180) / Math.PI);
    return [w, s, e, n];
  }
  let pts: [number, number, number][] = [];
  if (bv.box) {
    const [cx, cy, cz, ax, ay, az, bx, by, bz, qx, qy, qz] = bv.box;
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) {
      pts.push([cx + i * ax + j * bx + k * qx, cy + i * ay + j * by + k * qy, cz + i * az + j * bz + k * qz]);
    }
  } else if (bv.sphere) {
    const [cx, cy, cz, r] = bv.sphere;
    pts = [[cx - r, cy, cz], [cx + r, cy, cz], [cx, cy - r, cz], [cx, cy + r, cz], [cx, cy, cz - r], [cx, cy, cz + r]];
  } else {
    return null;
  }
  const geo = pts.map(([x, y, z]) => geodetic(...apply(m, x, y, z)));
  return [
    Math.min(...geo.map((g) => g[0])),
    Math.min(...geo.map((g) => g[1])),
    Math.max(...geo.map((g) => g[0])),
    Math.max(...geo.map((g) => g[1])),
  ];
}

const overlaps = (a: Region, b: Region) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

type TileNode = {
  boundingVolume: Record<string, number[]>;
  geometricError?: number;
  refine?: "ADD" | "REPLACE";
  transform?: number[];
  content?: { uri?: string; url?: string };
  contents?: { uri?: string; url?: string }[];
  children?: TileNode[];
};

/** Tiles whose content shows the finest detail inside `frame`. REPLACE tiles
 *  only count at their leaves; ADD tiles count at every level. */
async function collectContents(url: string, frame: Region, signal?: AbortSignal): Promise<Content[]> {
  const out: Content[] = [];
  const walkTileset = async (tsUrl: string, parent: Mat, depth: number) => {
    if (depth > 6) return;
    const json = (await (await fetch(tsUrl, { signal })).json()) as { root: TileNode };
    await walk(json.root, parent, "REPLACE", tsUrl, depth);
  };
  const walk = async (node: TileNode, parent: Mat, parentRefine: string, base: string, depth: number): Promise<void> => {
    if (out.length >= MAX_CONTENTS) return;
    const m = node.transform ? mul(parent, node.transform) : parent;
    const region = volumeRegion(node.boundingVolume, m);
    if (region && !overlaps(region, frame)) return;
    const refine = node.refine ?? parentRefine;
    const uri = node.content?.uri ?? node.content?.url ?? node.contents?.[0]?.uri ?? node.contents?.[0]?.url;
    const kids = node.children ?? [];
    const jobs: Promise<void>[] = [];
    if (uri) {
      const abs = new URL(uri, base).href;
      if (/\.json(\?|$)/i.test(abs)) jobs.push(walkTileset(abs, m, depth + 1));
      else if (refine === "ADD" || !kids.length || node.geometricError === 0) out.push({ url: abs, transform: m });
    }
    for (const k of kids) jobs.push(walk(k, m, refine, base, depth));
    await Promise.all(jobs);
  };
  await walkTileset(url, IDENTITY, 0);
  return out.slice(0, MAX_CONTENTS);
}

/* ── Content decoding ────────────────────────────────────────────────── */

let loaderPromise: Promise<GLTFLoader> | null = null;
function gltfLoader(): Promise<GLTFLoader> {
  loaderPromise ??= (async () => {
    const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/loaders/DRACOLoader.js"),
      import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    ]);
    const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    return new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  })();
  return loaderPromise;
}

/** Triangles per feature id, in local metres + ellipsoidal height. */
type Raw = Map<string, number[]>;

async function readContent(c: Content, ci: number, origin: LngLat, raw: Raw, signal?: AbortSignal) {
  const buf = await (await fetch(c.url, { signal })).arrayBuffer();
  await readTile(buf, c.transform, `${ci}`, origin, raw);
}

async function readTile(buf: ArrayBuffer, tileM: Mat, key: string, origin: LngLat, raw: Raw): Promise<void> {
  const dv = new DataView(buf);
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  let glb = buf;
  let rtc: number[] = [0, 0, 0];
  if (magic === "cmpt") {
    // Composite: a list of inner tiles, each with its own header.
    const count = dv.getUint32(12, true);
    let off = 16;
    for (let i = 0; i < count; i++) {
      const len = dv.getUint32(off + 8, true);
      await readTile(buf.slice(off, off + len), tileM, `${key}.${i}`, origin, raw);
      off += len;
    }
    return;
  }
  if (magic === "b3dm") {
    const ftJson = dv.getUint32(12, true), ftBin = dv.getUint32(16, true);
    const btJson = dv.getUint32(20, true), btBin = dv.getUint32(24, true);
    const ft = ftJson ? JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 28, ftJson))) : {};
    if (Array.isArray(ft.RTC_CENTER)) rtc = ft.RTC_CENTER;
    glb = buf.slice(28 + ftJson + ftBin + btJson + btBin);
  } else if (magic !== "glTF") {
    return; // i3dm / pnts carry no buildings
  }

  const loader = await gltfLoader();
  const gltf = await loader.parseAsync(glb, "");
  const ext = (gltf.parser.json as { extensions?: { CESIUM_RTC?: { center: number[] } } }).extensions;
  if (ext?.CESIUM_RTC) rtc = ext.CESIUM_RTC.center;
  gltf.scene.updateMatrixWorld(true);

  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const pos = g.getAttribute("position");
    if (!pos) return;
    const ids = g.getAttribute("_batchid") ?? g.getAttribute("_feature_id_0");
    const mw = mesh.matrixWorld.elements as unknown as Mat;
    const flip = mesh.matrixWorld.determinant() < 0;
    // glTF is y-up; 3D Tiles are z-up: (x, y, z) → (x, −z, y), then RTC and tile transform.
    const local = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = apply(mw, pos.getX(i), pos.getY(i), pos.getZ(i));
      const [ex, ey, ez] = apply(tileM, x + rtc[0], -z + rtc[1], y + rtc[2]);
      const [lng, lat, h] = geodetic(ex, ey, ez);
      const [lx, ly] = toLocal([lng, lat], origin);
      local[i * 3] = lx;
      local[i * 3 + 1] = ly;
      local[i * 3 + 2] = h;
    }
    const index = g.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      let a = index ? index.getX(t) : t;
      let b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      if (flip) [a, b] = [b, a];
      // Feature ids are per tile; a building may span several primitives.
      const id = ids ? `${key}:${Math.round(ids.getX(a))}` : `${key}:m${mesh.id}`;
      let list = raw.get(id);
      if (!list) raw.set(id, (list = []));
      for (const v of [a, b, c]) list.push(local[v * 3], local[v * 3 + 1], local[v * 3 + 2]);
    }
  });
}

/* ── Public API ──────────────────────────────────────────────────────── */

export function lod2Provider(center: LngLat): Lod2Source | null {
  const p = PROVIDERS.find(({ bbox: [w, s, e, n] }) => center[0] >= w && center[0] <= e && center[1] >= s && center[1] <= n);
  return p ? { id: p.id, name: p.name, attribution: p.attribution } : null;
}

export async function fetchLod2(shape: FrameShape, signal?: AbortSignal): Promise<Lod2Data | null> {
  const provider = PROVIDERS.find(
    ({ bbox: [w, s, e, n] }) => shape.center[0] >= w && shape.center[0] <= e && shape.center[1] >= s && shape.center[1] <= n
  );
  if (!provider) return null;
  const tilesets = await provider.tilesets(shape, signal);
  if (!tilesets.length) return null;

  const clip = shapePolygon(shape);
  const b = bounds(clip);
  const [w, s] = toLngLat([b.minX - 10, b.minY - 10], shape.center);
  const [e, n] = toLngLat([b.maxX + 10, b.maxY + 10], shape.center);
  const frame: Region = [w, s, e, n];

  const contents = (await Promise.all(tilesets.map((t) => collectContents(t, frame, signal)))).flat();
  if (!contents.length) return null;

  const raw: Raw = new Map();
  // A few at a time — decoding is CPU-bound and tiles can be large.
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < contents.length) {
        const i = next++;
        await readContent(contents[i], i, shape.center, raw, signal).catch((err) => {
          if (signal?.aborted) throw err;
          console.warn("[explore] LOD2 tile failed", contents[i].url, err);
        });
      }
    })
  );

  const meshes: MeshBuilding[] = [];
  const edges: (Area & { height: number })[] = [];
  const grid = new CoverGrid(b, 20);
  for (const arr of raw.values()) {
    let minH = Infinity, maxH = -Infinity;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < arr.length; i += 3) {
      minX = Math.min(minX, arr[i]);
      maxX = Math.max(maxX, arr[i]);
      minY = Math.min(minY, arr[i + 1]);
      maxY = Math.max(maxY, arr[i + 1]);
      minH = Math.min(minH, arr[i + 2]);
      maxH = Math.max(maxH, arr[i + 2]);
    }
    // Tiles are padded beyond the frame: skip buildings that never touch it.
    if (maxX < b.minX || minX > b.maxX || maxY < b.minY || minY > b.maxY) continue;
    const height = maxH - minH;
    if (height < 1) continue;

    // Upward-facing triangles seen from above give the footprint. Some models
    // wind the other way round — then the "downward" set is the roof.
    const up: Vec2[][] = [];
    const down: Vec2[][] = [];
    let upArea = 0, downArea = 0;
    let inside = true;
    for (let i = 0; i < arr.length; i += 9) {
      const tri: Vec2[] = [[arr[i], arr[i + 1]], [arr[i + 3], arr[i + 4]], [arr[i + 6], arr[i + 7]]];
      for (const p of tri) if (inside && !insideFrame(p, clip)) inside = false;
      const a = signedArea(tri);
      if (a > 0.01) {
        up.push(tri);
        upArea += a;
      } else if (a < -0.01) {
        down.push(tri.slice().reverse());
        downArea -= a;
      }
    }
    const roofs = upArea >= downArea * 0.5 ? up : down;
    const footprint = roofs === up ? upArea : downArea;
    if (!roofs.length) continue;
    roofs.forEach((t) => grid.add(t));

    if (inside) {
      const tris = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i += 3) {
        tris[i] = arr[i];
        tris[i + 1] = arr[i + 1];
        tris[i + 2] = arr[i + 2] - minH;
      }
      meshes.push({ tris, height, footprint, box: { minX, minY, maxX, maxY } });
    } else {
      // Can't cut a mesh cleanly at the frame: keep its measured footprint and
      // height as a flat prism, which the frame clip then trims like OSM ones.
      for (const area of footprintAreas(roofs)) edges.push({ ...area, height });
    }
  }
  if (!meshes.length && !edges.length) return null;
  return { source: { id: provider.id, name: provider.name, attribution: provider.attribution }, meshes, edges, covers: (p) => grid.covers(p) };
}

function footprintAreas(tris: Vec2[][]): Area[] {
  const close = (r: Vec2[]): Pair[] => [...r, r[0]];
  try {
    const geoms = tris.map((t) => [close(t)] as Polygon);
    return union(geoms[0], ...geoms.slice(1)).map((poly) => ({
      outer: orient(poly[0].slice(0, -1) as Vec2[], true),
      holes: poly.slice(1).map((h) => orient(h.slice(0, -1) as Vec2[], false)),
    }));
  } catch {
    return [];
  }
}

/** Spatial hash of LOD2 roof triangles: "is there a LOD2 building at p?" */
class CoverGrid {
  private cells = new Map<number, Vec2[][]>();
  constructor(private b: { minX: number; minY: number }, private size: number) {}
  private key(i: number, j: number) {
    return i * 100003 + j;
  }
  add(t: Vec2[]) {
    const bb = bounds(t);
    for (let i = Math.floor((bb.minX - this.b.minX) / this.size); i <= Math.floor((bb.maxX - this.b.minX) / this.size); i++) {
      for (let j = Math.floor((bb.minY - this.b.minY) / this.size); j <= Math.floor((bb.maxY - this.b.minY) / this.size); j++) {
        const k = this.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(t);
        else this.cells.set(k, [t]);
      }
    }
  }
  covers([x, y]: Vec2): boolean {
    const list = this.cells.get(this.key(Math.floor((x - this.b.minX) / this.size), Math.floor((y - this.b.minY) / this.size)));
    if (!list) return false;
    return list.some(([a, b, c]) => {
      const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
      const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
      const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    });
  }
}
