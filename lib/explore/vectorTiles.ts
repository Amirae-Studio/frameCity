// Primary map-data source: OpenFreeMap vector tiles (OpenMapTiles schema).
// CDN-cached, no key, no rate limit — far more dependable than public Overpass.
// Produces the same OsmData shape as the Overpass parser.

import { VectorTile, classifyRings, type VectorTileFeature } from "@mapbox/vector-tile";
import Pbf from "pbf";
import {
  bounds,
  clipPolygon,
  clipPolyline,
  shapePolygon,
  signedArea,
  toLngLat,
  toLocal,
  type FrameShape,
  type Vec2,
} from "./geo";
import { clipArea, orient, type Area, type OsmData } from "./osm";

const TILEJSON = "https://tiles.openfreemap.org/planet";
const Z = 14; // the only zoom that carries every building
const MAX_TILES = 16;

const ROAD_WIDTH: Record<string, number> = {
  motorway: 16,
  trunk: 14,
  primary: 12,
  secondary: 10,
  tertiary: 8,
  minor: 6,
  busway: 6,
  raceway: 8,
  service: 4,
  track: 3,
  path: 2,
};
const WATERWAY_WIDTH: Record<string, number> = { river: 18, canal: 12, stream: 3, drain: 2, ditch: 1.5 };
const GRASS_LANDUSE = new Set(["cemetery", "pitch", "playground", "garden", "grass", "stadium"]);

let templatePromise: Promise<string> | null = null;
function tileTemplate(): Promise<string> {
  templatePromise ??= fetch(TILEJSON)
    .then((r) => r.json() as Promise<{ tiles: string[] }>)
    .then((j) => j.tiles[0])
    .catch((err) => {
      templatePromise = null;
      throw err;
    });
  return templatePromise;
}

const lngToX = (lng: number) => ((lng + 180) / 360) * 2 ** Z;
const latToY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
};

export async function fetchVectorTileData(shape: FrameShape, signal?: AbortSignal): Promise<OsmData> {
  const clip = shapePolygon(shape);
  const b = bounds(clip);
  const [w, s] = toLngLat([b.minX - 10, b.minY - 10], shape.center);
  const [e, n] = toLngLat([b.maxX + 10, b.maxY + 10], shape.center);
  const x0 = Math.floor(lngToX(w)), x1 = Math.floor(lngToX(e));
  const y0 = Math.floor(latToY(n)), y1 = Math.floor(latToY(s));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) throw new Error("Area too large for vector tiles");

  const template = await tileTemplate();
  const jobs: Promise<{ x: number; y: number; tile: VectorTile }>[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const url = template.replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y));
      jobs.push(
        fetch(url, { signal }).then(async (res) => {
          if (!res.ok) throw new Error(`tile ${res.status}`);
          return { x, y, tile: new VectorTile(new Pbf(await res.arrayBuffer())) };
        })
      );
    }
  }

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
  for (const { x, y, tile } of await Promise.all(jobs)) readTile(tile, x, y, shape, clip, data);
  return data;
}

function readTile(tile: VectorTile, tx: number, ty: number, shape: FrameShape, clip: Vec2[], data: OsmData) {
  const n = 2 ** Z;
  const local = (px: number, py: number, extent: number): Vec2 => {
    const lng = ((tx + px / extent) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / extent)) / n))) * 180) / Math.PI;
    return toLocal([lng, lat], shape.center);
  };

  // Each tile's features are cut to the exact tile square (dropping the
  // buffer) so pieces that straddle tiles meet edge to edge, not overlap.
  const each = (name: string, fn: (f: VectorTileFeature, sq: Vec2[], L: (p: { x: number; y: number }) => Vec2) => void) => {
    const layer = tile.layers[name];
    if (!layer) return;
    const E = layer.extent;
    const L = (p: { x: number; y: number }) => local(p.x, p.y, E);
    const sq: Vec2[] = [local(0, E, E), local(E, E, E), local(E, 0, E), local(0, 0, E)];
    for (let i = 0; i < layer.length; i++) fn(layer.feature(i), sq, L);
  };

  const areas = (f: VectorTileFeature, sq: Vec2[], L: (p: { x: number; y: number }) => Vec2): Area[] => {
    if (f.type !== 3) return [];
    const out: Area[] = [];
    for (const poly of classifyRings(f.loadGeometry())) {
      const rings = poly.map((r) => {
        const pts = r.map(L);
        const [a, z] = [pts[0], pts[pts.length - 1]];
        if (pts.length > 1 && a[0] === z[0] && a[1] === z[1]) pts.pop();
        return pts;
      });
      if (rings[0].length < 3) continue;
      const outer = clipPolygon(orient(rings[0], true), sq);
      if (outer.length < 3) continue;
      const holes = rings
        .slice(1)
        .filter((h) => h.length >= 3)
        .map((h) => clipPolygon(orient(h, true), sq))
        .filter((h) => h.length >= 3);
      out.push(...clipArea({ outer, holes }, clip));
    }
    return out;
  };

  const lines = (f: VectorTileFeature, sq: Vec2[], L: (p: { x: number; y: number }) => Vec2): Vec2[][] => {
    if (f.type !== 2) return [];
    return f
      .loadGeometry()
      .flatMap((line) => clipPolyline(line.map(L), sq))
      .flatMap((piece) => clipPolyline(piece, clip));
  };

  each("building", (f, sq, L) => {
    const p = f.properties;
    if (p.hide_3d) return; // outline whose building:parts carry the real shape
    const height = Number(p.render_height) || 8;
    const minHeight = Number(p.render_min_height) || 0;
    for (const a of areas(f, sq, L)) {
      data.buildings.push({ ...a, height: Math.max(height, minHeight + 1), minHeight, footprint: Math.abs(signedArea(a.outer)) });
    }
  });

  each("transportation", (f, sq, L) => {
    const p = f.properties;
    if (p.brunnel === "tunnel" || p.indoor) return;
    const cls = String(p.class || "");
    const width = ROAD_WIDTH[cls];
    if (!width) return;
    for (const line of lines(f, sq, L)) data.roads.push({ line, width });
  });

  each("landcover", (f, sq, L) => {
    const cls = String(f.properties.class || "");
    if (cls !== "wood" && cls !== "grass" && cls !== "wetland") return;
    for (const a of areas(f, sq, L)) {
      data.grass.push(a);
      if (cls === "wood") data.treeAreas.push(a);
    }
  });

  each("landuse", (f, sq, L) => {
    if (!GRASS_LANDUSE.has(String(f.properties.class || ""))) return;
    data.grass.push(...areas(f, sq, L));
  });

  each("water", (f, sq, L) => {
    const p = f.properties;
    if (p.brunnel === "tunnel" || p.class === "swimming_pool") return;
    data.water.push(...areas(f, sq, L));
  });

  each("waterway", (f, sq, L) => {
    const p = f.properties;
    const width = WATERWAY_WIDTH[String(p.class || "")];
    if (!width || p.brunnel === "tunnel") return;
    for (const line of lines(f, sq, L)) data.waterLines.push({ line, width });
  });
}
