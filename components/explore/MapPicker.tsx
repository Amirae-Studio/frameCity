"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Circle, Heart, Hexagon, Layers, LocateFixed, PenTool, Search, Square, Star, Triangle, Undo2, X } from "lucide-react";
import Scrubber from "@/components/ui/Scrubber";
import {
  customFrame,
  customIssue,
  formatMeters,
  shapeLngLatRing,
  type FrameShape,
  type LngLat,
  type ShapeKind,
} from "@/lib/explore/geo";

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

/** Zoom at which the frame fills ~`fill` of the shorter viewport side. */
function zoomForSize(size: number, lat: number, px: number, fill = 0.6) {
  const metersPerPx = size / (px * fill);
  return Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180)) / metersPerPx) - 1; // 512px tiles
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
  const mapRef = useRef<MLMap | null>(null);
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const onShapeChangeRef = useRef(onShapeChange);
  onShapeChangeRef.current = onShapeChange;
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(true);

  // Custom outline drawing. Points live in a ref so map handlers see them
  // without re-binding; `draftCount` re-renders the panel.
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;
  const draftRef = useRef<LngLat[]>([]);
  const hoverRef = useRef<LngLat | null>(null);
  const [draftCount, setDraftCount] = useState(0);

  const issue = shape.kind === "custom" ? customIssue(shape.points, MAX_SIZE) : null;

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

  const finishDrawing = useCallback(() => {
    const pts = draftRef.current;
    if (pts.length < 3) return;
    const map = mapRef.current;
    setDrawing(false);
    drawingRef.current = false;
    hoverRef.current = null;
    onShapeChangeRef.current({ kind: "custom", points: pts.slice(), rotation: 0, ...customFrame(pts) });
    if (map) {
      const lngs = pts.map((p) => p[0]);
      const lats = pts.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 90, duration: 500 }
      );
    }
  }, []);

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
    // Template shapes follow the map centre again.
    const c = mapRef.current?.getCenter();
    onShapeChange({
      kind,
      size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(shape.size / 10) * 10)),
      ...(c ? { center: [c.lng, c.lat] as LngLat } : {}),
    });
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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      map.addSource("mask", { type: "geojson", data: emptyFc() });
      map.addSource("frame", { type: "geojson", data: emptyFc() });
      map.addSource("draft", { type: "geojson", data: emptyFc() });
      map.addSource("vertices", { type: "geojson", data: emptyFc() });
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
      setReady(true);
    });

    let raf = 0;
    map.on("move", () => {
      // A drawn outline is pinned to the ground; template frames ride the centre.
      if (shapeRef.current.kind === "custom") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const c = map.getCenter();
        onShapeChangeRef.current({ center: [c.lng, c.lat] });
      });
    });

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
    map.on("mousemove", (e) => {
      if (!drawingRef.current) return;
      hoverRef.current = [e.lngLat.lng, e.lngLat.lat];
      renderDraft();
    });

    // Editing: drag any corner of a finished custom outline.
    let dragIdx = -1;
    map.on("mouseenter", "vertices", () => {
      if (!drawingRef.current) map.getCanvas().style.cursor = "move";
    });
    map.on("mouseleave", "vertices", () => {
      if (dragIdx < 0) map.getCanvas().style.cursor = drawingRef.current ? "crosshair" : "";
    });
    map.on("mousedown", "vertices", (e) => {
      if (drawingRef.current || lockedRef.current || shapeRef.current.kind !== "custom") return;
      const f = e.features?.[0];
      if (!f) return;
      e.preventDefault(); // stops the map from panning
      dragIdx = Number(f.properties?.i);
      map.dragPan.disable();
    });
    map.on("mousemove", (e) => {
      if (dragIdx < 0) return;
      const pts = (shapeRef.current.points ?? []).slice();
      pts[dragIdx] = [e.lngLat.lng, e.lngLat.lat];
      onShapeChangeRef.current({ points: pts, ...customFrame(pts) });
    });
    const endDrag = () => {
      if (dragIdx < 0) return;
      dragIdx = -1;
      map.getCanvas().style.cursor = "";
      if (!lockedRef.current) map.dragPan.enable();
    };
    map.on("mouseup", endDrag);
    map.getCanvas().addEventListener("mouseleave", endDrag);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [finishDrawing, renderDraft]);

  // Redraw the frame + outside mask whenever the shape changes.
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
    renderDraft();
  }, [shape, ready, drawing, locked, renderDraft]);

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

  // Fit the view when the frame size changes so it always stays in view.
  const lastSize = useRef(shape.size);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shape.size === lastSize.current) return;
    lastSize.current = shape.size;
    if (shape.kind === "custom") return; // outline edits shouldn't move the camera
    const el = containerRef.current!;
    const px = Math.min(el.clientWidth, el.clientHeight);
    const t = setTimeout(() => {
      const s = shapeRef.current;
      map.easeTo({ zoom: zoomForSize(s.size, s.center[1], px), duration: 400 });
    }, 250);
    return () => clearTimeout(t);
  }, [shape.size, shape.kind]);

  // Freeze interaction while the customise step is open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = [map.dragPan, map.scrollZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard, map.boxZoom];
    handlers.forEach((h) => (locked ? h.disable() : h.enable()));
  }, [locked, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    SAT_LAYERS.forEach((id) => map.setLayoutProperty(id, "visibility", satellite ? "visible" : "none"));
    map.setLayoutProperty("streets", "visibility", satellite ? "none" : "visible");
  }, [satellite, ready]);

  function flyToHit(hit: SearchHit) {
    const map = mapRef.current;
    if (!map) return;
    onPlaceName(hit.title);
    let size = shapeRef.current.size;
    if (hit.extent && shapeRef.current.kind !== "custom") {
      const [w, n, e, s] = hit.extent;
      const spanM = Math.max(
        (e - w) * 111320 * Math.cos((hit.center[1] * Math.PI) / 180),
        (n - s) * 110574
      );
      // Small extents (a building, a street) → keep the current frame size.
      if (spanM > 400) {
        size = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, spanM * 1.05)));
        lastSize.current = size; // flyTo below already frames it
        onShapeChange({ size });
      }
    }
    const el = containerRef.current!;
    const px = Math.min(el.clientWidth, el.clientHeight);
    // A drawn outline stays where it is — jump there and draw a new one.
    if (shapeRef.current.kind === "custom") size = 800;
    map.flyTo({ center: hit.center, zoom: zoomForSize(size, hit.center[1], px), speed: 1.6 });
  }

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        onPlaceName(null);
        mapRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 });
      },
      () => alert("Could not get your location.")
    );
  }

  const getBias = useCallback((): LngLat | null => {
    const c = mapRef.current?.getCenter();
    return c ? [c.lng, c.lat] : null;
  }, []);

  const isCustom = shape.kind === "custom";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* maplibre's own CSS forces `position: relative` on the container,
          so it fills an absolutely positioned wrapper instead. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Search + basemap */}
      {!locked && (
        <div className="absolute left-4 right-4 top-4 z-10 flex items-start gap-2 md:right-auto md:w-[420px]">
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
            title="My location"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-black/70 text-white backdrop-blur-xl transition-colors hover:bg-black/85"
          >
            <LocateFixed size={16} />
          </button>
        </div>
      )}

      {/* Frame controls */}
      {!locked && (
        <div className="absolute bottom-10 left-1/2 z-10 w-[min(640px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-cream/[0.14] bg-panel/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full border border-cream/[0.14] p-1 [scrollbar-width:none]">
              {SHAPES.map(([kind, label, Icon]) => {
                const on = drawing ? kind === "custom" : shape.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    title={label}
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
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45">
              {drawing
                ? `${draftCount} point${draftCount === 1 ? "" : "s"}`
                : `${formatMeters(shape.size)} ${shape.kind === "circle" ? "across" : "wide"}`}
            </span>
          </div>

          {drawing ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] text-cream/50">
                Click the map to add corners · click the first point or double-click to finish
              </p>
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
                  <p className={`m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] ${issue ? "text-[#e07a5f]" : "text-cream/50"}`}>
                    {issue ?? "Drag the corner points to fine-tune your shape"}
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
                  <Scrubber
                    label="Size (m)"
                    value={shape.size}
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    step={10}
                    decimals={0}
                    onValueChange={(v) => onShapeChange({ size: v })}
                  />
                  <Scrubber
                    label="Rotation (°)"
                    value={shape.rotation}
                    min={0}
                    max={355}
                    step={5}
                    decimals={0}
                    onValueChange={(v) => onShapeChange({ rotation: v })}
                  />
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-cream/[0.09] pt-3">
                <p className="m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] text-cream/40">
                  {isCustom ? "Your outline is pinned to the map" : "Drag the map to place the frame"}
                  {shape.size > 1200 && <span className="text-[var(--accent)]"> · large areas take longer</span>}
                </p>
                <button
                  type="button"
                  disabled={busy || !!issue}
                  onClick={onConfirm}
                  className="shrink-0 rounded-full bg-cream px-5 py-[10px] text-[13px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.03] disabled:opacity-50"
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
