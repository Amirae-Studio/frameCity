"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe2 } from "lucide-react";
import { DEFAULT_LAYER_COLORS, FILAMENT_LINES } from "@/lib/studio";
import type { NavUser } from "@/lib/user";
import type { ModelFile } from "@/app/studio/actions";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import Scrubber from "@/components/ui/Scrubber";
import { StudioConfigurator } from "@/components/studio/StudioConfigurator";
import { bounds, formatMeters, shapePolygon, type FrameShape } from "@/lib/explore/geo";
import { fetchMapData, type OsmData } from "@/lib/explore/osm";
import { loadHeights, type HeightSampler } from "@/lib/explore/elevation";
import { buildExploreModel, summarize, type ExploreLayer, type LayerSummary } from "@/lib/explore/buildModel";

const MapPicker = dynamic(() => import("./MapPicker").then((m) => m.MapPicker), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
    </div>
  ),
});

type Phase = "map" | "scanning" | "customize" | "building" | "studio";

type Scan = {
  shape: FrameShape;
  data: OsmData;
  heights: HeightSampler;
  layers: LayerSummary[];
};

const DEFAULT_SHAPE: FrameShape = {
  kind: "square",
  center: [2.2945, 48.8584], // Champ de Mars, Paris
  size: 600,
  rotation: 0,
};

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 60) || "place";

async function reverseName([lng, lat]: [number, number]): Promise<string | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=en`);
    const json = (await res.json()) as { features?: { properties: Record<string, string> }[] };
    const p = json.features?.[0]?.properties;
    if (!p) return null;
    return p.name || p.district || p.city || p.county || p.state || null;
  } catch {
    return null;
  }
}

export function ExploreWorld({ user, hasAccess }: { user: NavUser | null; hasAccess: boolean }) {
  const [shape, setShape] = useState<FrameShape>(DEFAULT_SHAPE);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("map");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({ ...DEFAULT_LAYER_COLORS });
  const [relief, setRelief] = useState(150);
  const [files, setFiles] = useState<ModelFile[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patchShape = useCallback((patch: Partial<FrameShape>) => setShape((s) => ({ ...s, ...patch })), []);

  // Generated layers live as blob: URLs — release them when replaced.
  useEffect(() => {
    return () => files?.forEach((f) => URL.revokeObjectURL(f.url));
  }, [files]);

  async function startScan() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const snapshot = { ...shape };
    setError(null);
    setPhase("scanning");
    setProgress("Reading map data");
    try {
      const b = bounds(shapePolygon(snapshot));
      const half = Math.max(-b.minX, b.maxX, -b.minY, b.maxY) + 20;
      const [data, heights, name] = await Promise.all([
        fetchMapData(snapshot, ctrl.signal),
        loadHeights(snapshot.center, half, 256, ctrl.signal),
        placeName ? Promise.resolve(placeName) : reverseName(snapshot.center),
      ]);
      if (ctrl.signal.aborted) return;
      if (name) setPlaceName(name);
      setScan({ shape: snapshot, data, heights, layers: summarize(data, snapshot, heights) });
      setPhase("customize");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(err);
      setError("Couldn't load map data for this area. Check your connection or try a smaller area.");
      setPhase("map");
    }
  }

  async function generate() {
    if (!scan) return;
    setPhase("building");
    try {
      const out = await buildExploreModel(scan.shape, scan.data, scan.heights, { relief: relief / 100 }, setProgress);
      setFiles(out);
      setPhase("studio");
    } catch (err) {
      console.error(err);
      setError("Something went wrong while building the 3D model. Try a smaller area.");
      setPhase("customize");
    }
  }

  function cancelScan() {
    abortRef.current?.abort();
    setPhase("map");
  }

  if (phase === "studio" && files && scan) {
    const name = placeName || "Custom place";
    const hasWater = scan.layers.some((l) => l.key === "water");
    return (
      <StudioConfigurator
        type="explore"
        city={{ slug: "explore", name: "Explore" }}
        location={{
          slug: slugify(name),
          name,
          area: `${formatMeters(scan.shape.size)} ${scan.shape.kind}`,
          coords: `${scan.shape.center[1].toFixed(5)}, ${scan.shape.center[0].toFixed(5)}`,
        }}
        user={user}
        hasAccess={hasAccess}
        customFiles={files}
        initialControls={{
          enableColors: true,
          layerColors: Object.fromEntries(scan.layers.map((l) => [l.key, colors[l.key]])),
          enableWater: hasWater,
          water: 100,
        }}
        onBack={() => setPhase("customize")}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-base text-cream">
      <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-cream/[0.09] bg-deep/70 px-4 backdrop-blur-xl md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/studio"
            className="flex shrink-0 items-center gap-2 rounded-full border border-cream/[0.16] px-4 py-2 text-[12.5px] text-cream/70 no-underline transition-colors hover:border-cream/40 hover:text-cream"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Studio</span>
          </Link>
          <div className="min-w-0">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--accent)" }}>
              Explore World
            </div>
            <h1 className="m-0 truncate font-display text-[19px] font-medium leading-tight">
              {placeName || "Pick any place on Earth"}
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StepPills phase={phase} />
          <ThemeToggle />
          <Link href="/" className="hidden md:inline-flex">
            <Logo className="theme-logo h-7" />
          </Link>
        </div>
      </header>

      <main className="relative flex-1">
        <MapPicker
          shape={shape}
          onShapeChange={patchShape}
          onPlaceName={setPlaceName}
          onConfirm={startScan}
          busy={phase !== "map"}
          locked={phase !== "map"}
        />

        <AnimatePresence>
          {error && phase === "map" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#e07a5f]/50 bg-deep/90 px-5 py-2.5 font-mono text-[11.5px] text-cream backdrop-blur-md"
            >
              <span className="h-2 w-2 rounded-full bg-[#e07a5f]" />
              {error}
              <button onClick={() => setError(null)} className="text-cream/40 hover:text-cream">
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(phase === "scanning" || phase === "building") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
            >
              <div className="flex w-[300px] flex-col items-center gap-4 rounded-2xl border border-cream/[0.14] bg-panel/95 p-6 text-center shadow-2xl">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-cream/15 border-t-[color:var(--accent)]" />
                  <Globe2 className="absolute inset-0 m-auto text-cream/70" size={20} />
                </div>
                <div>
                  <div className="font-display text-[19px] font-medium">
                    {phase === "scanning" ? "Scanning the area" : "Building your model"}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">{progress}…</div>
                </div>
                {phase === "scanning" && (
                  <button
                    onClick={cancelScan}
                    className="rounded-full border border-cream/20 px-4 py-1.5 text-[12px] text-cream/70 hover:bg-cream/5"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === "customize" && scan && (
            <CustomizePanel
              scan={scan}
              placeName={placeName}
              colors={colors}
              onColor={(k, hex) => setColors((c) => ({ ...c, [k]: hex }))}
              relief={relief}
              onRelief={setRelief}
              onBack={() => setPhase("map")}
              onGenerate={generate}
              canReopen={!!files}
              onReopen={() => setPhase("studio")}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function StepPills({ phase }: { phase: Phase }) {
  const step = phase === "map" || phase === "scanning" ? 0 : 1;
  return (
    <div className="hidden items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] lg:flex">
      {["Choose place", "Colours", "Studio"].map((s, i) => (
        <span
          key={s}
          className={`rounded-full border px-2.5 py-1 ${
            i === step
              ? "border-[var(--accent)] text-[var(--accent)]"
              : i < step
                ? "border-cream/25 text-cream/60"
                : "border-cream/10 text-cream/30"
          }`}
        >
          {String(i + 1).padStart(2, "0")} {s}
        </span>
      ))}
    </div>
  );
}

function CustomizePanel({
  scan,
  placeName,
  colors,
  onColor,
  relief,
  onRelief,
  onBack,
  onGenerate,
  canReopen,
  onReopen,
}: {
  scan: Scan;
  placeName: string | null;
  colors: Record<string, string>;
  onColor: (key: ExploreLayer, hex: string) => void;
  relief: number;
  onRelief: (v: number) => void;
  onBack: () => void;
  onGenerate: () => void;
  canReopen: boolean;
  onReopen: () => void;
}) {
  const [open, setOpen] = useState<ExploreLayer | null>(null);
  const onlyTerrain = scan.layers.length === 1;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-4 left-4 right-4 top-auto z-20 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-cream/[0.14] bg-panel/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl md:bottom-5 md:left-auto md:right-5 md:top-5 md:max-h-none md:w-[360px]"
    >
      <div className="border-b border-cream/[0.09] p-5 pb-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">02</span>
          <h3 className="m-0 font-display text-[19px] font-medium">Choose colours</h3>
        </div>
        <p className="m-0 font-mono text-[10px] uppercase leading-[1.6] tracking-[0.14em] text-cream/45">
          {placeName ? `${placeName} · ` : ""}
          {formatMeters(scan.shape.size)} {scan.shape.kind} · {scan.layers.length} layers found
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {scan.layers.map((l) => {
          const hex = colors[l.key] || "#FFFFFF";
          const isOpen = open === l.key;
          return (
            <div key={l.key} className="rounded-xl border border-cream/[0.12] bg-cream/[0.03]">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : l.key)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span
                  className="h-7 w-7 shrink-0 rounded-lg border border-black/20 shadow-inner"
                  style={{ background: hex }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px]">{l.label}</span>
                  <span className="block font-mono text-[10px] text-cream/45">{l.detail}</span>
                </span>
                <span className="font-mono text-[10px] text-cream/40">{filamentName(hex)}</span>
              </button>
              {isOpen && (
                <div className="border-t border-cream/[0.09] p-3">
                  {FILAMENT_LINES.map((group) => (
                    <div key={group.line} className="mb-2 last:mb-0">
                      <div className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-cream/40">
                        Bambu {group.line}
                      </div>
                      <div className="grid grid-cols-10 gap-1.5">
                        {Object.entries(group.colors).map(([name, c]) => {
                          const on = c.toLowerCase() === hex.toLowerCase();
                          return (
                            <button
                              key={name}
                              type="button"
                              title={name}
                              onClick={() => onColor(l.key, c)}
                              className={`relative aspect-square rounded-md border border-black/20 transition-transform hover:scale-110 ${
                                on ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--color-panel)]" : ""
                              }`}
                              style={{ background: c }}
                            >
                              {on && (
                                <Check
                                  size={11}
                                  className="absolute inset-0 m-auto"
                                  color={isLight(c) ? "#000" : "#fff"}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {onlyTerrain && (
          <p className="m-0 rounded-xl border border-cream/[0.1] p-3 font-mono text-[10px] leading-[1.6] text-cream/50">
            No buildings, roads or greenery are mapped here — you&apos;ll get the terrain only. Try moving the frame
            closer to a town.
          </p>
        )}

        {!scan.heights.flat && (
          <div className="mt-1 rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-3">
            <Scrubber
              label="Terrain relief (%)"
              value={relief}
              min={100}
              max={400}
              step={10}
              decimals={0}
              onValueChange={onRelief}
            />
            <p className="m-0 mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-cream/35">
              Exaggerate hills so they show up in print
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-cream/[0.09] p-4">
        <button
          type="button"
          onClick={onGenerate}
          className="w-full rounded-full bg-cream py-3 text-[13.5px] font-medium text-[var(--color-base)] transition-transform hover:scale-[1.02]"
        >
          Generate 3D model →
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-full border border-cream/20 py-2.5 text-[12.5px] text-cream/70 hover:bg-cream/5"
          >
            ← Change area
          </button>
          {canReopen && (
            <button
              type="button"
              onClick={onReopen}
              className="flex-1 rounded-full border border-cream/20 py-2.5 text-[12.5px] text-cream/70 hover:bg-cream/5"
            >
              Back to studio
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function filamentName(hex: string): string {
  for (const g of FILAMENT_LINES) {
    for (const [name, c] of Object.entries(g.colors)) if (c.toLowerCase() === hex.toLowerCase()) return name;
  }
  return hex.toUpperCase();
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
}
