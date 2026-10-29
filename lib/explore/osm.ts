// OpenStreetMap features for an Explore World frame, fetched from Overpass and
// projected into local metres, already clipped to the frame shape.

import {
  assembleRings,
  bounds,
  centroid,
  clipPolygon,
  clipPolyline,
  isConvex,
  orient,
  pointInRing,
  shapePolygon,
  signedArea,
  toLngLat,
  toLocal,
  type FrameShape,
  type LngLat,
  type Vec2,
} from "./geo";
import { intersection, type Pair } from "polygon-clipping";

export { orient };

export type Area = { outer: Vec2[]; holes: Vec2[][] };

export type RoofShape = "flat" | "skillion" | "gabled" | "hipped" | "pyramidal" | "dome" | "onion";

export type Roof = {
  shape: RoofShape;
  height?: number; // metres, part of the building height; derived from the footprint when missing
  direction?: number; // compass degrees the slope faces (skillion) / ridge normal (gabled)
  across?: boolean; // gabled/hipped ridge runs across the long side
};

export type OsmBuilding = Area & {
  height: number; // metres above ground, roof included
  minHeight: number; // metres above ground where this part starts
  footprint: number; // m²
  name?: string;
  roof?: Roof; // only from raw OSM — vector tiles carry no roof tags
  main?: boolean; // part of a landmark: classify with its parent building
  group?: string; // outline + parts of one building share ground and scale together
};

export type OsmRoad = { line: Vec2[]; width: number };

export type OsmData = {
  buildings: OsmBuilding[];
  roads: OsmRoad[];
  trees: Vec2[];
  treeAreas: Area[]; // forests/woods — trees get scattered inside
  treeRows: Vec2[][];
  grass: Area[];
  water: Area[];
  waterLines: OsmRoad[];
  /** True when buildings came from raw OSM (roof shapes, parts) rather than tiles. */
  detailed?: boolean;
  /** Measured LOD2 building meshes from a government city model, when one covers the frame. */
  meshBuildings?: import("./lod2").MeshBuilding[];
  lod2?: import("./lod2").Lod2Source;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

type OsmGeomPoint = { lat: number; lon: number };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OsmGeomPoint[];
  members?: { type: string; role: string; geometry?: OsmGeomPoint[] }[];
};

const GRASS_LANDUSE = /^(grass|meadow|village_green|recreation_ground|forest|orchard|vineyard|cemetery|allotments|greenfield)$/;
const GRASS_LEISURE = /^(park|garden|golf_course|pitch|playground|dog_park|nature_reserve)$/;
const GRASS_NATURAL = /^(wood|grassland|scrub|heath|wetland)$/;
const TREE_AREA = (t: Record<string, string>) =>
  t.landuse === "forest" || t.natural === "wood" || t.landuse === "orchard";
const WATER_AREA = (t: Record<string, string>) =>
  t.natural === "water" ||
  t.waterway === "riverbank" ||
  t.landuse === "reservoir" ||
  t.landuse === "basin";

const ROAD_WIDTH: Record<string, number> = {
  motorway: 16,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  motorway_link: 8,
  trunk_link: 8,
  primary_link: 7,
  secondary_link: 7,
  tertiary_link: 6,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  pedestrian: 5,
  track: 3,
  footway: 2.5,
  path: 2,
  cycleway: 2.5,
  steps: 2,
  bridleway: 2,
};

const WATERWAY_WIDTH: Record<string, number> = {
  river: 18,
  canal: 12,
  stream: 3,
  drain: 2,
  ditch: 1.5,
};

function buildQuery(s: number, w: number, n: number, e: number) {
  const bb = `(${s},${w},${n},${e})`;
  const roads = Object.keys(ROAD_WIDTH).join("|");
  const waterways = Object.keys(WATERWAY_WIDTH).join("|");
  // Only the tags we turn into geometry — city-wide landuse polygons
  // (residential, commercial…) would otherwise dominate the download.
  const landuse = "grass|meadow|village_green|recreation_ground|forest|orchard|vineyard|cemetery|allotments|greenfield|reservoir|basin";
  const leisure = "park|garden|golf_course|pitch|playground|dog_park|nature_reserve";
  const natural = "wood|grassland|scrub|heath|wetland|water";
  return `[out:json][timeout:60];
(
  way["building"]${bb};
  relation["building"]${bb};
  way["building:part"]${bb};
  relation["building:part"]${bb};
  way["highway"~"^(${roads})$"]${bb};
  node["natural"="tree"]${bb};
  way["natural"="tree_row"]${bb};
  way["landuse"~"^(${landuse})$"]${bb};
  relation["landuse"~"^(${landuse})$"]${bb};
  way["leisure"~"^(${leisure})$"]${bb};
  relation["leisure"~"^(${leisure})$"]${bb};
  way["natural"~"^(${natural})$"]${bb};
  relation["natural"~"^(${natural})$"]${bb};
  way["waterway"~"^(riverbank|${waterways})$"]${bb};
  relation["waterway"="riverbank"]${bb};
);
out geom qt;`;
}

/** Public mirrors are often slow or overloaded: start the next one if the
 *  current hasn't answered within HEDGE_MS (or failed), keep the first success. */
const HEDGE_MS = 8000;

function fetchOverpass(query: string, signal?: AbortSignal, timeoutMs = 90000): Promise<OsmElement[]> {
  return new Promise((resolve, reject) => {
    const ctrls: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let failed = 0;
    let started = 0;
    let done = false;
    let lastErr: unknown = null;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      ctrls.forEach((c) => c.abort());
      fn();
    };
    signal?.addEventListener("abort", () => finish(() => reject(new DOMException("Aborted", "AbortError"))));
    timers.push(setTimeout(() => finish(() => reject(new Error("Overpass timed out"))), timeoutMs));

    const launch = () => {
      if (done || started >= OVERPASS_ENDPOINTS.length) return;
      const url = OVERPASS_ENDPOINTS[started++];
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      timers.push(setTimeout(launch, HEDGE_MS));
      fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Overpass ${res.status}`);
          const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
          if (!json.elements?.length && json.remark?.includes("error")) throw new Error(json.remark);
          finish(() => resolve(json.elements ?? []));
        })
        .catch((err) => {
          if (done) return;
          lastErr = err;
          if (++failed >= OVERPASS_ENDPOINTS.length) {
            finish(() => reject(lastErr ?? new Error("Map data servers are unavailable")));
          } else {
            launch(); // don't wait for the hedge timer after a hard failure
          }
        });
    };
    launch();
  });
}

function parseLength(v?: string): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (/ft|'/.test(v)) return n * 0.3048;
  return n;
}

export function buildingHeight(t: Record<string, string>): { height: number; minHeight: number } {
  const levels = parseLength(t["building:levels"]);
  const roofLevels = parseLength(t["roof:levels"]) ?? 0;
  let height = parseLength(t.height);
  if (height == null && levels != null) height = (levels + roofLevels) * 3.2;
  if (height == null) {
    const kind = t.building || t["building:part"] || "";
    if (/^(garage|garages|shed|hut|carport|kiosk|roof)$/.test(kind)) height = 3.5;
    else if (/^(house|detached|semidetached_house|bungalow|terrace)$/.test(kind)) height = 7;
    else if (/^(church|cathedral|mosque|temple)$/.test(kind)) height = 18;
    else if (/^(industrial|warehouse|retail|supermarket)$/.test(kind)) height = 8;
    else height = 10;
  }
  let minHeight = parseLength(t.min_height);
  if (minHeight == null) {
    const minLevel = parseLength(t["building:min_level"]);
    // building:levels counts from the ground, so with a real height the
    // part's own storey height places min_level far better than 3.2 m does.
    const tagged = parseLength(t.height);
    if (minLevel == null) minHeight = 0;
    else if (tagged != null && levels) minHeight = (tagged * minLevel) / (levels + roofLevels);
    else minHeight = minLevel * 3.2;
  }
  return { height: Math.max(height, minHeight + 1), minHeight };
}

/**
 * An outline with parts is normally just a footprint — the parts carry the 3D
 * shape. But when every part starts above ground (a crown tagged on top of a
 * plain tower), the outline is the body beneath them: keep it, up to where the
 * parts begin. Returns null when the outline should be dropped.
 */
export function outlineBase(outline: OsmBuilding, parts: OsmBuilding[], main: boolean): OsmBuilding | null {
  const start = Math.min(...parts.map((p) => p.minHeight));
  if (!(start > 2)) return null;
  return { ...outline, height: start, minHeight: 0, roof: undefined, main };
}

/**
 * A lifted solid needs something under it, or it prints in mid-air. Anything
 * raised with no solid beneath reaching its bottom is extended to the ground.
 * "Beneath" includes touching: tapering towers are often tagged as stacked
 * parts whose footprints only meet edge to edge (the Eiffel Tower's legs).
 * Lowest first, so a grounded part can in turn hold up the one above it.
 */
const TOUCH = 1.5; // metres

export function groundFloating(list: OsmBuilding[]): void {
  const boxes = list.map((b) => bounds(b.outer));
  const order = list.map((_, i) => i).sort((a, b) => list[a].minHeight - list[b].minHeight);
  for (const i of order) {
    const b = list[i];
    if (b.minHeight < 6) continue; // the model already stands these on the ground
    const bb = boxes[i];
    const held = list.some((o, j) => {
      if (j === i || o.minHeight >= b.minHeight - 0.5 || o.height < b.minHeight - 3) return false;
      const ob = boxes[j];
      if (ob.maxX < bb.minX - TOUCH || ob.minX > bb.maxX + TOUCH || ob.maxY < bb.minY - TOUCH || ob.minY > bb.maxY + TOUCH) {
        return false;
      }
      return touches(b.outer, o.outer);
    });
    if (!held) b.minHeight = 0;
  }
}

/** Footprints overlap or come within TOUCH of each other. */
function touches(a: Vec2[], b: Vec2[]): boolean {
  if (pointInRing(centroid(a), b) || pointInRing(centroid(b), a)) return true;
  if (a.some((p) => pointInRing(p, b)) || b.some((p) => pointInRing(p, a))) return true;
  const near = (p: Vec2, ring: Vec2[]) => {
    for (let k = 0; k < ring.length; k++) {
      if (segDist(p, ring[k], ring[(k + 1) % ring.length]) < TOUCH) return true;
    }
    return false;
  };
  return a.some((p) => near(p, b)) || b.some((p) => near(p, a));
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

const ROOF_ALIASES: Record<string, RoofShape> = {
  flat: "flat",
  skillion: "skillion",
  lean_to: "skillion",
  gabled: "gabled",
  "double_saltbox": "gabled",
  saltbox: "gabled",
  gambrel: "gabled",
  round: "gabled",
  hipped: "hipped",
  "half-hipped": "hipped",
  half_hipped: "hipped",
  side_hipped: "hipped",
  mansard: "hipped",
  pyramidal: "pyramidal",
  cone: "pyramidal",
  dome: "dome",
  onion: "onion",
};

const COMPASS: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export function buildingRoof(t: Record<string, string>): Roof | undefined {
  const shape = ROOF_ALIASES[t["roof:shape"] || t["building:roof:shape"] || ""];
  if (!shape || shape === "flat") return undefined;
  const dirTag = t["roof:direction"] || t["roof:slope:direction"];
  const direction = dirTag ? (COMPASS[dirTag.toUpperCase()] ?? parseFloat(dirTag)) : undefined;
  const levels = parseLength(t["roof:levels"]);
  return {
    shape,
    height: parseLength(t["roof:height"]) ?? (levels != null ? levels * 3.2 : undefined),
    direction: Number.isFinite(direction) ? direction : undefined,
    across: t["roof:orientation"] === "across",
  };
}

/** Turn a way/relation into local-metre areas (outer + holes). */
function elementAreas(el: OsmElement, origin: LngLat): Area[] {
  const proj = (g: OsmGeomPoint[]) => g.map((p) => toLocal([p.lon, p.lat], origin));
  if (el.type === "way" && el.geometry) {
    const ring = proj(el.geometry);
    if (ring.length >= 4 && closedRing(ring)) return [{ outer: ring.slice(0, -1), holes: [] }];
    return [];
  }
  if (el.type === "relation" && el.members) {
    const outers = assembleRings(
      el.members.filter((m) => m.role !== "inner" && m.geometry).map((m) => proj(m.geometry!))
    );
    const inners = assembleRings(
      el.members.filter((m) => m.role === "inner" && m.geometry).map((m) => proj(m.geometry!))
    );
    return outers.map((outer) => ({
      outer,
      holes: inners.filter((h) => pointInRing(h[0], outer)),
    }));
  }
  return [];
}

function closedRing(r: Vec2[]) {
  const a = r[0];
  const b = r[r.length - 1];
  return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
}

function elementLine(el: OsmElement, origin: LngLat): Vec2[] | null {
  if (el.type !== "way" || !el.geometry || el.geometry.length < 2) return null;
  return el.geometry.map((p) => toLocal([p.lon, p.lat], origin));
}

export function clipArea(a: Area, clip: Vec2[]): Area[] {
  if (!isConvex(clip)) return clipAreaAny(a, clip);
  const outer = clipPolygon(orient(a.outer, true), clip);
  if (outer.length < 3 || Math.abs(signedArea(outer)) < 1) return [];
  const holes = a.holes
    .map((h) => clipPolygon(orient(h, true), clip))
    .filter((h) => h.length >= 3 && Math.abs(signedArea(h)) > 1)
    .map((h) => orient(h, false));
  return [{ outer, holes }];
}

/** Concave frames: a real boolean intersection, which may split the area. */
function clipAreaAny(a: Area, clip: Vec2[]): Area[] {
  // Most features sit wholly inside or outside — skip the boolean op for them.
  const ab = bounds(a.outer);
  const cb = bounds(clip);
  if (ab.maxX < cb.minX || ab.minX > cb.maxX || ab.maxY < cb.minY || ab.minY > cb.maxY) return [];
  const frameVertexInBox = clip.some(
    ([x, y]) => x >= ab.minX && x <= ab.maxX && y >= ab.minY && y <= ab.maxY
  );
  if (!frameVertexInBox && a.outer.every((p) => pointInRing(p, clip))) {
    return [{ outer: orient(a.outer, true), holes: a.holes.map((h) => orient(h, false)) }];
  }
  const close = (r: Vec2[]): Pair[] => [...r, r[0]];
  const open = (r: Pair[]): Vec2[] => r.slice(0, -1);
  try {
    return intersection([a.outer, ...a.holes].map(close), [close(clip)])
      .map((poly) => ({
        outer: orient(open(poly[0]), true),
        holes: poly
          .slice(1)
          .map(open)
          .filter((h) => Math.abs(signedArea(h)) > 1)
          .map((h) => orient(h, false)),
      }))
      .filter((c) => c.outer.length >= 3 && Math.abs(signedArea(c.outer)) >= 1);
  } catch {
    return []; // degenerate OSM geometry — skip it rather than fail the tile
  }
}

function frameBBox(shape: FrameShape) {
  const clip = shapePolygon(shape);
  const b = bounds(clip);
  const pad = 30; // metres — catch ways that start just outside the frame
  const [w, s] = toLngLat([b.minX - pad, b.minY - pad], shape.center);
  const [e, n] = toLngLat([b.maxX + pad, b.maxY + pad], shape.center);
  return { clip, s, w, n, e };
}

/** Full feature set straight from Overpass (fallback source). */
export async function fetchOsmData(shape: FrameShape, signal?: AbortSignal): Promise<OsmData> {
  const { clip, s, w, n, e } = frameBBox(shape);
  const elements = await fetchOverpass(buildQuery(s, w, n, e), signal);
  return parseElements(elements, shape.center, clip);
}

/**
 * Map data for a frame, from CDN-cached sources that don't queue:
 * - Overture Maps buildings: one feature per building and building:part, with
 *   roof shapes — the detailed source.
 * - OpenFreeMap vector tiles: roads, greenery, water, and plain extruded
 *   buildings as a fallback if Overture is unreachable.
 * - Overpass, only for individual street trees, when it answers in time.
 */
export async function fetchMapData(shape: FrameShape, signal?: AbortSignal): Promise<OsmData> {
  const { clip, s, w, n, e } = frameBBox(shape);
  const bb = `(${s},${w},${n},${e})`;
  const treesQuery = `[out:json][timeout:20];(node["natural"="tree"]${bb};way["natural"="tree_row"]${bb};);out geom qt;`;
  const trees = fetchOverpass(treesQuery, signal, 8000).catch(() => null);
  const lod2 = import("./lod2")
    .then(({ fetchLod2 }) => fetchLod2(shape, signal))
    .catch((err) => {
      if (signal?.aborted) throw err;
      console.warn("[explore] LOD2 city model unavailable, using OSM buildings", err);
      return null;
    });
  const detailed = import("./overture")
    .then(({ fetchOvertureBuildings }) => fetchOvertureBuildings(shape, signal))
    .catch((err) => {
      if (signal?.aborted) throw err;
      console.warn("[explore] Overture buildings unavailable, using tile buildings", err);
      return null;
    });

  let data: OsmData;
  try {
    const { fetchVectorTileData } = await import("./vectorTiles");
    data = await fetchVectorTileData(shape, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("[explore] vector tiles failed, falling back to Overpass", err);
    return { ...(await fetchOsmData(shape, signal)), detailed: true };
  }

  const buildings = await detailed;
  // An empty answer for an area the tiles say is built up is a bad reply.
  if (buildings && (buildings.length || !data.buildings.length)) {
    data.buildings = buildings;
    data.detailed = true;
  }
  // Government LOD2 models win where they have a building; OSM fills the gaps
  // (buildings newer than the survey, or areas the model doesn't cover).
  const city = await lod2;
  if (city) {
    data.buildings = data.buildings.filter((b) => !city.covers(centroid(b.outer)));
    for (const edge of city.edges) {
      for (const c of clipArea(edge, clip)) {
        data.buildings.push({ ...c, height: edge.height, minHeight: 0, footprint: Math.abs(signedArea(c.outer)) });
      }
    }
    data.meshBuildings = city.meshes;
    data.lod2 = city.source;
    groundFloating(data.buildings); // a removed base may have held up a kept part
  }

  const treeEls = await trees;
  if (treeEls) {
    const extra = parseElements(treeEls, shape.center, clip);
    data.trees = extra.trees;
    data.treeRows = extra.treeRows;
  }
  return data;
}

function parseElements(elements: OsmElement[], origin: LngLat, clip: Vec2[]): OsmData {
  const data: OsmData = {
    buildings: [],
    roads: [],
    trees: [],
    treeAreas: [],
    treeRows: [],
    grass: [],
    water: [],
    waterLines: [],
  };

  const parts: OsmBuilding[] = [];
  const wholes: OsmBuilding[] = [];

  for (const el of elements) {
    const t = el.tags;
    if (!t) continue;

    if (el.type === "node") {
      if (t.natural === "tree" && el.lon != null && el.lat != null) {
        const p = toLocal([el.lon, el.lat], origin);
        if (pointInRing(p, clip)) data.trees.push(p);
      }
      continue;
    }

    const isPart = !!t["building:part"] && t["building:part"] !== "no";
    const isBuilding = !!t.building && t.building !== "no";
    if (isBuilding || isPart) {
      // Underground / roof-only structures don't belong on a printed tile.
      if (t.location === "underground" || (parseLength(t.layer) ?? 0) < 0) continue;
      const { height, minHeight } = buildingHeight(t);
      for (const a of elementAreas(el, origin)) {
        for (const c of clipArea(a, clip)) {
          const footprint = Math.abs(signedArea(c.outer));
          const bld: OsmBuilding = { ...c, height, minHeight, footprint, name: t.name, roof: buildingRoof(t) };
          (isPart ? parts : wholes).push(bld);
        }
      }
      continue;
    }

    if (t.highway) {
      if (t.area === "yes" || t.tunnel === "yes" || /proposed|construction|abandoned|razed/.test(t.highway)) continue;
      const width = ROAD_WIDTH[t.highway];
      if (!width) continue;
      const line = elementLine(el, origin);
      if (!line) continue;
      const w = parseLength(t.width) ?? width;
      for (const piece of clipPolyline(line, clip)) data.roads.push({ line: piece, width: w });
      continue;
    }

    if (t.natural === "tree_row") {
      const line = elementLine(el, origin);
      if (line) data.treeRows.push(...clipPolyline(line, clip));
      continue;
    }

    if (t.waterway && WATERWAY_WIDTH[t.waterway] && t.tunnel !== "yes" && t.tunnel !== "culvert") {
      const line = elementLine(el, origin);
      if (line) {
        const width = parseLength(t.width) ?? WATERWAY_WIDTH[t.waterway];
        for (const piece of clipPolyline(line, clip)) data.waterLines.push({ line: piece, width });
      }
      continue;
    }

    const isWater = WATER_AREA(t);
    const isGrass =
      GRASS_LANDUSE.test(t.landuse || "") ||
      GRASS_LEISURE.test(t.leisure || "") ||
      GRASS_NATURAL.test(t.natural || "");
    if (!isWater && !isGrass) continue;

    for (const a of elementAreas(el, origin)) {
      for (const c of clipArea(a, clip)) {
        if (isWater) data.water.push(c);
        else {
          data.grass.push(c);
          if (TREE_AREA(t)) data.treeAreas.push(c);
        }
      }
    }
  }

  // A building outline that has building:part children is only a footprint —
  // the parts carry the real 3D shape, so drop the outline to avoid doubling.
  // Parts of a landmark (tower legs, pavilions) follow their parent's class.
  const partCentroids = parts.map((p) => centroid(p.outer));
  for (const w of wholes) {
    const inside = partCentroids.flatMap((c, i) => (pointInRing(c, w.outer) ? [i] : []));
    if (!inside.length) {
      data.buildings.push(w);
      continue;
    }
    const tall = Math.max(w.height, ...inside.map((i) => parts[i].height));
    const main = tall >= 30 || w.footprint >= 4000;
    const group = `w${data.buildings.length}-${inside[0]}`;
    for (const i of inside) {
      parts[i].main ??= main;
      parts[i].group ??= group;
    }
    const base = outlineBase(w, inside.map((i) => parts[i]), main);
    if (base) data.buildings.push({ ...base, group });
  }
  data.buildings.push(...parts);
  groundFloating(data.buildings);

  return data;
}
