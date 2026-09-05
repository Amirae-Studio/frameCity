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
  FILAMENT_LINES,
  DEFAULT_LAYER_COLORS,
  type CityControls,
} from "@/lib/studio";
import type { NavUser } from "@/lib/user";
import { useTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getModelFiles, type ModelFile } from "@/app/studio/actions";
import { recordDownload } from "@/app/actions/downloads";
import { TempAccessModal } from "@/components/TempAccessModal";
import type { GizmoMode } from "./StudioScene";
import { exportTo3MF, collectTransformedMeshes } from "@/lib/3mfExporter";
import Scrubber from "../ui/Scrubber";
import { Box, Building2, Palette, PrinterIcon, Road, Shrub, SquareDimensions, TreePine } from "lucide-react";
import SegmentedToggle from "../ui/Switch";


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
  type = "city",
  city,
  location,
  user,
}: {
  type?: "city" | "building";
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

  // Active dashboard tab state
  type StudioTab = "printer" | "transform" | "city" | "revit" | "colors";
  const [activeTab, setActiveTab] = useState<StudioTab | null>("city");

  // Live "Manipulate city" controls
  const [cityCtl, setCityCtl] = useState<CityControls>(CITY_DEFAULTS);
  const setCtl = <K extends keyof CityControls>(k: K, v: CityControls[K]) =>
    setCityCtl((c) => ({ ...c, [k]: v }));

  const setLayerColor = useCallback((layerName: string, hex: string) => {
    setCityCtl((c) => ({
      ...c,
      layerColors: {
        ...c.layerColors,
        [layerName]: hex,
      },
    }));
  }, []);

  const printer = printers.find((p) => p.id === printerId)!;

  const layerSet = useMemo(
    () => new Set(modelFiles.map((f) => f.name)),
    [modelFiles]
  );

  const availableColorLayers = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (layerSet.has("trees")) list.push({ key: "trees", label: "Trees" });
    if (layerSet.has("terrain")) list.push({ key: "terrain", label: "Terrain" });
    if (layerSet.has("grass")) list.push({ key: "grass", label: "Grass" });
    if (layerSet.has("small-building")) list.push({ key: "small-building", label: "Small Buildings" });
    if (layerSet.has("main-building")) list.push({ key: "main-building", label: "Main Building" });
    if (layerSet.has("roads")) list.push({ key: "roads", label: "Roads" });
    return list;
  }, [layerSet]);

  const [activeColorTab, setActiveColorTab] = useState<string>("trees");

  useEffect(() => {
    if (
      availableColorLayers.length > 0 &&
      !availableColorLayers.some((l) => l.key === activeColorTab)
    ) {
      setActiveColorTab(availableColorLayers[0].key);
    }
  }, [availableColorLayers, activeColorTab]);

  useEffect(() => {
    let cancelled = false;
    setModelLoading(true);
    setModelFiles([]);
    setCityCtl(CITY_DEFAULTS);
    const bucket = type === "building" ? "buildings" : "city-models";
    getModelFiles(`${city.slug}/${location.slug}`, bucket)
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
  }, [city.slug, location.slug, type]);

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

    const useColors = cityCtl.enableColors;

    try {
      if (useColors) {
        const blob = exportTo3MF(mesh);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `framecity-${city.slug}-${location.slug}.3mf`;
        a.click();
        URL.revokeObjectURL(url);

        if (res.tier === "explorer" && res.remaining !== undefined) {
          setDownloadNotice(
            `Download recorded! ${res.remaining} downloads remaining this month. (3MF with colors)`
          );
        } else {
          setDownloadNotice("Download recorded! 3MF file ready — colors included.");
        }
      } else {
        const { STLExporter } = await import(
          "three/examples/jsm/exporters/STLExporter.js"
        );
        const entries = collectTransformedMeshes(mesh);
        if (entries.length === 0) {
          throw new Error("No visible meshes found to export.");
        }

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
      }
    } catch (err) {
      console.error("Export error:", err);
      alert(`Failed to generate ${useColors ? "3MF" : "STL"} file.`);
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
            title={cityCtl.enableColors ? "Download as 3MF (with colors)" : "Download as STL"}
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
            {isExporting
              ? "Exporting…"
              : cityCtl.enableColors
              ? "Download 3MF"
              : "Download"}
          </button>
        </div>
      </header>

      {/* Workspace */}
      <div className="relative flex-1 lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
        {/* Viewport */}
        <div
          className={`studio-viewport relative h-[52vh] lg:absolute lg:inset-0 lg:h-full transition-all duration-300 ease-out ${
            activeTab ? "lg:pl-[380px]" : "lg:pl-[76px]"
          }`}
        >
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

          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-cream/[0.12] bg-deep/60 px-[13px] py-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45 backdrop-blur-[6px] md:block">
            Drag the gizmo · scroll to zoom · right-drag to pan
          </div>
        </div>

        {/* Left Dashboard Dock & Collapsible Drawer Container */}
        <div className="z-20 p-4 lg:p-0 flex flex-col lg:flex-row lg:absolute lg:left-5 lg:top-5 lg:bottom-5 pointer-events-none gap-3">
          {/* Vertical Icon Rail */}
          <div className="pointer-events-auto flex lg:flex-col items-center gap-2 rounded-2xl border border-cream/[0.14] bg-panel/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl shrink-0 h-fit max-w-full overflow-x-auto lg:overflow-x-visible">
            {[
              { id: "city" as const, label: "Manipulate City", icon: <Building2  size={18} /> },
              { id: "printer" as const, label: "Printer Setup", icon: <PrinterIcon size={18} />},
              { id: "transform" as const, label: "Transform", icon: <Box size={18} /> },
              
              { id: "revit" as const, label: "Revit Base Frame", icon: <SquareDimensions  size={18} /> },
              ...(type !== "building" ? [{ id: "colors" as const, label: "Filament Colors", icon: <Palette  size={18} /> }] : []),
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => setActiveTab(active ? null : item.id)}
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ${
                    active
                      ? "bg-cream text-[var(--color-base)] shadow-md scale-105"
                      : "text-cream/65 hover:bg-cream/10 hover:text-cream"
                  }`}
                >
                  {item.icon}
                  {/* Tooltip on Desktop */}
                  <span className="pointer-events-none absolute left-14 z-30 hidden rounded-md bg-deep px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-cream opacity-0 shadow-lg transition-opacity group-hover:opacity-100 lg:block whitespace-nowrap border border-cream/20">
                    {item.label}
                  </span>
                </button>
              );
            })}

            <div className="hidden lg:block my-1 h-px w-6 bg-cream/[0.12]" />

            {/* Collapse/Expand Toggle Button */}
            <button
              type="button"
              title={activeTab ? "Collapse Panel" : "Expand Panel"}
              onClick={() => setActiveTab(activeTab ? null : "printer")}
              className="pointer-events-auto hidden lg:flex h-9 w-9 items-center justify-center rounded-xl text-cream/40 transition-colors hover:bg-cream/10 hover:text-cream"
            >
              <motion.span
                animate={{ rotate: activeTab ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="text-[18px]"
              >
                ‹
              </motion.span>
            </button>
          </div>

          {/* Drawer Content Panel */}
          <AnimatePresence mode="wait">
            {activeTab && (
              <motion.aside
                key={activeTab}
                initial={{ opacity: 0, x: -16, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto rounded-2xl border border-cream/[0.14] bg-panel/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl lg:w-[310px] w-full lg:max-h-full lg:overflow-y-auto max-h-[55vh] overflow-y-auto"
              >
                <div className="mb-4 flex items-center justify-between border-b border-cream/[0.09] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">
                      {activeTab === "printer" && "02"}
                      {activeTab === "transform" && "03"}
                      {activeTab === "city" && "01"}
                      {activeTab === "revit" && "04"}
                      {activeTab === "colors" && "05"}
                    </span>
                    <h3 className="m-0 font-display text-[17px] font-medium capitalize text-cream">
                      {activeTab === "printer" && "Printer Setup"}
                      {activeTab === "transform" && "Transform"}
                      {activeTab === "city" && "Manipulate City"}
                      {activeTab === "revit" && "Revit Base Frame"}
                      {activeTab === "colors" && "Filament Colors"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-cream/40 transition-colors hover:bg-cream/10 hover:text-cream"
                    title="Close Panel"
                  >
                    ✕
                  </button>
                </div>

                {/* Tab 1: Printer */}
                {activeTab === "printer" && (
                  <div className="flex flex-col gap-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45">
                      Select 3D Printer Model
                    </div>
                    <PrinterSelect value={printerId} onChange={setPrinterId} />
                    <div className="rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-3.5 flex flex-col gap-2">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-cream/55 font-mono text-[11px]">Bed Dimensions</span>
                        <span className="font-mono font-bold text-cream">
                          {printer.bed[0]} × {printer.bed[1]} × {printer.bed[2]} mm
                        </span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-cream/55 font-mono text-[11px]">Build Volume</span>
                        <span className="font-mono text-cream/80">
                          {((printer.bed[0] * printer.bed[1] * printer.bed[2]) / 1000000).toFixed(2)} L
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Transform */}
                {activeTab === "transform" && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-3 gap-1 rounded-full border border-cream/[0.14] p-1">
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
                            type="button"
                            onClick={() => setMode(m)}
                            className={`flex items-center justify-center gap-1.5 rounded-full py-[7px] text-[11.5px] transition-colors duration-200 ${
                              on ? "bg-cream text-[var(--color-base)] font-medium" : "text-cream/60 hover:text-cream"
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

                    <p className="m-0 font-mono text-[9.5px] leading-[1.7] uppercase tracking-[0.14em] text-cream/30">
                      Adjust with the gizmo in the 3D viewport
                    </p>
                  </div>
                )}

                {/* Tab 3: Manipulate City */}
                {activeTab === "city" && (
                  <div className="flex flex-col gap-4">
                    {layerSet.size === 0 ? (
                      <p className="m-0 font-mono text-[9.5px] leading-[1.7] uppercase tracking-[0.14em] text-cream/30">
                        Layer controls appear once this tile&apos;s city layers are loaded
                      </p>
                    ) : (
                      <>
                        {layerSet.has("small-building") && (
                          <Scrubber
                            label="Small buildings"
                            value={cityCtl.small}
                            min={50}
                            max={150}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("small", v)}
                          />
                        )}
                        {layerSet.has("main-building") && (
                          <Scrubber
                            label="Large buildings"
                            value={cityCtl.large}
                            min={50}
                            max={150}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("large", v)}
                          />
                        )}
                        {layerSet.has("terrain") && (
                          <Scrubber
                            label="Terrain height"
                            value={cityCtl.terrain}
                            min={20}
                            max={200}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("terrain", v)}
                          />
                        )}
                        {layerSet.has("roads") && (
                          <Scrubber
                            label="Road scale"
                            value={cityCtl.roads}
                            min={50}
                            max={200}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("roads", v)}
                          />
                        )}
                        {layerSet.has("trees") && (
                          <Scrubber
                            label="Tree scale"
                            value={cityCtl.trees}
                            min={50}
                            max={150}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("trees", v)}
                          />
                        )}

                        <div className="flex flex-col gap-2 pt-2 border-t border-cream/[0.09]">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cream/45">
                            Hide Layers
                          </span>
                          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-cream/[0.14] p-1.5 bg-cream/[0.03]">
                            {layerSet.has("roads") && (
                              <button
  type="button"
  onClick={() => setCtl("hideRoads", !cityCtl.hideRoads)}
  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-center font-mono text-[10.5px] font-bold uppercase tracking-wider transition-all duration-200 truncate ${
    cityCtl.hideRoads
      ? "bg-cream text-[var(--color-base)] shadow-md scale-[1.01]"
      : "text-cream/65 hover:text-cream hover:bg-cream/[0.06]"
  }`}
>
  <span>Roads</span>
  <Road size={14} />
</button>
                            )}
                            {layerSet.has("trees") && (
                             <button
  type="button"
  onClick={() => setCtl("hideTrees", !cityCtl.hideTrees)}
  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-center font-mono text-[10.5px] font-bold uppercase tracking-wider transition-all duration-200 truncate ${
    cityCtl.hideTrees
      ? "bg-cream text-[var(--color-base)] shadow-md scale-[1.01]"
      : "text-cream/65 hover:text-cream hover:bg-cream/[0.06]"
  }`}
>
  <span>Trees</span>
  <TreePine size={14} />
</button>
                            )}
                            {layerSet.has("grass") && (
                             <button
  type="button"
  onClick={() => setCtl("hideGrass", !cityCtl.hideGrass)}
  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 text-center font-mono text-[10.5px] font-bold uppercase tracking-wider transition-all duration-200 truncate ${
    cityCtl.hideGrass
      ? "bg-cream text-[var(--color-base)] shadow-md scale-[1.01]"
                                    : "text-cream/65 hover:text-cream hover:bg-cream/[0.06]"
                                }`}
                              >
                                <span>Grass</span>
  <Shrub  size={14}/>
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    <p className="m-0 border-t border-cream/[0.09] pt-3 font-mono text-[9.5px] leading-[1.7] uppercase tracking-[0.14em] text-cream/30">
                      Non-destructive — hidden layers stay out of the print
                    </p>
                  </div>
                )}

                {/* Tab 4: Revit Base Frame */}
                {activeTab === "revit" && (
                  <div className="flex flex-col gap-4">
                    <SegmentedToggle
                      label="Revit base frame layer"
                      checked={cityCtl.enableRevit}
                      onCheckedChange={(v) => setCtl("enableRevit", v)}
                    />
                    {cityCtl.enableRevit && (
                      <div className="flex flex-col gap-3.5 border-l border-[var(--accent)]/40 pl-3.5 pt-1">
                        <Scrubber
                          label={`Frame height (${(cityCtl.revitHeight / 100).toFixed(1)} cm)`}
                          value={cityCtl.revitHeight}
                          min={20}
                          max={300}
                          step={1}
                          decimals={0}
                          onValueChange={(v) => setCtl("revitHeight", v)}
                        />
                        
                        <SegmentedToggle
                          label="Uniform W+D"
                          checked={cityCtl.revitUniformScale}
                          onCheckedChange={(v) => setCtl("revitUniformScale", v)}
                        />

                        {cityCtl.revitUniformScale ? (
                          <Scrubber
                            label="Frame size (W+D)"
                            value={cityCtl.revitUniform}
                            min={50}
                            max={200}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("revitUniform", v)}
                          />
                        ) : (
                          <>
                            <Scrubber
                              label="Frame width"
                              value={cityCtl.revitWidth}
                              min={50}
                              max={200}
                              step={1}
                              decimals={0}
                              onValueChange={(v) => setCtl("revitWidth", v)}
                            />
                            <Scrubber
                              label="Frame breadth"
                              value={cityCtl.revitBreadth}
                              min={50}
                              max={200}
                              step={1}
                              decimals={0}
                              onValueChange={(v) => setCtl("revitBreadth", v)}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 5: Filament Colors */}
                {activeTab === "colors" && type !== "building" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cream/70">
                        Multi-color Printing
                      </span>
                      <SegmentedToggle
                        checked={cityCtl.enableColors}
                        onCheckedChange={(v) => setCtl("enableColors", v)}
                      />
                    </div>

                    {cityCtl.enableColors ? (
                      <div className="flex flex-col gap-3 pt-2">
                        {availableColorLayers.length > 1 && (
                          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-cream/[0.14] p-1.5 bg-cream/[0.03]">
                            {availableColorLayers.map((l) => {
                              const active = l.key === activeColorTab;
                              return (
                                <button
                                  key={l.key}
                                  type="button"
                                  onClick={() => setActiveColorTab(l.key)}
                                  className={`rounded-lg py-1.5 px-2.5 text-center font-mono text-[10.5px] font-bold uppercase tracking-wider transition-all duration-200 truncate ${
                                    active
                                      ? "bg-cream text-[var(--color-base)] shadow-md scale-[1.01]"
                                      : "text-cream/65 hover:text-cream hover:bg-cream/[0.06]"
                                  }`}
                                >
                                  {l.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {activeColorTab === "trees" && layerSet.has("trees") && (
                          <FilamentColorCard
                            title="TREES COLOUR"
                            value={cityCtl.layerColors.trees || DEFAULT_LAYER_COLORS.trees}
                            onChange={(hex) => setLayerColor("trees", hex)}
                          />
                        )}
                        {activeColorTab === "terrain" && layerSet.has("terrain") && (
                          <FilamentColorCard
                            title="TERRAIN COLOUR"
                            value={cityCtl.layerColors.terrain || DEFAULT_LAYER_COLORS.terrain}
                            onChange={(hex) => setLayerColor("terrain", hex)}
                          />
                        )}
                        {activeColorTab === "grass" && layerSet.has("grass") && (
                          <FilamentColorCard
                            title="GRASS COLOUR"
                            value={cityCtl.layerColors.grass || DEFAULT_LAYER_COLORS.grass}
                            onChange={(hex) => setLayerColor("grass", hex)}
                          />
                        )}
                        {activeColorTab === "small-building" && layerSet.has("small-building") && (
                          <FilamentColorCard
                            title="SMALL BUILDINGS COLOUR"
                            value={cityCtl.layerColors["small-building"] || DEFAULT_LAYER_COLORS["small-building"]}
                            onChange={(hex) => setLayerColor("small-building", hex)}
                          />
                        )}
                        {activeColorTab === "main-building" && layerSet.has("main-building") && (
                          <FilamentColorCard
                            title="MAIN BUILDING COLOUR"
                            value={cityCtl.layerColors["main-building"] || DEFAULT_LAYER_COLORS["main-building"]}
                            onChange={(hex) => setLayerColor("main-building", hex)}
                          />
                        )}
                        {activeColorTab === "roads" && layerSet.has("roads") && (
                          <FilamentColorCard
                            title="ROADS COLOUR"
                            value={cityCtl.layerColors.roads || DEFAULT_LAYER_COLORS.roads}
                            onChange={(hex) => setLayerColor("roads", hex)}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="m-0 font-mono text-[10px] leading-[1.7] uppercase tracking-[0.14em] text-cream/40">
                        Enable filament colors to customize color palette for 3MF multi-color exporting.
                      </p>
                    )}
                  </div>
                )}
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* Helper Components */

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

function FilamentColorCard({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const selectedInfo = useMemo(() => {
    for (const group of FILAMENT_LINES) {
      for (const [name, hex] of Object.entries(group.colors)) {
        if (hex.toLowerCase() === value.toLowerCase()) {
          return { name, hex: hex.toUpperCase(), line: group.line };
        }
      }
    }
    return { name: "Jade White", hex: "#FFFFFF", line: "PLA Basic" };
  }, [value]);

  return (
    <div
      className="rounded-[20px] border border-[#E6E1D5] p-4 shadow-xl transition-all duration-200"
      style={{ backgroundColor: "#FDFBF7", color: "#161D18" }}
    >
      <div
        className="mb-2.5 font-mono text-[11.5px] font-extrabold uppercase tracking-[0.2em]"
        style={{ color: "#161D18" }}
      >
        {title}
      </div>

      {FILAMENT_LINES.map((group, groupIdx) => (
        <div key={group.line} className={groupIdx > 0 ? "mt-3.5" : ""}>
          <div
            className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#637067" }}
          >
            BAMBU {group.line}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Object.entries(group.colors).map(([colorName, hex]) => {
              const isSelected = hex.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={colorName}
                  type="button"
                  title={`${colorName} (${hex})`}
                  onClick={() => onChange(hex)}
                  className={`relative h-6.5 w-6.5 sm:h-7 sm:w-7 rounded-[8px] border transition-transform duration-150 active:scale-90 hover:scale-110 ${
                    isSelected
                      ? "ring-2 ring-[#161D18] ring-offset-2 ring-offset-[#FDFBF7] z-10 scale-105"
                      : "border-black/15 opacity-90 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>
        </div>
      ))}

      <div
        className="mt-3.5 border-t border-dashed pt-2.5 font-mono text-[12px] font-bold flex items-center justify-between"
        style={{ borderColor: "#E0DACC", color: "#161D18" }}
      >
        <span>{selectedInfo.name}</span>
        <span className="text-[10.5px] font-semibold" style={{ color: "#637067" }}>
          {selectedInfo.hex}
        </span>
      </div>
    </div>
  );
}

