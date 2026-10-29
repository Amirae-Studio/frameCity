// Primary building source: Overture Maps buildings (OpenStreetMap-derived),
// served as a PMTiles archive from a CDN. Unlike plain map tiles it keeps one
// feature per building plus every building:part, with roof shape, height and
// direction — what landmarks like the Eiffel Tower need — and unlike public
// Overpass it has no queue and needs no key.

import { PMTiles } from "pmtiles";
import { VectorTile, classifyRings, type VectorTileFeature } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { union, type Pair, type Polygon } from "polygon-clipping";
import { bounds, centroid, orient, pointInRing, shapePolygon, signedArea, toLngLat, toLocal, type FrameShape, type Vec2 } from "./geo";
import { buildingHeight, buildingRoof, clipArea, groundFloating, outlineBase, type Area, type OsmBuilding } from "./osm";

const STAC = "https://stac.overturemaps.org";
const Z = 14; // the archive's max zoom — every building is present here
const MAX_TILES = 16;

let archivePromise: Promise<PMTiles> | null = null;

/** Releases are monthly and old ones get removed, so find the latest via STAC. */
function buildingsArchive(): Promise<PMTiles> {
  archivePromise ??= (async () => {
    const root = (await (await fetch(`${STAC}/catalog.json`)).json()) as { latest: string };
    const cat = (await (await fetch(`${STAC}/${root.latest}/buildings/catalog.json`)).json()) as {
      links: { rel: string; href: string }[];
    };
    const href = cat.links.find((l) => l.rel === "pmtiles")?.href;
    if (!href) throw new Error("Overture release has no buildings PMTiles");
    return new PMTiles(href);
  })().catch((err) => {
    archivePromise = null;
    throw err;
  });
  return archivePromise;
}

const lngToX = (lng: number) => ((lng + 180) / 360) * 2 ** Z;
const latToY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
};

// Dense city tiles are ~1 MB and range requests skip the HTTP cache, so keep
// recent ones in memory — re-framing the same place then costs nothing.
const TILE_CACHE_SIZE = 32;
const tileCache = new Map<string, Promise<ArrayBuffer | null>>();

function tileData(archive: PMTiles, x: number, y: number, signal?: AbortSignal) {
  const key = `${x}/${y}`;
  let job = tileCache.get(key);
  if (!job) {
    job = archive.getZxy(Z, x, y, signal).then((res) => res?.data ?? null);
    job.catch(() => tileCache.delete(key));
    tileCache.set(key, job);
    if (tileCache.size > TILE_CACHE_SIZE) tileCache.delete(tileCache.keys().next().value!);
  }
  return job;
}

type Props = Record<string, string | number | boolean>;
type Feature = { props: Props; isPart: boolean; polys: Vec2[][][]; tiles: number };

export async function fetchOvertureBuildings(shape: FrameShape, signal?: AbortSignal): Promise<OsmBuilding[]> {
  const clip = shapePolygon(shape);
  const b = bounds(clip);
  const [w, s] = toLngLat([b.minX - 10, b.minY - 10], shape.center);
  const [e, n] = toLngLat([b.maxX + 10, b.maxY + 10], shape.center);
  const x0 = Math.floor(lngToX(w)), x1 = Math.floor(lngToX(e));
  const y0 = Math.floor(latToY(n)), y1 = Math.floor(latToY(s));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) throw new Error("Area too large for building tiles");

  const archive = await buildingsArchive();
  const jobs: Promise<void>[] = [];
  const features = new Map<string, Feature>();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(
        tileData(archive, x, y, signal).then((buf) => {
          if (buf) readTile(new VectorTile(new Pbf(new Uint8Array(buf))), x, y, shape, features);
        })
      );
    }
  }
  await Promise.all(jobs);

  // Link parts to their outline. Overture's building_id is usually right, but
  // some landmarks (Tokyo Tower) leave the outline unlinked — then fall back to
  // geometry, as OSM 3D renderers do: a part centred inside an outline is its part.
  const outlines = [...features].filter(([, f]) => !f.isPart);
  const outlineBoxes = outlines.map(([, o]) => bounds(o.polys.flatMap((poly) => poly[0])));
  const contains = (o: Feature, c: Vec2) => o.polys.some((poly) => pointInRing(c, poly[0]));
  const parentOf = new Map<string, string>();
  for (const [pid, p] of features) {
    if (!p.isPart) continue;
    const bid = String(p.props.building_id ?? "");
    const c = centroid(p.polys[0][0]);
    const linked = features.get(bid);
    if (linked && !linked.isPart && contains(linked, c)) {
      parentOf.set(pid, bid);
      continue;
    }
    const k = outlines.findIndex(([, o], i) => {
      const b = outlineBoxes[i];
      return c[0] >= b.minX && c[0] <= b.maxX && c[1] >= b.minY && c[1] <= b.maxY && contains(o, c);
    });
    parentOf.set(pid, k >= 0 ? outlines[k][0] : bid || pid);
  }
  // Some structures are tagged as separate buildings stacked inside a tall
  // envelope outline (Tokyo Tower: legs and decks as buildings with
  // min_height). A raised building centred inside a larger outline marks that
  // outline as an envelope: everything inside it becomes its parts.
  const area = (f: Feature) => f.polys.reduce((s, poly) => s + Math.abs(signedArea(poly[0])), 0);
  const heightOf = (f: Feature) => buildingHeight(toTags(f.props));
  // The envelope is the smallest larger outline that reaches the raised building's top.
  const envelopeOf = (c: Vec2, skip: string, minArea: number, top: number) => {
    let best = -1;
    outlines.forEach(([oid, o], i) => {
      const b = outlineBoxes[i];
      if (oid === skip || parentOf.has(oid) || c[0] < b.minX || c[0] > b.maxX || c[1] < b.minY || c[1] > b.maxY) return;
      if (area(o) <= minArea || heightOf(o).height < top - 1 || !contains(o, c)) return;
      if (best < 0 || area(o) < area(outlines[best][1])) best = i;
    });
    return best;
  };
  const envelopes = new Set<number>();
  for (const [id, f] of outlines) {
    const h = heightOf(f);
    if (h.minHeight <= 0) continue;
    const k = envelopeOf(centroid(f.polys[0][0]), id, area(f) / 0.9, h.height);
    if (k >= 0) envelopes.add(k);
  }
  for (const k of envelopes) {
    const [eid, env] = outlines[k];
    outlines.forEach(([oid, o]) => {
      if (oid === eid || parentOf.has(oid) || area(o) >= area(env) * 0.9 || !contains(env, centroid(o.polys[0][0]))) return;
      o.isPart = true;
      parentOf.set(oid, eid);
    });
  }

  const partsOf = new Map<string, Feature[]>();
  for (const [pid, parent] of parentOf) partsOf.set(parent, [...(partsOf.get(parent) ?? []), features.get(pid)!]);

  const out: OsmBuilding[] = [];
  for (const [id, f] of features) {
    const t = toTags(f.props);
    const { height, minHeight } = buildingHeight(t);
    const roof = buildingRoof(t);
    // An outline whose parts we have is only a footprint — the parts carry the shape.
    const groupId = f.isPart ? parentOf.get(id)! : id;
    const group = partsOf.get(groupId);
    const groupHeights = group?.map((g) => buildingHeight(toTags(g.props)));
    const main = groupHeights ? Math.max(height, ...groupHeights.map((g) => g.height)) >= 30 : undefined;
    let solid = { height, minHeight, roof, main };
    if (!f.isPart && groupHeights) {
      // Outline of a building with parts — keep it only as the body under a raised crown.
      const base = outlineBase(
        { outer: [], holes: [], footprint: 0, ...solid },
        groupHeights.map((g) => ({ outer: [], holes: [], footprint: 0, ...g })),
        !!main
      );
      if (!base) continue;
      solid = { height: base.height, minHeight: 0, roof: undefined, main };
    }
    for (const area of mergeTiles(f)) {
      for (const c of clipArea(area, clip)) {
        out.push({ ...c, ...solid, footprint: Math.abs(signedArea(c.outer)), name: t.name, group: group ? groupId : undefined });
      }
    }
  }
  groundFloating(out);
  return out;
}

/** Overture properties → the OSM tags our height/roof parsers understand. */
function toTags(p: Props): Record<string, string> {
  const t: Record<string, string> = {};
  const set = (k: string, v: unknown) => {
    if (v != null && v !== "") t[k] = String(v);
  };
  set("height", p.height);
  set("min_height", p.min_height);
  set("building:levels", p.num_floors);
  set("building:min_level", p.min_floor);
  set("roof:shape", p.roof_shape);
  set("roof:height", p.roof_height);
  set("roof:direction", p.roof_direction);
  set("roof:orientation", p.roof_orientation);
  set("building", p.class ?? p.subtype ?? "yes");
  set("name", p["@name"]);
  return t;
}

/** Features crossing tile edges arrive once per tile, each cut at that tile's
 *  buffer. The buffers overlap, so a union rebuilds the whole footprint. */
function mergeTiles(f: Feature): Area[] {
  const toArea = (poly: Vec2[][]): Area => ({
    outer: orient(poly[0], true),
    holes: poly.slice(1).map((h) => orient(h, false)),
  });
  if (f.tiles === 1) return f.polys.map(toArea);
  try {
    const close = (r: Vec2[]): Pair[] => [...r, r[0]];
    const geoms = f.polys.map((poly) => poly.map(close) as Polygon);
    return union(geoms[0], ...geoms.slice(1)).map((poly) => toArea(poly.map((r) => r.slice(0, -1) as Vec2[])));
  } catch {
    return f.polys.map(toArea);
  }
}

function readTile(tile: VectorTile, tx: number, ty: number, shape: FrameShape, features: Map<string, Feature>) {
  const n = 2 ** Z;
  for (const [name, isPart] of [["building", false], ["building_part", true]] as const) {
    const layer = tile.layers[name];
    if (!layer) continue;
    const E = layer.extent;
    const L = (p: { x: number; y: number }): Vec2 => {
      const lng = ((tx + p.x / E) / n) * 360 - 180;
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + p.y / E)) / n))) * 180) / Math.PI;
      return toLocal([lng, lat], shape.center);
    };
    for (let i = 0; i < layer.length; i++) {
      const feat: VectorTileFeature = layer.feature(i);
      const props = feat.properties as Props;
      if (feat.type !== 3 || props.is_underground === true) continue;
      const polys: Vec2[][][] = [];
      for (const poly of classifyRings(feat.loadGeometry())) {
        const rings = poly.map((r) => {
          const pts = r.map(L);
          const [a, z] = [pts[0], pts[pts.length - 1]];
          if (pts.length > 1 && a[0] === z[0] && a[1] === z[1]) pts.pop();
          return pts;
        });
        if (rings[0].length >= 3) polys.push(rings.filter((r) => r.length >= 3));
      }
      if (!polys.length) continue;
      const id = String(props.id ?? `${name}-${tx}-${ty}-${i}`);
      const prev = features.get(id);
      if (prev) {
        prev.polys.push(...polys);
        prev.tiles++;
      } else {
        features.set(id, { props, isPart, polys, tiles: 1 });
      }
    }
  }
}
