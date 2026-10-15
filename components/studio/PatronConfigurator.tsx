"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import * as THREE from "three";
import {
  printers,
  MM,
  CITY_DEFAULTS,
  DEFAULT_LAYER_COLORS,
  type CityControls,
} from "@/lib/studio";
import type { NavUser } from "@/lib/user";
import { useTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPatronModelFiles } from "@/app/studio/actions";
import type { ModelFile } from "@/app/studio/actions";
import { exportTo3MF, collectTransformedMeshes } from "@/lib/3mfExporter";
import type { GizmoMode } from "./StudioScene";

const StudioScene = dynamic(() => import("./StudioScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/55">
          Loading your model…
        </span>
      </div>
    </div>
  ),
});

type ExportFormat = "3mf" | "stl";
type Triple = [number, number, number];
type Transform = { pos: Triple; rot: Triple; scl: Triple };

const RAD = 180 / Math.PI;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function PatronConfigurator({
  username,
  user,
}: {
  username: string;
  user: NavUser | null;
}) {
  const meshRef = useRef<THREE.Object3D | null>(null);
  const { mode: themeMode } = useTheme();
  const light = themeMode === "light";

  const [modelFiles, setModelFiles] = useState<ModelFile[]>([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [printerId, setPrinterId] = useState("a1");
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [tf, setTf] = useState<Transform>({ pos: [0, 100, 0], rot: [0, 0, 0], scl: [100, 100, 100] });
  const [exportingAs, setExportingAs] = useState<ExportFormat | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"printer" | "colors" | "transform" | null>("colors");
  const [cityCtl, setCityCtl] = useState<CityControls>(CITY_DEFAULTS);

  const printer = printers.find((p) => p.id === printerId)!;

  // Subfolders in patron bucket (e.g. liverpool, main-building, etc.)
  const subfolders = useMemo(() => {
    const seen = new Set<string>();
    modelFiles.forEach((f) => {
      const key = f.partKey || f.layer;
      if (key) seen.add(key);
    });
    return Array.from(seen);
  }, [modelFiles]);

  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);

  const displayFiles = useMemo(() => {
    if (!selectedSubfolder || subfolders.length <= 1) return modelFiles;
    return modelFiles.filter(
      (f) => (f.partKey || f.layer) === selectedSubfolder
    );
  }, [modelFiles, selectedSubfolder, subfolders.length]);

  useEffect(() => {
    if (subfolders.length > 0 && !selectedSubfolder) {
      setSelectedSubfolder(subfolders[0]);
    }
  }, [subfolders, selectedSubfolder]);

  useEffect(() => {
    let cancelled = false;
    setModelLoading(true);
    setModelFiles([]);

    getPatronModelFiles(username)
      .then((files) => {
        if (cancelled) return;
        setModelFiles(files);
        setModelLoading(false);
      })
      .catch(() => {
        if (!cancelled) setModelLoading(false);
      });

    return () => { cancelled = true; };
  }, [username]);

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

  async function downloadModel(format: ExportFormat) {
    const mesh = meshRef.current;
    if (!mesh) return;

    setExportingAs(format);
    setDownloadNotice(null);

    try {
      if (format === "3mf") {
        const blob = exportTo3MF(mesh);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `framecity-custom-${username}.3mf`;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadNotice("3MF file ready!");
      } else {
        const { STLExporter } = await import(
          "three/examples/jsm/exporters/STLExporter.js"
        );
        const entries = collectTransformedMeshes(mesh);
        if (entries.length === 0) throw new Error("No visible meshes found.");

        const exportGroup = new THREE.Group();
        entries.forEach((entry) => {
          const exportMesh = new THREE.Mesh(entry.geometry);
          exportGroup.add(exportMesh);
        });

        const data = new STLExporter().parse(exportGroup, { binary: true });
        entries.forEach((e) => e.geometry.dispose());

        const buffer = (data as DataView).buffer as ArrayBuffer;
        const blob = new Blob([buffer], { type: "model/stl" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `framecity-custom-${username}.stl`;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadNotice("STL file ready!");
      }
    } catch (err) {
      console.error("Export error:", err);
      alert(`Failed to generate ${format.toUpperCase()} file.`);
    } finally {
      setExportingAs(null);
    }
  }

  const hasFiles = displayFiles.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-base text-cream">
      {/* Toast */}
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

      {/* Header */}
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
              ✦ Patron · Custom Model
            </div>
            <h1 className="m-0 truncate font-display text-[19px] font-medium leading-tight capitalize">
              {username}&apos;s Model
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
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
                  alt={user.name}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {user.initial}
                </span>
              )}
              <span className="hidden font-mono text-[11px] text-cream/60 group-hover:text-cream sm:inline">
                {user.name}
              </span>
            </a>
          )}
        </div>
      </header>

      {/* Main workspace */}
      <div className="relative flex-1 lg:h-[calc(100dvh-64px)] lg:overflow-hidden flex">
        {/* Viewport */}
        <div
          className={`studio-viewport relative h-[52vh] lg:absolute lg:inset-0 lg:h-full transition-all duration-300 ease-out ${
            activeTab ? "lg:pl-[340px]" : "lg:pl-[0px]"
          }`}
        >
          {modelLoading ? (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/55">
                  Loading your model…
                </span>
              </div>
            </div>
          ) : !hasFiles && !modelLoading ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "var(--accent)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="white" />
                </svg>
              </div>
              <div>
                <div className="font-display text-[22px] font-medium text-cream mb-2">
                  No models found
                </div>
                <p className="text-[13px] leading-[1.6] text-cream/50 max-w-[340px]">
                  No GLB or STL files were found in{" "}
                  <code className="text-cream/70">patron/{username}/</code> in R2.
                  Upload your models there to get started.
                </p>
              </div>
            </div>
          ) : (
            <StudioScene
              bedW={printer.bed[0]}
              bedD={printer.bed[1]}
              mode={mode}
              light={light}
              loading={false}
              files={displayFiles}
              cityControls={cityCtl}
              onTarget={handleTarget}
              onTransform={syncFromMesh}
            />
          )}

          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-cream/[0.12] bg-deep/60 px-[13px] py-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45 backdrop-blur-[6px] md:block">
            Drag the gizmo · scroll to zoom · right-drag to pan
          </div>
        </div>

        {/* Left panel */}
        <div className="z-20 p-4 lg:p-0 flex flex-col lg:absolute lg:left-5 lg:top-5 lg:bottom-5 pointer-events-none gap-3">
          {/* Sidebar panel */}
          <AnimatePresence mode="wait">
            {activeTab && (
              <motion.aside
                key={activeTab}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto w-[300px] rounded-2xl border border-cream/[0.14] bg-panel/95 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl overflow-hidden flex flex-col"
              >
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-cream/[0.09] px-4 py-3">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-cream/40">
                    {activeTab === "colors" ? "Layer Colors" : activeTab === "printer" ? "Printer Bed" : "Transform"}
                  </div>
                  <button
                    onClick={() => setActiveTab(null)}
                    className="text-cream/30 hover:text-cream text-[14px] cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {activeTab === "colors" && (
                    <div className="flex flex-col gap-3">
                      {/* Subfolder selector */}
                      {subfolders.length > 1 && (
                        <div className="mb-2">
                          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-cream/30">
                            Select Model
                          </div>
                          <div className="flex flex-col gap-1">
                            {subfolders.map((sf) => (
                              <button
                                key={sf}
                                onClick={() => setSelectedSubfolder(sf)}
                                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all duration-200 cursor-pointer text-[12px] font-mono capitalize ${
                                  selectedSubfolder === sf
                                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-cream"
                                    : "border-cream/[0.09] bg-cream/[0.03] text-cream/60 hover:text-cream"
                                }`}
                              >
                                {sf.replace(/-/g, " ")}
                                {selectedSubfolder === sf && (
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-cream/30 mt-1">
                        Filament Colors
                      </div>
                      {subfolders.length === 0 ? (
                        <p className="text-[12px] text-cream/40">No layers detected.</p>
                      ) : (
                        subfolders.map((sf) => (
                          <div key={sf} className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[12px] capitalize text-cream/70">
                              {sf.replace(/-/g, " ")}
                            </span>
                            <input
                              type="color"
                              defaultValue={DEFAULT_LAYER_COLORS[sf as keyof typeof DEFAULT_LAYER_COLORS] ?? "#ffffff"}
                              onChange={(e) =>
                                setCityCtl((c) => ({
                                  ...c,
                                  layerColors: { ...c.layerColors, [sf]: e.target.value },
                                }))
                              }
                              className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "printer" && (
                    <div className="flex flex-col gap-2">
                      {printers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPrinterId(p.id)}
                          className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                            printerId === p.id
                              ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-cream"
                              : "border-cream/[0.09] bg-cream/[0.03] text-cream/60 hover:border-cream/20 hover:text-cream"
                          }`}
                        >
                          <span className="font-mono text-[12px]">{p.name}</span>
                          <span className="font-mono text-[10px] text-cream/40">
                            {p.bed[0]}×{p.bed[1]}mm
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {activeTab === "transform" && (
                    <div className="flex flex-col gap-4">
                      {(["pos", "rot", "scl"] as const).map((group) => (
                        <div key={group} className="flex flex-col gap-1.5">
                          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-cream/30">
                            {group === "pos" ? "Position (mm)" : group === "rot" ? "Rotation (°)" : "Scale (%)"}
                          </div>
                          {(["x", "y", "z"] as const).map((axis, ai) => (
                            <div key={axis} className="flex items-center gap-2">
                              <span className="w-4 font-mono text-[10px] font-bold uppercase text-cream/30">{axis}</span>
                              <input
                                type="number"
                                value={round1(tf[group][ai])}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (isNaN(v)) return;
                                  setTf((t) => {
                                    const next = [...t[group]] as Triple;
                                    next[ai] = v;
                                    return { ...t, [group]: next };
                                  });
                                }}
                                className="flex-1 rounded-lg border border-cream/[0.12] bg-cream/[0.04] px-2.5 py-1.5 font-mono text-[12px] text-cream outline-none focus:border-[var(--accent)]/50"
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Download in panel */}
                <div className="border-t border-cream/[0.09] p-4 flex flex-col gap-2">
                  <button
                    onClick={() => downloadModel("3mf")}
                    disabled={!!exportingAs || modelLoading || !hasFiles}
                    className="flex w-full items-center justify-center gap-2 rounded-full py-3 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 cursor-pointer"
                    style={{ background: "var(--accent)" }}
                  >
                    {exportingAs === "3mf" ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : null}
                    Download 3MF
                  </button>
                  <button
                    onClick={() => downloadModel("stl")}
                    disabled={!!exportingAs || modelLoading || !hasFiles}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-cream/20 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-cream/80 transition-all hover:border-cream/40 hover:text-cream active:scale-[0.98] disabled:opacity-40 cursor-pointer"
                  >
                    {exportingAs === "stl" ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
                    ) : null}
                    Download STL
                  </button>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* Floating action buttons (bottom right) */}
        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-2">
          {(["colors", "printer", "transform"] as const).map((tab) => {
            const labels: Record<string, string> = { colors: "🎨", printer: "🖨️", transform: "↔️" };
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(active ? null : tab)}
                title={tab.charAt(0).toUpperCase() + tab.slice(1)}
                className={`h-11 w-11 rounded-xl border font-mono text-[16px] transition-all duration-200 cursor-pointer ${
                  active
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/20 text-cream"
                    : "border-cream/[0.14] bg-panel/80 text-cream/60 hover:bg-cream/10 hover:text-cream"
                } backdrop-blur-xl`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
