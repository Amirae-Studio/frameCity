"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type * as THREE from "three";
import { printers, MM, CITY_DEFAULTS, type CityControls } from "@/lib/studio";
import type { NavUser } from "@/lib/user";
import { useTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getModelFiles, type ModelFile } from "@/app/studio/actions";
import { recordDownload } from "@/app/actions/downloads";
import { TempAccessModal } from "@/components/TempAccessModal";
import type { GizmoMode } from "./StudioScene";

const StudioScene = dynamic(() => import("./StudioScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/55">
          Preparing the bed…
        </span>
      </div>
    </div>
  ),
});

type Triple = [number, number, number];
type Transform = { pos: Triple; rot: Triple; scl: Triple };

const INITIAL_TF: Transform = { pos: [0, 100, 0], rot: [0, 0, 0], scl: [100, 100, 100] };
const RAD = 180 / Math.PI;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function StudioConfigurator({
  city,
  location,
  user,
}: {
  city: { slug: string; name: string };
  location: { slug: string; name: string; area: string; coords: string };
  user: NavUser | null;
}) {
  const meshRef = useRef<THREE.Object3D | null>(null);
  const { mode: themeMode } = useTheme();
  const light = themeMode === "light";

  const [modelFiles, setModelFiles] = useState<ModelFile[]>([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [printerId, setPrinterId] = useState("a1");
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [tf, setTf] = useState<Transform>(INITIAL_TF);

  // Download quota & export states
  const [isExporting, setIsExporting] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadLimitModal, setDownloadLimitModal] = useState(false);
  const [tempAccessModalOpen, setTempAccessModalOpen] = useState(false);

  // Live "Manipulate city" controls — applied per layer in the scene.
  const [cityCtl, setCityCtl] = useState<CityControls>(CITY_DEFAULTS);
  const [cityOpen, setCityOpen] = useState(true);
  const setCtl = <K extends keyof CityControls>(k: K, v: CityControls[K]) =>
    setCityCtl((c) => ({ ...c, [k]: v }));

  const printer = printers.find((p) => p.id === printerId)!;

  // Only offer controls for layers that actually exist in this tile's folder.
  const layerSet = useMemo(
    () => new Set(modelFiles.map((f) => f.name)),
    [modelFiles]
  );

  // List + sign every GLB layer in this location's folder (terrain, roads,
  // buildings, …). Nothing is mounted in the scene until this settles — no
  // placeholder→model swap. Empty folder → fallback tile.
  useEffect(() => {
    let cancelled = false;
    setModelLoading(true);
    setModelFiles([]);
    setCityCtl(CITY_DEFAULTS);
    getModelFiles(`${city.slug}/${location.slug}`)
      .then((files) => {
        if (cancelled) return;
        setModelFiles(files);
        setModelLoading(false);
      })
      .catch(() => {
        if (!cancelled) setModelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [city.slug, location.slug]);

  const syncFromMesh = useCallback((mesh: THREE.Object3D) => {
    setTf({
      pos: [mesh.position.x / MM, mesh.position.y / MM, mesh.position.z / MM],
      rot: [mesh.rotation.x * RAD, mesh.rotation.y * RAD, mesh.rotation.z * RAD],
      scl: [mesh.scale.x * 100, mesh.scale.y * 100, mesh.scale.z * 100],
    });
  }, []);

  const handleTarget = useCallback(
    (obj: THREE.Object3D | null) => {
      meshRef.current = obj;
      if (obj) syncFromMesh(obj);
    },
    [syncFromMesh]
  );

  function resetGroup(group: keyof Transform) {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (group === "pos") mesh.position.set(0, mesh.scale.y, 0);
    if (group === "rot") mesh.rotation.set(0, 0, 0);
    if (group === "scl") {
      mesh.scale.set(1, 1, 1);
      mesh.position.y = 1;
    }
    syncFromMesh(mesh);
  }

  async function downloadStl() {
    const mesh = meshRef.current;
    if (!mesh) return;

    setIsExporting(true);
    setDownloadNotice(null);

    // Record download in Supabase & check monthly quota for Explorer tier
    const res = await recordDownload(city.slug, location.slug);
    if (!res.ok) {
      setIsExporting(false);
      if (res.isTempAccess) {
        setTempAccessModalOpen(true);
      } else if (res.error === "limit_reached" || res.remaining === 0) {
        setDownloadLimitModal(true);
      } else {
        alert(res.error || "Failed to process download quota.");
      }
      return;
    }

    try {
      const { STLExporter } = await import(
        "three/examples/jsm/exporters/STLExporter.js"
      );
      mesh.updateWorldMatrix(true, false);
      // STLExporter ignores `visible`, so temporarily detach hidden layers
      // (e.g. roads when "Hide roads" is on) to keep them out of the print.
      const hidden: { parent: THREE.Object3D; child: THREE.Object3D }[] = [];
      mesh.traverse((o) => {
        if (!o.visible && o.parent) hidden.push({ parent: o.parent, child: o });
      });
      hidden.forEach((h) => h.parent.remove(h.child));
      const data = new STLExporter().parse(mesh, { binary: true });
      hidden.forEach((h) => h.parent.add(h.child));
      const buffer = (data as DataView).buffer as ArrayBuffer;
      const blob = new Blob([buffer], { type: "model/stl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `framecity-${city.slug}-${location.slug}.stl`;
      a.click();
      URL.revokeObjectURL(url);

      if (res.tier === "explorer" && res.remaining !== undefined) {
        setDownloadNotice(
          `Download recorded! ${res.remaining} downloads remaining this month.`
        );
      } else {
        setDownloadNotice("Download recorded! STL file ready.");
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to generate STL file.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-base text-cream">
      {/* Toast Notice */}
      <AnimatePresence>
        {downloadNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--accent)] bg-deep/90 px-6 py-3 font-mono text-[12px] text-cream shadow-2xl backdrop-blur-md flex items-center gap-3"
          >
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <span>{downloadNotice}</span>
            <button
              onClick={() => setDownloadNotice(null)}
              className="ml-2 text-cream/40 hover:text-cream text-[14px]"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explorer Monthly Limit Modal */}
      <AnimatePresence>
        {downloadLimitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-[420px] rounded-2xl border border-cream/[0.16] bg-panel p-6 shadow-2xl"
            >
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[#e07a5f]">
                Quota Limit Reached
              </div>
              <h2 className="m-0 mb-3 font-display text-[24px] font-medium text-cream">
                Monthly Limit Reached
              </h2>
              <p className="m-0 mb-6 text-[14px] leading-[1.6] text-cream/70">
                You have reached your <strong className="text-cream">25 downloads per month</strong> limit on the Explorer tier.
                Your quota will automatically reset on the 1st of next month.
              </p>
              <div className="flex flex-col gap-2.5">
                <Link
                  href="/account"
                  className="w-full rounded-full bg-cream py-3 text-center text-[13.5px] font-medium text-[var(--color-base)] no-underline transition-transform hover:scale-[1.02]"
                >
                  View Account Quota
                </Link>
                <button
                  onClick={() => setDownloadLimitModal(false)}
                  className="w-full rounded-full border border-cream/20 py-3 text-center text-[13.5px] text-cream/70 hover:bg-cream/5"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Temporary Access Security Policy Modal */}
      <TempAccessModal
        isOpen={tempAccessModalOpen}
        onClose={() => setTempAccessModalOpen(false)}
      />

      {/* ------------------------------------------------ top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-cream/[0.09] bg-deep/70 px-4 backdrop-blur-xl md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/studio"
            className="flex shrink-0 items-center gap-2 rounded-full border border-cream/[0.16] px-4 py-2 text-[12.5px] text-cream/70 no-underline transition-colors hover:border-cream/40 hover:text-cream"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="min-w-0">
            <div
              className="font-mono text-[9px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              The Studio
            </div>
            <h1 className="m-0 truncate font-display text-[19px] font-medium leading-tight">
              {city.name} · {location.name}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {user && (
            <a
              href="/account"
              title={`Signed in as ${user.email}`}
              className="group flex items-center gap-2 rounded-full border border-cream/[0.16] py-[5px] pl-[5px] pr-3 no-underline transition-colors duration-300 hover:border-cream/40"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-[var(--color-base)]"
                  style={{ background: "var(--accent)" }}
                >
                  {user.initial}
                </span>
              )}
              <span className="hidden max-w-[90px] truncate text-[12.5px] text-cream/75 transition-colors group-hover:text-cream sm:inline">
                {user.name}
              </span>
            </a>
          )}
          <ThemeToggle />
          <button
            onClick={downloadStl}
            disabled={isExporting}
            className="group flex items-center gap-2 rounded-full bg-cream px-5 py-[10px] text-[13px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.03] disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {isExporting ? "Exporting…" : "Download"}
          </button>
        </div>
      </header>

      {/* ------------------------------------------------ workspace */}
      <div className="relative flex-1 lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
        {/* viewport */}
        <div className="studio-viewport relative h-[52vh] lg:absolute lg:inset-0 lg:h-full">
          <StudioScene
            bedW={printer.bed[0]}
            bedD={printer.bed[1]}
            mode={mode}
            light={light}
            loading={modelLoading}
            files={modelFiles}
            cityControls={cityCtl}
            onTarget={handleTarget}
            onTransform={syncFromMesh}
          />

          {/* overlays */}
          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-cream/[0.12] bg-deep/60 px-[13px] py-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45 backdrop-blur-[6px] md:block">
            Drag the gizmo · scroll to zoom · right-drag to pan
          </div>
        </div>

        {/* ------------------------------------------ left panel */}
        <aside className="m-4 rounded-2xl border border-cream/[0.12] bg-panel/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:absolute lg:bottom-5 lg:left-5 lg:top-5 lg:m-0 lg:w-[272px] lg:overflow-y-auto">
          <SectionLabel no="01" label="Printer" />
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cream/35">
            Bambu Lab
          </div>
          <PrinterSelect value={printerId} onChange={setPrinterId} />

          <div className="my-6 h-px bg-cream/[0.09]" />

          <SectionLabel no="02" label="Transform" />
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-full border border-cream/[0.14] p-1">
            {(
              [
                ["translate", "Move", MoveIcon],
                ["rotate", "Rotate", RotateIcon],
                ["scale", "Scale", ScaleIcon],
              ] as const
            ).map(([m, label, Icon]) => {
              const on = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex items-center justify-center gap-1.5 rounded-full py-[7px] text-[11.5px] transition-colors duration-200 ${
                    on ? "bg-cream text-[var(--color-base)]" : "text-cream/60 hover:text-cream"
                  }`}
                >
                  <Icon />
                  {label}
                </button>
              );
            })}
          </div>

          <ValueGroup
            label="Position"
            unit="mm"
            active={mode === "translate"}
            values={tf.pos}
            onActivate={() => setMode("translate")}
            onReset={() => resetGroup("pos")}
          />
          <ValueGroup
            label="Rotation"
            unit="°"
            active={mode === "rotate"}
            values={tf.rot}
            onActivate={() => setMode("rotate")}
            onReset={() => resetGroup("rot")}
          />
          <ValueGroup
            label="Scale"
            unit="%"
            active={mode === "scale"}
            values={tf.scl}
            onActivate={() => setMode("scale")}
            onReset={() => resetGroup("scl")}
          />

          <p className="m-0 mt-4 font-mono text-[9.5px] leading-[1.7] uppercase tracking-[0.14em] text-cream/30">
            Adjust with the gizmo in the viewport
          </p>
        </aside>

        {/* ------------------------------------------ right panel */}
        <aside className="m-4 mt-0 rounded-2xl border border-cream/[0.12] bg-panel/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:absolute lg:right-5 lg:top-5 lg:m-0 lg:max-h-[calc(100%-40px)] lg:w-[288px] lg:overflow-y-auto">
          <button
            onClick={() => setCityOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <SectionLabel no="03" label="Manipulate city" flush />
            <motion.span
              animate={{ rotate: cityOpen ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              className="text-[11px] text-cream/50"
              aria-hidden
            >
              ▾
            </motion.span>
          </button>

          <AnimatePresence initial={false}>
            {cityOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-5 pt-5">
                  {layerSet.size === 0 ? (
                    <p className="m-0 font-mono text-[9.5px] leading-[1.7] uppercase tracking-[0.14em] text-cream/30">
                      Layer controls appear once this tile&apos;s city layers
                      are loaded
                    </p>
                  ) : (
                    <>
                      {layerSet.has("small-building") && (
                        <Slider
                          label="Small building scale"
                          value={cityCtl.small}
                          min={50}
                          max={150}
                          suffix="%"
                          onChange={(v) => setCtl("small", v)}
                        />
                      )}
                      {layerSet.has("main-building") && (
                        <Slider
                          label="Large building scale"
                          value={cityCtl.large}
                          min={50}
                          max={150}
                          suffix="%"
                          onChange={(v) => setCtl("large", v)}
                        />
                      )}
                      {layerSet.has("terrain") && (
                        <Slider
                          label="Terrain height"
                          value={cityCtl.terrain}
                          min={20}
                          max={200}
                          suffix="%"
                          onChange={(v) => setCtl("terrain", v)}
                        />
                      )}
                      {layerSet.has("roads") && (
                        <Slider
                          label="Road scale"
                          value={cityCtl.roads}
                          min={50}
                          max={200}
                          suffix="%"
                          onChange={(v) => setCtl("roads", v)}
                        />
                      )}
                      {layerSet.has("trees") && (
                        <Slider
                          label="Tree scale"
                          value={cityCtl.trees}
                          min={50}
                          max={150}
                          suffix="%"
                          onChange={(v) => setCtl("trees", v)}
                        />
                      )}

                      {layerSet.has("roads") && (
                        <Toggle
                          label="Hide roads"
                          on={cityCtl.hideRoads}
                          onChange={(v) => setCtl("hideRoads", v)}
                        />
                      )}
                      {layerSet.has("trees") && (
                        <Toggle
                          label="Hide trees"
                          on={cityCtl.hideTrees}
                          onChange={(v) => setCtl("hideTrees", v)}
                        />
                      )}
                      {layerSet.has("grass") && (
                        <Toggle
                          label="Hide grass"
                          on={cityCtl.hideGrass}
                          onChange={(v) => setCtl("hideGrass", v)}
                        />
                      )}

                      {/* Revit Sub-foundation Base Frame Layer Controls */}
                      <div className="mt-2 flex flex-col gap-3 border-t border-cream/[0.09] pt-4">
                        <Toggle
                          label="Revit base frame layer"
                          on={cityCtl.enableRevit}
                          onChange={(v) => setCtl("enableRevit", v)}
                        />
                        {cityCtl.enableRevit && (
                          <div className="flex flex-col gap-4 border-l border-[var(--accent)]/40 pl-3.5 pt-1">
                            <Slider
                              label="Frame height"
                              value={cityCtl.revitHeight}
                              min={20}
                              max={300}
                              suffix="%"
                              onChange={(v) => setCtl("revitHeight", v)}
                            />
                            {/* Uniform vs Independent toggle for width/breadth */}
                            <div className="flex items-center justify-between">
                              <span className="text-[11.5px] text-cream/60">Uniform W+D</span>
                              <button
                                onClick={() => setCtl("revitUniformScale", !cityCtl.revitUniformScale)}
                                aria-pressed={cityCtl.revitUniformScale}
                                aria-label="Toggle uniform scale"
                                className="relative inline-block h-[18px] w-[32px] rounded-full transition-colors duration-200"
                                style={{
                                  background: cityCtl.revitUniformScale
                                    ? "var(--accent)"
                                    : "rgba(var(--ink-rgb), 0.18)",
                                }}
                              >
                                <motion.span
                                  className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-cream"
                                  animate={{ left: cityCtl.revitUniformScale ? 16 : 2 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                                />
                              </button>
                            </div>
                            {cityCtl.revitUniformScale ? (
                              <Slider
                                label="Frame size (W+D)"
                                value={cityCtl.revitUniform}
                                min={50}
                                max={200}
                                suffix="%"
                                onChange={(v) => setCtl("revitUniform", v)}
                              />
                            ) : (
                              <>
                                <Slider
                                  label="Frame width"
                                  value={cityCtl.revitWidth}
                                  min={50}
                                  max={200}
                                  suffix="%"
                                  onChange={(v) => setCtl("revitWidth", v)}
                                />
                                <Slider
                                  label="Frame breadth"
                                  value={cityCtl.revitBreadth}
                                  min={50}
                                  max={200}
                                  suffix="%"
                                  onChange={(v) => setCtl("revitBreadth", v)}
                                />
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <p className="m-0 border-t border-cream/[0.09] pt-4 font-mono text-[9.5px] leading-[1.7] uppercase tracking-[0.14em] text-cream/30">
                    Non-destructive — hidden layers stay out of the print
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 flex items-center justify-between border-t border-cream/[0.09] pt-4 opacity-50">
            <SectionLabel no="04" label="Materials" flush muted />
            <span className="rounded-full border border-cream/[0.2] px-2 py-[3px] font-mono text-[8.5px] font-bold uppercase tracking-[0.18em] text-cream/45">
              Soon
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- pieces */

function PrinterSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = printers.find((p) => p.id === value)!;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-[10px] border px-3.5 py-[11px] text-left transition-colors duration-200"
        style={{
          borderColor: open ? "var(--accent)" : "rgba(var(--ink-rgb),0.16)",
          background: "rgba(var(--ink-rgb),0.03)",
        }}
      >
        <span className="text-[13.5px]">{current.name}</span>
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] text-cream/45">
            {current.bed[0]}×{current.bed[1]}×{current.bed[2]}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[10px] text-cream/50"
            aria-hidden
          >
            ▾
          </motion.span>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[10px] border border-cream/[0.14] bg-panel/98 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl"
          >
            {printers.map((p) => {
              const on = p.id === value;
              return (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3.5 py-[10px] text-left transition-colors duration-150 hover:bg-cream/[0.06]"
                >
                  <span
                    className="flex items-center gap-2 text-[13.5px]"
                    style={{ color: on ? "var(--accent)" : undefined }}
                  >
                    <span
                      className="h-[6px] w-[6px] rounded-full"
                      style={{ background: on ? "var(--accent)" : "transparent" }}
                    />
                    {p.name}
                  </span>
                  <span className="font-mono text-[10px] text-cream/45">
                    {p.bed[0]}×{p.bed[1]}×{p.bed[2]}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({
  no,
  label,
  flush,
  muted,
}: {
  no: string;
  label: string;
  flush?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${flush ? "" : "mb-4"}`}>
      <span
        className="font-mono text-[10px] font-bold"
        style={{ color: muted ? "rgba(var(--ink-rgb),0.4)" : "var(--accent)" }}
      >
        {no}
      </span>
      <span className="font-display text-[17px] font-medium">{label}</span>
    </div>
  );
}

function ValueGroup({
  label,
  unit,
  values,
  active,
  onActivate,
  onReset,
}: {
  label: string;
  unit: string;
  values: [number, number, number];
  active: boolean;
  onActivate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={onActivate}
          className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
          style={{ color: active ? "var(--accent)" : "rgba(var(--ink-rgb),0.45)" }}
        >
          {label} · {unit}
        </button>
        <button
          onClick={onReset}
          title={`Reset ${label.toLowerCase()}`}
          className="text-[12px] text-cream/40 transition-colors hover:text-cream"
        >
          ↺
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <div
            key={axis}
            className="flex items-center gap-1.5 rounded-[8px] border border-cream/[0.14] px-2.5 py-[7px]"
          >
            <span className="font-mono text-[9px] text-cream/35">{axis}</span>
            <input
              readOnly
              value={round1(values[i])}
              title="Adjust with the gizmo"
              className="w-full bg-transparent font-mono text-[12px] text-cream/85 outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12.5px] text-cream/75">{label}</span>
        <span className="font-mono text-[11px] text-cream/50">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="fc-range"
        style={{ "--p": `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-cream/75">{label}</span>
      <button
        onClick={() => onChange(!on)}
        aria-pressed={on}
        aria-label={label}
        className="relative inline-block h-[18px] w-[32px] rounded-full transition-colors duration-200"
        style={{
          background: on ? "var(--accent)" : "rgba(var(--ink-rgb), 0.18)",
        }}
      >
        <motion.span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-cream"
          animate={{ left: on ? 16 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </button>
    </div>
  );
}

/* Icons */
function MoveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function RotateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66M20 3v4h-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h7v-2H7.41L20 5.41V10h2V3h-7v2h4.59L7 17.59V13H5v7h-1z"
        fill="currentColor"
      />
    </svg>
  );
}
