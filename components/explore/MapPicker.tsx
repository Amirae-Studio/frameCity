"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MLMap,
  type MapMouseEvent,
  type MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Circle,
  Crosshair,
  Heart,
  Hexagon,
  Layers,
  LocateFixed,
  Move,
  PenTool,
  RotateCw,
  Scan,
  Search,
  Square,
  Star,
  Triangle,
  Undo2,
  X,
} from "lucide-react";
import Scrubber from "@/components/ui/Scrubber";
import {
  bounds,
  customFrame,
  customIssue,
  formatMeters,
  pointInRing,
  shapeLngLatRing,
  shapePolygon,
  toLngLat,
  toLocal,
  type FrameShape,
  type LngLat,
  type ShapeKind,
  type Vec2,
} from "@/lib/explore/geo";
import { PRINT_MM } from "@/lib/explore/buildModel";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/** Optional: with a Mapbox token the map uses Mapbox satellite imagery and
 *  geocoding (same as the Blender BLOSM setup). Without one, Esri + Photon. */
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const mapboxRaster = (style: string): maplibregl.RasterSourceSpecification => ({
  type: "raster",
  tiles: [`https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`],
  tileSize: 256,
  maxzoom: 22,
  attribution: "© Mapbox © OpenStreetMap contributors",
});

const ESRI_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    transport: {
      type: "raster",
      tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
    places: {
      type: "raster",
      tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
    streets: {
      type: "raster",
      tiles: ["a", "b", "c", "d"].map(
        (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`
      ),
      tileSize: 256,
      maxzoom: 20,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "transport", type: "raster", source: "transport", paint: { "raster-opacity": 0.75 } },
    { id: "places", type: "raster", source: "places" },
    { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } },
  ],
};

const MAPBOX_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { satellite: mapboxRaster("satellite-streets-v12"), streets: mapboxRaster("streets-v12") },
  layers: [
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } },
  ],
};

const MAP_STYLE = MAPBOX_TOKEN ? MAPBOX_STYLE : ESRI_STYLE;
const SAT_LAYERS = MAPBOX_TOKEN ? ["satellite"] : ["satellite", "transport", "places"];

const SHAPES: [ShapeKind, string, typeof Square][] = [
  ["square", "Square", Square],
  ["circle", "Round", Circle],
  ["triangle", "Triangle", Triangle],
  ["hexagon", "Hexagon", Hexagon],
  ["heart", "Heart", Heart],
  ["star", "Star", Star],
  ["custom", "Custom", PenTool],
];

const ACCENT = "#e5b229";

export const MIN_SIZE = 150;
export const MAX_SIZE = 2000;

/** Screen distance (px) between the frame's top edge and its rotate knob. */
const KNOB_GAP = 36;

type SearchHit = {
  id: string;
  title: string;
  subtitle: string;
  center: [number, number];
  extent?: [number, number, number, number]; // w, n, e, s
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    extent?: [number, number, number, number];
  };
};

/** What a press on the map grabbed. */
type Grab = "move" | "resize" | "rotate" | "vertex";

const GRAB_CURSOR: Record<Grab, string> = {
  move: "move",
  resize: "nwse-resize",
  rotate: "grab",
  vertex: "move",
};

/** Zoom at which the frame fills ~`fill` of the shorter viewport side. */
function zoomForSize(size: number, lat: number, px: number, fill = 0.6) {
  const metersPerPx = size / (px * fill);
  return Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180)) / metersPerPx) - 1; // 512px tiles
}

function metersPerPixel(zoom: number, lat: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Rotate a local point clockwise by `deg` (same convention as shapePolygon). */
function rotate([x, y]: Vec2, deg: number): Vec2 {
  const t = (-deg * Math.PI) / 180;
  return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
}

/** Bounding box of a template shape before rotation, in local metres. */
function unrotatedBox(s: FrameShape) {
  return bounds(shapePolygon({ ...s, rotation: 0 }));
}

/** Patch that puts the frame at `center`. A drawn outline is carried along
 *  in metres so it keeps its real-world shape at any latitude. */
function placeAt(s: FrameShape, center: LngLat, size = s.size): Partial<FrameShape> {
  if (s.kind === "custom" && s.points?.length) {
    const points = s.points.map((p) => toLngLat(toLocal(p, s.center), center));
    return { points, ...customFrame(points) };
  }
  return { center, size };
}

/** Corners of the dashed edit box around a template shape (none for custom). */
function editBox(s: FrameShape): LngLat[] {
  if (s.kind === "custom") return [];
  const b = unrotatedBox(s);
  return ([[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]] as Vec2[]).map((p) =>
    toLngLat(rotate(p, s.rotation), s.center)
  );
}

/** Everything the user needs to see to edit the frame: outline plus handles. */
function editExtent(s: FrameShape): LngLat[] {
  const ring = shapeLngLatRing(s);
  return ring.length ? [...ring, ...editBox(s)] : [];
}

function lngLatBounds(ring: LngLat[]): [[number, number], [number, number]] {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export function MapPicker({
  shape,
  onShapeChange,
  onPlaceName,
  onConfirm,
  busy,
  locked,
}: {
  shape: FrameShape;
  onShapeChange: (patch: Partial<FrameShape>) => void;
  onPlaceName: (name: string | null) => void;
  onConfirm: () => void;
  busy: boolean;
  locked: boolean; // map frozen while a later step is open
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const labelRef = useRef<maplibregl.Marker | null>(null);
  const gripRef = useRef<maplibregl.Marker | null>(null);
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const onShapeChangeRef = useRef(onShapeChange);
  onShapeChangeRef.current = onShapeChange;
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [grab, setGrab] = useState<Grab | null>(null);
  const grabRef = useRef<Grab | null>(null);
  grabRef.current = grab;
  const [offscreen, setOffscreen] = useState(false);

  // Custom outline drawing. Points live in a ref so map handlers see them
  // without re-binding; `draftCount` re-renders the panel.
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const draftRef = useRef<LngLat[]>([]);
  const hoverRef = useRef<LngLat | null>(null);
  const [draftCount, setDraftCount] = useState(0);

  const issue = shape.kind === "custom" ? customIssue(shape.points, MAX_SIZE) : null;

  /** Map padding that keeps the frame clear of the search bar and the panel. */
  const fitPadding = useCallback(() => {
    const el = containerRef.current;
    const h = el?.clientHeight ?? 800;
    const w = el?.clientWidth ?? 800;
    // Room the panel takes from the bottom of the map, plus space for the size badge.
    const panelEl = lockedRef.current ? null : panelRef.current;
    const panel = panelEl && el ? el.getBoundingClientRect().bottom - panelEl.getBoundingClientRect().top : 0;
    const side = Math.min(56, w * 0.08);
    // The customise panel sits on the right on desktop.
    const right = lockedRef.current && w >= 768 ? 400 : side;
    return {
      top: Math.min(lockedRef.current ? 40 : 84 + KNOB_GAP, h * 0.25),
      bottom: Math.min(panel ? panel + 52 : 48, h * 0.5),
      left: side,
      right: Math.min(right, w * 0.6),
    };
  }, []);

  /** Animate the camera so the whole frame sits in the clear area. `fly`
   *  arcs out and back in like flyTo, for jumps to somewhere far away. */
  const fitFrame = useCallback(
    (s: FrameShape = shapeRef.current, { instant = false, fly = false } = {}) => {
      const map = mapRef.current;
      const pts = lockedRef.current ? shapeLngLatRing(s) : editExtent(s);
      if (!map || !pts.length) return;
      // flyTo turns an explicit `duration: undefined` into NaN, so leave it out.
      const timing = fly ? { linear: false, speed: 1.6 } : { duration: instant ? 0 : 500 };
      map.fitBounds(lngLatBounds(pts), { padding: fitPadding(), maxZoom: 18, ...timing });
    },
    [fitPadding]
  );

  /** Only move the camera when part of the frame is hidden. */
  const ensureVisible = useCallback(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    const pts = editExtent(shapeRef.current);
    if (!map || !el || !pts.length || map.isMoving()) return;
    const pad = fitPadding();
    const fits = pts.every((c) => {
      const p = map.project(c);
      return p.x >= pad.left && p.x <= el.clientWidth - pad.right && p.y >= pad.top && p.y <= el.clientHeight - pad.bottom;
    });
    if (!fits) fitFrame();
  }, [fitPadding, fitFrame]);

  const checkOffscreen = useCallback(() => {
    const map = mapRef.current;
    if (!map || map.isMoving()) return; // moveend checks again
    const s = shapeRef.current;
    const ring = shapeLngLatRing(s);
    if (!ring.length || drawingRef.current) return setOffscreen(false);
    const b = map.getBounds();
    const c = map.getCenter();
    const seen =
      ring.some((p) => b.contains(p)) || pointInRing(toLocal([c.lng, c.lat], s.center), shapePolygon(s));
    setOffscreen(!seen);
  }, []);

  const renderDraft = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getSource("draft")) return;
    const pts = draftRef.current;
    const line = drawingRef.current && hoverRef.current ? [...pts, hoverRef.current] : pts;
    (map.getSource("draft") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features:
        drawingRef.current && line.length >= 2
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }]
          : [],
    });
    const verts = drawingRef.current
      ? pts
      : shapeRef.current.kind === "custom" && !lockedRef.current
        ? (shapeRef.current.points ?? [])
        : [];
    (map.getSource("vertices") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: verts.map((c, i) => ({
        type: "Feature",
        properties: { i, first: drawingRef.current && i === 0 && pts.length >= 3 ? 1 : 0 },
        geometry: { type: "Point", coordinates: c },
      })),
    });
  }, []);

  /** Resize corners, rotate knob and the dashed box around template shapes. */
  const renderHandles = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getSource("handles")) return;
    const s = shapeRef.current;
    const handles: GeoJSON.Feature[] = [];
    const guides: GeoJSON.Feature[] = [];
    if (!drawingRef.current && !lockedRef.current && s.kind !== "custom") {
      const b = unrotatedBox(s);
      const at = (p: Vec2) => toLngLat(rotate(p, s.rotation), s.center);
      const box = editBox(s);
      box.forEach((c, i) =>
        handles.push({ type: "Feature", properties: { role: "resize", i }, geometry: { type: "Point", coordinates: c } })
      );
      // A circle looks the same at any angle — no knob.
      if (s.kind !== "circle") {
        const midX = (b.minX + b.maxX) / 2;
        const top = at([midX, b.maxY]);
        const knob = at([midX, b.maxY + KNOB_GAP * metersPerPixel(map.getZoom(), s.center[1])]);
        handles.push({ type: "Feature", properties: { role: "rotate" }, geometry: { type: "Point", coordinates: knob } });
        guides.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [top, knob] } });
      }
      if (s.kind !== "square") {
        guides.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...box, box[0]] } });
      }
    }
    (map.getSource("handles") as GeoJSONSource).setData({ type: "FeatureCollection", features: handles });
    (map.getSource("guides") as GeoJSONSource).setData({ type: "FeatureCollection", features: guides });
  }, []);

  const finishDrawing = useCallback(() => {
    const pts = draftRef.current;
    if (pts.length < 3) return;
    setDrawing(false);
    drawingRef.current = false;
    hoverRef.current = null;
    const next = { kind: "custom" as const, points: pts.slice(), rotation: 0, ...customFrame(pts) };
    onShapeChangeRef.current(next);
    fitFrame({ ...shapeRef.current, ...next });
  }, [fitFrame]);

  function startDrawing() {
    draftRef.current = [];
    hoverRef.current = null;
    setDraftCount(0);
    setDrawing(true);
  }

  function undoPoint() {
    draftRef.current = draftRef.current.slice(0, -1);
    setDraftCount(draftRef.current.length);
    renderDraft();
  }

  function pickShape(kind: ShapeKind) {
    if (kind === "custom") {
      if (shape.points?.length) {
        onShapeChange({ kind, rotation: 0, ...customFrame(shape.points) });
      } else {
        startDrawing();
      }
      return;
    }
    setDrawing(false);
    // The frame stays where it is on the ground — only its outline changes.
    onShapeChange({
      kind,
      size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(shape.size / 10) * 10)),
    });
  }

  /** Bring the frame to the middle of the current view. */
  function moveHere() {
    const c = mapRef.current?.getCenter();
    if (!c) return;
    const patch = placeAt(shape, [c.lng, c.lat]);
    onShapeChange(patch);
    fitFrame({ ...shape, ...patch });
  }

  // Map lifecycle
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const px = Math.min(el.clientWidth, el.clientHeight) || 600;
    const map = new maplibregl.Map({
      container: el,
      style: MAP_STYLE,
      center: shapeRef.current.center,
      zoom: zoomForSize(shapeRef.current.size, shapeRef.current.center[1], px),
      maxZoom: 19,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    const badge = document.createElement("div");
    badge.className =
      "pointer-events-none whitespace-nowrap rounded-full border border-white/20 bg-black/75 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-white shadow-lg backdrop-blur-md";
    labelRef.current = new maplibregl.Marker({ element: badge, anchor: "top", offset: [0, 12] })
      .setLngLat(shapeRef.current.center)
      .addTo(map);

    // Centre grip: always grabs the frame, even when it fills the screen.
    const grip = document.createElement("div");
    grip.className =
      "pointer-events-none flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-black/60 text-white shadow-lg backdrop-blur-sm";
    grip.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>';
    gripRef.current = new maplibregl.Marker({ element: grip }).setLngLat(shapeRef.current.center).addTo(map);

    map.on("load", () => {
      map.addSource("mask", { type: "geojson", data: emptyFc() });
      map.addSource("frame", { type: "geojson", data: emptyFc() });
      map.addSource("draft", { type: "geojson", data: emptyFc() });
      map.addSource("vertices", { type: "geojson", data: emptyFc() });
      map.addSource("guides", { type: "geojson", data: emptyFc() });
      map.addSource("handles", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "mask",
        type: "fill",
        source: "mask",
        paint: { "fill-color": "#000", "fill-opacity": 0.5 },
      });
      map.addLayer({
        id: "frame-fill",
        type: "fill",
        source: "frame",
        paint: { "fill-color": ACCENT, "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "frame-glow",
        type: "line",
        source: "frame",
        paint: { "line-color": ACCENT, "line-width": 8, "line-opacity": 0.35, "line-blur": 4 },
      });
      map.addLayer({
        id: "frame-line",
        type: "line",
        source: "frame",
        paint: { "line-color": "#ffffff", "line-width": 2 },
      });
      map.addLayer({
        id: "guides",
        type: "line",
        source: "guides",
        paint: { "line-color": "#ffffff", "line-width": 1.25, "line-opacity": 0.7, "line-dasharray": [3, 2] },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "vertices",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-radius": ["case", ["==", ["get", "first"], 1], 8, 5.5],
          "circle-color": ["case", ["==", ["get", "first"], 1], ACCENT, "#ffffff"],
          "circle-stroke-color": ACCENT,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "handles",
        type: "circle",
        source: "handles",
        paint: {
          "circle-radius": ["case", ["==", ["get", "role"], "rotate"], 7.5, 6],
          "circle-color": ["case", ["==", ["get", "role"], "rotate"], ACCENT, "#ffffff"],
          "circle-stroke-color": ["case", ["==", ["get", "role"], "rotate"], "#ffffff", ACCENT],
          "circle-stroke-width": 2,
        },
      });
      setReady(true);
    });

    // Handles keep a fixed screen distance from the frame, so redraw on zoom.
    map.on("zoom", renderHandles);
    map.on("moveend", checkOffscreen);

    // Drawing: click adds a point, clicking the first point (or double-click) closes it.
    map.on("click", (e) => {
      if (!drawingRef.current) return;
      const pts = draftRef.current;
      const hit = (c: LngLat) => {
        const p = map.project(c);
        return Math.hypot(p.x - e.point.x, p.y - e.point.y) < 12;
      };
      if (pts.length >= 3 && hit(pts[0])) {
        finishDrawing();
        return;
      }
      if (pts.length && hit(pts[pts.length - 1])) return; // second click of a double-click
      draftRef.current = [...pts, [e.lngLat.lng, e.lngLat.lat]];
      setDraftCount(draftRef.current.length);
      renderDraft();
    });
    map.on("dblclick", (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      finishDrawing();
    });

    // Direct editing: drag inside the frame to move it, a corner to resize,
    // the knob to rotate, or a drawn outline's points to reshape it.
    type Drag =
      | { kind: "move"; from: LngLat; start: FrameShape }
      | { kind: "resize" | "rotate" }
      | { kind: "vertex"; i: number };
    let drag: Drag | null = null;

    const hitTest = (e: MapMouseEvent | MapTouchEvent, touch: boolean): Drag | null => {
      const pad = touch ? 16 : 6;
      if (drawingRef.current || lockedRef.current) return null;
      const { x, y } = e.point;
      const [f] = map.queryRenderedFeatures(
        [
          [x - pad, y - pad],
          [x + pad, y + pad],
        ],
        { layers: ["handles", "vertices"] }
      );
      if (f?.layer.id === "vertices") return { kind: "vertex", i: Number(f.properties?.i) };
      if (f) return { kind: f.properties?.role === "rotate" ? "rotate" : "resize" };
      const s = shapeRef.current;
      const ring = shapePolygon(s);
      if (!ring.length) return null;
      const grabMove = { kind: "move" as const, from: [e.lngLat.lng, e.lngLat.lat] as LngLat, start: s };
      const c = map.project(s.center);
      if (Math.hypot(c.x - x, c.y - y) < pad + 12) return grabMove;
      // With a mouse, dragging inside the frame moves it — unless it's bigger
      // than the view, where a drag should pan the map. On touch a one-finger
      // drag always pans; the centre grip moves the frame.
      if (touch) return null;
      const canvas = map.getCanvas();
      const whole = shapeLngLatRing(s).every((ll) => {
        const p = map.project(ll);
        return p.x >= 0 && p.y >= 0 && p.x <= canvas.clientWidth && p.y <= canvas.clientHeight;
      });
      if (whole && pointInRing(toLocal([e.lngLat.lng, e.lngLat.lat], s.center), ring)) return grabMove;
      return null;
    };

    const begin = (e: MapMouseEvent | MapTouchEvent, touch: boolean) => {
      if (touch && (e as MapTouchEvent).points.length !== 1) return;
      if (!touch && (e as MapMouseEvent).originalEvent.button !== 0) return;
      const hit = hitTest(e, touch);
      if (!hit) return;
      e.preventDefault(); // stops the map from panning
      map.dragPan.disable();
      drag = hit;
      setGrab(hit.kind);
      map.getCanvas().style.cursor = hit.kind === "rotate" ? "grabbing" : GRAB_CURSOR[hit.kind];
    };

    const update = (e: MapMouseEvent | MapTouchEvent) => {
      if (!drag) {
        // Hover feedback (mouse only).
        if (drawingRef.current || "points" in e) return;
        const hit = hitTest(e, false);
        map.getCanvas().style.cursor = hit ? GRAB_CURSOR[hit.kind] : "";
        return;
      }
      const s = shapeRef.current;
      const ll: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (drag.kind === "move") {
        const { from, start } = drag;
        const to: LngLat = [start.center[0] + ll[0] - from[0], start.center[1] + ll[1] - from[1]];
        onShapeChangeRef.current(placeAt(start, to));
      } else if (drag.kind === "vertex") {
        const pts = (s.points ?? []).slice();
        pts[drag.i] = ll;
        onShapeChangeRef.current({ points: pts, ...customFrame(pts) });
      } else if (drag.kind === "resize") {
        // Scale about the centre by how far along the corner's diagonal the pointer is.
        const [lx, ly] = rotate(toLocal(ll, s.center), -s.rotation);
        const b = unrotatedBox(s);
        const cx = lx >= 0 ? b.maxX : b.minX;
        const cy = ly >= 0 ? b.maxY : b.minY;
        const k = (lx * cx + ly * cy) / (cx * cx + cy * cy);
        const size = Math.round((s.size * k) / 10) * 10;
        onShapeChangeRef.current({ size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)) });
      } else {
        const [lx, ly] = toLocal(ll, s.center);
        const fine = !("points" in e) && (e as MapMouseEvent).originalEvent.shiftKey;
        const step = fine ? 1 : 5;
        const deg = Math.round(((Math.atan2(lx, ly) * 180) / Math.PI + 360) / step) * step;
        onShapeChangeRef.current({ rotation: deg % 360 });
      }
    };

    const end = () => {
      if (!drag) return;
      drag = null;
      setGrab(null);
      map.getCanvas().style.cursor = "";
      if (!lockedRef.current) map.dragPan.enable();
    };

    map.on("mousedown", (e) => begin(e, false));
    map.on("touchstart", (e) => begin(e, true));
    map.on("mousemove", (e) => {
      if (drawingRef.current) {
        hoverRef.current = [e.lngLat.lng, e.lngLat.lat];
        renderDraft();
        return;
      }
      update(e);
    });
    map.on("touchmove", update);
    map.on("mouseup", end);
    map.on("touchend", end);
    map.on("touchcancel", end);
    window.addEventListener("mouseup", end);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      window.removeEventListener("mouseup", end);
      labelRef.current = null;
      gripRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [finishDrawing, renderDraft, renderHandles, checkOffscreen]);

  // Redraw the frame, mask, handles and size badge whenever the shape changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const ring = drawing ? [] : shapeLngLatRing(shape);
    (map.getSource("frame") as GeoJSONSource).setData(
      ring.length
        ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }
        : emptyFc()
    );
    const world = [
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ];
    (map.getSource("mask") as GeoJSONSource).setData(
      ring.length
        ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ring.slice().reverse()] } }
        : emptyFc()
    );
    map.setPaintProperty("frame-line", "line-width", grab === "move" ? 3 : 2);
    map.setPaintProperty("frame-fill", "fill-opacity", grab === "move" ? 0.16 : 0.08);
    renderDraft();
    renderHandles();
    checkOffscreen();

    const grip = gripRef.current;
    if (grip) {
      grip.getElement().style.display = ring.length && !locked ? "" : "none";
      grip.setLngLat(shape.center);
    }

    // Size badge under the lowest point of the frame.
    const label = labelRef.current;
    if (label) {
      const el = label.getElement();
      el.style.display = ring.length && !locked ? "" : "none";
      if (ring.length) {
        const low = ring.reduce((a, b) => (b[1] < a[1] ? b : a));
        label.setLngLat([shape.center[0], low[1]]);
        el.textContent =
          grab === "rotate"
            ? `${shape.rotation}°`
            : shape.kind === "custom"
              ? `${formatMeters(shape.size)} across`
              : `${formatMeters(shape.size)} ${shape.kind === "circle" ? "across" : "wide"}`;
      }
    }
  }, [shape, ready, drawing, locked, grab, renderDraft, renderHandles, checkOffscreen]);

  // After the frame grows, shrinks, turns or changes shape, pull the camera
  // back only if part of it ended up hidden. Waits for drags to finish.
  const fitKey = `${shape.kind}|${shape.size}|${shape.rotation}|${shape.points?.length ?? 0}`;
  const lastFitKey = useRef(fitKey);
  useEffect(() => {
    if (!ready || grab || drawing || fitKey === lastFitKey.current) return;
    const t = setTimeout(() => {
      lastFitKey.current = fitKey;
      ensureVisible();
    }, 350);
    return () => clearTimeout(t);
  }, [fitKey, ready, grab, drawing, ensureVisible]);

  // Drawing mode: crosshair cursor, no double-click zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    if (drawing) map.doubleClickZoom.disable();
    else if (!locked) map.doubleClickZoom.enable();
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") finishDrawing();
      else if (e.key === "Escape") setDrawing(false);
      else if ((e.key === "z" && (e.ctrlKey || e.metaKey)) || e.key === "Backspace") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        draftRef.current = draftRef.current.slice(0, -1);
        setDraftCount(draftRef.current.length);
        renderDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, ready, locked, finishDrawing, renderDraft]);

  const opened = useRef(false);
  // Freeze interaction while the customise step is open, and keep the
  // frame clear of whichever panel is showing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const handlers = [map.dragPan, map.scrollZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard, map.boxZoom];
    handlers.forEach((h) => (locked ? h.disable() : h.enable()));
    if (!locked) map.touchZoomRotate.disableRotation();
    // First run opens on the frame, framed clear of the panel.
    fitFrame(shapeRef.current, { instant: !opened.current });
    opened.current = true;
  }, [locked, ready, fitFrame]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    SAT_LAYERS.forEach((id) => map.setLayoutProperty(id, "visibility", satellite ? "visible" : "none"));
    map.setLayoutProperty("streets", "visibility", satellite ? "none" : "visible");
  }, [satellite, ready]);

  /** Search result: the frame moves to the place and the camera follows. */
  function flyToHit(hit: SearchHit) {
    onPlaceName(hit.title);
    const s = shapeRef.current;
    let size = s.size;
    if (hit.extent && s.kind !== "custom") {
      const [w, n, e, so] = hit.extent;
      const spanM = Math.max((e - w) * 111320 * Math.cos((hit.center[1] * Math.PI) / 180), (n - so) * 110574);
      // Small extents (a building, a street) → keep the current frame size.
      if (spanM > 400) size = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, spanM * 1.05)) / 10) * 10;
    }
    const patch = placeAt(s, hit.center, size);
    lastFitKey.current = `${s.kind}|${patch.size ?? s.size}|${s.rotation}|${s.points?.length ?? 0}`;
    onShapeChange(patch);
    fitFrame({ ...s, ...patch }, { fly: true });
  }

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        onPlaceName(null);
        const s = shapeRef.current;
        const patch = placeAt(s, [pos.coords.longitude, pos.coords.latitude]);
        onShapeChange(patch);
        fitFrame({ ...s, ...patch }, { fly: true });
      },
      () => alert("Could not get your location.")
    );
  }

  const getBias = useCallback((): LngLat | null => {
    const c = mapRef.current?.getCenter();
    return c ? [c.lng, c.lat] : null;
  }, []);

  const isCustom = shape.kind === "custom";
  const mPerMm = shape.size / PRINT_MM;

  return (
    <div className="relative h-full w-full overflow-hidden max-md:[&_.maplibregl-ctrl-top-right]:hidden [&_.maplibregl-ctrl-top-right]:mr-1 [&_.maplibregl-ctrl-top-right]:mt-1">
      {/* maplibre's own CSS forces `position: relative` on the container,
          so it fills an absolutely positioned wrapper instead. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Search + basemap */}
      {!locked && (
        <div className="absolute left-4 right-4 top-4 z-10 flex items-start gap-2 md:right-auto md:w-[460px]">
          <PlaceSearch onPick={flyToHit} getBias={getBias} />
          <button
            type="button"
            onClick={() => setSatellite((s) => !s)}
            title={satellite ? "Switch to street map" : "Switch to satellite"}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-white/15 bg-black/70 px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-xl transition-colors hover:bg-black/85"
          >
            <Layers size={15} />
            <span className="hidden sm:inline">{satellite ? "Map" : "Satellite"}</span>
          </button>
          <button
            type="button"
            onClick={locateMe}
            title="Move the frame to my location"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-black/70 text-white backdrop-blur-xl transition-colors hover:bg-black/85"
          >
            <LocateFixed size={16} />
          </button>
        </div>
      )}

      {/* The frame is pinned to the ground — say so when it scrolls away. */}
      {!locked && offscreen && !drawing && (
        <div className="absolute left-1/2 top-[76px] z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/80 p-1 pl-3.5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <span className="mr-1 whitespace-nowrap text-[12px] text-white/75">Frame is out of view</span>
          <button
            type="button"
            onClick={() => fitFrame()}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] text-white/85 transition-colors hover:bg-white/10"
          >
            <Scan size={13} /> Show it
          </button>
          <button
            type="button"
            onClick={moveHere}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-transform hover:scale-[1.03]"
          >
            <Crosshair size={13} /> Move here
          </button>
        </div>
      )}

      {/* Frame controls */}
      {!locked && (
        <div
          ref={panelRef}
          className="absolute bottom-6 left-1/2 z-10 w-[min(760px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-cream/[0.14] bg-panel/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl md:bottom-8"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full border border-cream/[0.14] p-1 [scrollbar-width:none]">
              {SHAPES.map(([kind, label, Icon]) => {
                const on = drawing ? kind === "custom" : shape.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    title={label}
                    aria-pressed={on}
                    onClick={() => pickShape(kind)}
                    className={`flex shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-[7px] text-[11.5px] transition-colors duration-200 ${
                      on ? "bg-cream font-medium text-[var(--color-base)]" : "text-cream/60 hover:text-cream"
                    }`}
                  >
                    <Icon size={13} />
                    <span className={on ? "hidden sm:inline" : "hidden lg:inline"}>{label}</span>
                  </button>
                );
              })}
            </div>
            {!drawing && (
              <button
                type="button"
                onClick={moveHere}
                title="Move the frame to the middle of the map"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-cream/20 px-3 py-[7px] text-[11.5px] text-cream/70 transition-colors hover:bg-cream/5 hover:text-cream"
              >
                <Crosshair size={13} />
                <span className="hidden sm:inline">Centre</span>
              </button>
            )}
          </div>

          {drawing ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[13px] text-cream">
                  {draftCount < 3
                    ? `Click the map to place corner ${draftCount + 1}`
                    : "Click the first point or press Enter to finish"}
                </p>
                <p className="m-0 mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-cream/45">
                  {draftCount} point{draftCount === 1 ? "" : "s"} · Backspace undoes · Esc cancels
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={undoPoint}
                  disabled={!draftCount}
                  className="flex items-center gap-1.5 rounded-full border border-cream/20 px-3.5 py-2 text-[12px] text-cream/70 hover:bg-cream/5 disabled:opacity-40"
                >
                  <Undo2 size={13} /> Undo
                </button>
                <button
                  type="button"
                  onClick={() => setDrawing(false)}
                  className="rounded-full border border-cream/20 px-3.5 py-2 text-[12px] text-cream/70 hover:bg-cream/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={finishDrawing}
                  disabled={draftCount < 3}
                  className="rounded-full bg-cream px-4 py-2 text-[12.5px] text-[var(--color-base)] disabled:opacity-40"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {isCustom ? (
                <div className="flex items-center justify-between gap-3">
                  <p className={`m-0 text-[12.5px] ${issue ? "text-[#e07a5f]" : "text-cream/70"}`}>
                    {issue ?? `Custom outline · ${formatMeters(shape.size)} across`}
                  </p>
                  <button
                    type="button"
                    onClick={startDrawing}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-cream/20 px-3.5 py-2 text-[12px] text-cream/70 hover:bg-cream/5"
                  >
                    <PenTool size={13} /> Redraw
                  </button>
                </div>
              ) : (
                <div className={`grid grid-cols-1 gap-2 sm:gap-4 ${shape.kind === "circle" ? "" : "sm:grid-cols-2"}`}>
                  <Scrubber
                    label="Size (m)"
                    value={shape.size}
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    step={10}
                    decimals={0}
                    onValueChange={(v) => onShapeChange({ size: v })}
                  />
                  {shape.kind !== "circle" && (
                    <Scrubber
                      label="Rotation (°)"
                      value={shape.rotation}
                      min={0}
                      max={355}
                      step={5}
                      decimals={0}
                      onValueChange={(v) => onShapeChange({ rotation: v })}
                    />
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-cream/[0.09] pt-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-cream/50">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Move size={11} />
                      <span className="sm:hidden">Drag the grip to move</span>
                      <span className="hidden sm:inline">Drag the frame to move</span>
                    </span>
                    {isCustom ? (
                      <span className="hidden sm:inline">Drag points to reshape</span>
                    ) : (
                      <>
                        <span className="hidden sm:inline">Corners resize</span>
                        {shape.kind !== "circle" && (
                          <span className="hidden items-center gap-1 sm:flex">
                            <RotateCw size={11} /> Knob rotates · Shift for 1°
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="m-0 mt-1 hidden font-mono text-[9.5px] uppercase tracking-[0.12em] text-cream/35 sm:block">
                    {PRINT_MM / 10} cm print · 1 mm ≈ {mPerMm < 10 ? mPerMm.toFixed(1) : Math.round(mPerMm)} m
                    {shape.size > 1200 && <span className="text-[var(--accent)]"> · large areas take longer</span>}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || !!issue}
                  onClick={onConfirm}
                  className="shrink-0 rounded-full bg-cream px-5 py-[10px] text-[13px] font-medium text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.03] disabled:opacity-50"
                >
                  Select this area →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function emptyFc(): maplibregl.GeoJSONSourceSpecification["data"] {
  return { type: "FeatureCollection", features: [] };
}

type MapboxFeature = {
  id?: string;
  geometry: { coordinates: [number, number] };
  properties: {
    mapbox_id?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    bbox?: [number, number, number, number]; // w, s, e, n
  };
};

/** Mapbox Search Box — unlike Geocoding v6 it knows landmarks and businesses (POIs). */
async function mapboxSearch(query: string, bias: LngLat | null, signal: AbortSignal): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q: query, limit: "6", language: "en", access_token: MAPBOX_TOKEN! });
  if (bias) params.set("proximity", `${bias[0]},${bias[1]}`);
  const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params}`, { signal });
  if (!res.ok) throw new Error(`Mapbox search ${res.status}`);
  const json = (await res.json()) as { features?: MapboxFeature[] };
  return (json.features ?? []).map((f, i) => {
    const p = f.properties;
    const bb = p.bbox;
    return {
      id: `mb-${p.mapbox_id ?? f.id ?? i}`,
      title: p.name || p.full_address || "Unnamed place",
      subtitle: p.place_formatted || p.full_address || "",
      center: f.geometry.coordinates,
      extent: bb ? [bb[0], bb[3], bb[2], bb[1]] : undefined,
    };
  });
}

async function photonSearch(query: string, bias: LngLat | null, signal: AbortSignal): Promise<SearchHit[]> {
  const params = new URLSearchParams({ q: query, limit: "7", lang: "en" });
  if (bias) {
    params.set("lon", String(bias[0]));
    params.set("lat", String(bias[1]));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map((f, i) => {
    const p = f.properties;
    const title = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.city || "Unnamed place";
    const subtitle = [p.city !== title ? p.city : null, p.state, p.country].filter(Boolean).join(", ");
    return { id: `ph-${p.osm_id ?? i}-${i}`, title, subtitle, center: f.geometry.coordinates, extent: p.extent };
  });
}

/** Place search, ranked near the current view like Google Maps. With a Mapbox
 *  token, Mapbox and Photon (OSM) run side by side and their results are
 *  interleaved — each finds places the other misses, and either may be down. */
async function geocode(query: string, bias: LngLat | null, signal: AbortSignal): Promise<SearchHit[]> {
  const sources = [photonSearch(query, bias, signal)];
  if (MAPBOX_TOKEN) sources.unshift(mapboxSearch(query, bias, signal));
  const lists = (await Promise.allSettled(sources)).map((r) => (r.status === "fulfilled" ? r.value : []));
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const out: SearchHit[] = [];
  const same = (a: SearchHit, b: SearchHit) =>
    a.title.toLowerCase() === b.title.toLowerCase() &&
    Math.abs(a.center[0] - b.center[0]) < 0.01 &&
    Math.abs(a.center[1] - b.center[1]) < 0.01;
  for (let i = 0; out.length < 8 && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const hit = l[i];
      if (!hit) continue;
      const dup = out.find((h) => same(h, hit));
      // Keep one entry per place, preferring the one that knows its extent.
      if (dup) dup.extent ??= hit.extent;
      else out.push(hit);
    }
  }
  return out.slice(0, 8);
}

function PlaceSearch({ onPick, getBias }: { onPick: (hit: SearchHit) => void; getBias: () => LngLat | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      return;
    }
    // "lat, lng" jumps straight to coordinates.
    const coord = query.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (coord) {
      const lat = parseFloat(coord[1]);
      const lng = parseFloat(coord[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        setHits([{ id: "coord", title: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, subtitle: "Coordinates", center: [lng, lat] }]);
        return;
      }
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setHits(await geocode(query, getBias(), ctrl.signal));
        setActive(0);
      } catch {
        /* aborted or offline — keep previous results */
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, getBias]);

  function pick(hit: SearchHit) {
    setQ(hit.title);
    setOpen(false);
    onPick(hit);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-black/70 px-3.5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl focus-within:border-[var(--accent)]">
        <Search size={16} className="shrink-0 text-white/60" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % hits.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + hits.length) % hits.length);
            } else if (e.key === "Enter") {
              pick(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search a place, landmark or lat, lng"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/45"
        />
        {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]" />}
        {q && !loading && (
          <button type="button" onClick={() => { setQ(""); setHits([]); }} className="shrink-0 text-white/50 hover:text-white">
            <X size={15} />
          </button>
        )}
      </div>
      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 m-0 list-none overflow-hidden rounded-2xl border border-white/15 bg-black/85 p-1 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={`flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition-colors ${
                  i === active ? "bg-white/10" : ""
                }`}
              >
                <span className="text-[13.5px]">{h.title}</span>
                {h.subtitle && <span className="font-mono text-[10px] text-white/50">{h.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
