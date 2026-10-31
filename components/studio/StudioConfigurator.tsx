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
  fitScale,
  usableBed,
  type CityControls,
} from "@/lib/studio";
import type { NavUser } from "@/lib/user";
import { useTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getModelFiles, getPatronModelFiles, type ModelFile } from "@/app/studio/actions";
import { recordDownload } from "@/app/actions/downloads";
import { TempAccessModal } from "@/components/TempAccessModal";
import { BackerCrowdfundModal } from "@/components/BackerCrowdfundModal";
import { ConnectStudioModal } from "@/components/ConnectStudioModal";
import type { GizmoMode } from "./StudioScene";
import { exportTo3MF, collectTransformedMeshes, type ExtraPlate } from "@/lib/3mfExporter";
import Scrubber from "../ui/Scrubber";
import { Building2, Frame, Palette, Road, Ruler, Shrub, SquareDimensions, TreePine } from "lucide-react";
import { SizePanel, BED_MARGIN, type Dims, type SizeAxis } from "./SizePanel";
import { FramePanel } from "./FramePanel";
import { buildFrame, frameSTL, seatHeight, FRAME_DEFAULTS, type FrameBuild, type FrameOptions } from "@/lib/frame";
import SegmentedToggle from "../ui/Switch";
import { TerrainModePicker, type TerrainChoice } from "@/components/explore/TerrainModePicker";


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

type ExportFormat = "3mf" | "stl";

/** World-space bounds of everything visible under `root` — what will print. */
function measureVisible(root: THREE.Object3D, refresh: boolean): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    // Layer controls move vertices in place, so their bounds go stale.
    if (refresh || !m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
  });
  return box;
}

export function StudioConfigurator({
  type = "city",
  city,
  location,
  user,
  hasAccess = false,
  patronUsername,
  customFiles,
  initialControls,
  onBack,
  terrainControl,
}: {
  type?: "city" | "building" | "patron" | "explore";
  city: { slug: string; name: string };
  location: { slug: string; name: string; area: string; coords: string };
  user: NavUser | null;
  hasAccess?: boolean;
  patronUsername?: string;
  /** Pre-built layers (Explore World) — skips fetching from R2. */
  customFiles?: ModelFile[];
  initialControls?: Partial<CityControls>;
  /** Replaces the Back link (Explore World returns to its map). */
  onBack?: () => void;
  /** Explore World: smooth or flat ground. The parent
   *  rebuilds the model and passes new customFiles; controls are kept. */
  terrainControl?: TerrainChoice & { busy: boolean; onChange: (t: TerrainChoice) => void };
}) {
  const meshRef = useRef<THREE.Object3D | null>(null);
  const { mode: themeMode } = useTheme();
  const light = themeMode === "light";

  const [modelFiles, setModelFiles] = useState<ModelFile[]>([]);
  const [modelLoading, setModelLoading] = useState(true);
  const [printerId, setPrinterId] = useState("a1");
  const [mode, setMode] = useState<GizmoMode | null>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [moved, setMoved] = useState(false);
  // Where the model sits in the scene, so the frame can wrap around it.
  const [seat, setSeat] = useState<{ x: number; z: number; y: number } | null>(null);

  // Picture frame for the model
  const [frameOn, setFrameOn] = useState(false);
  const [frameOpts, setFrameOpts] = useState<FrameOptions>(FRAME_DEFAULTS);
  const [frame, setFrame] = useState<FrameBuild | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);
  const [frameDownload, setFrameDownload] = useState<"stl" | "3mf" | null>(null);
  const patchFrame = useCallback((p: Partial<FrameOptions>) => setFrameOpts((o) => ({ ...o, ...p })), []);

  // Download quota & export states
  const [exportingAs, setExportingAs] = useState<ExportFormat | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [downloadLimitModal, setDownloadLimitModal] = useState(false);
  const [tempAccessModalOpen, setTempAccessModalOpen] = useState(false);
  const [backerCrowdfundModalOpen, setBackerCrowdfundModalOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [revitInfoModal, setRevitInfoModal] = useState(false);

  // Active dashboard tab state
  type StudioTab = "size" | "frame" | "city" | "revit" | "colors";
  const [activeTab, setActiveTab] = useState<StudioTab | null>("city");

  // Live "Manipulate city" controls
  const [cityCtl, setCityCtl] = useState<CityControls>(CITY_DEFAULTS);
  const setCtl = <K extends keyof CityControls>(k: K, v: CityControls[K]) =>
    setCityCtl((c) => ({ ...c, [k]: v }));

  const resetCtl = (k: keyof CityControls) => setCtl(k, CITY_DEFAULTS[k]);
  const atDefault = (k: keyof CityControls) => cityCtl[k] === CITY_DEFAULTS[k];

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
    () => new Set(modelFiles.map((f) => f.layer || f.name)),
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
    if (layerSet.has("water")) list.push({ key: "water", label: "Water" });
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

  // Controls reset only when a different model opens — not when Explore World
  // rebuilds the same place (e.g. after a terrain change).
  const modelKey = `${type}|${city.slug}|${location.slug}|${patronUsername ?? ""}`;
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sameModel = loadedKey.current === modelKey;
    loadedKey.current = modelKey;
    if (!sameModel) setCityCtl({ ...CITY_DEFAULTS, ...initialControls });

    if (customFiles) {
      // Swap straight to the rebuilt layers — no empty flash in between.
      setModelFiles(customFiles);
      setModelLoading(false);
      return;
    }

    setModelLoading(true);
    setModelFiles([]);

    if (type === "patron") {
      const username = patronUsername || city.slug;
      const subfolder = location.slug && location.slug !== username ? location.slug : undefined;
      getPatronModelFiles(username, subfolder)
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
    }

    const bucket = type === "building" ? "buildings" : "city-models";

    // Prefix format for R2 bucket queries (e.g. paris/tour-eiffel)
    const prefix = `${city.slug}/${location.slug}`;

    getModelFiles(prefix, bucket)
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
    // initialControls is read once per model, alongside customFiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.slug, location.slug, type, patronUsername, customFiles]);


  /** Re-reads the printed size from the scene. */
  const measure = useCallback((refresh = false) => {
    const mesh = meshRef.current;
    if (!mesh) return setDims(null);
    const box = measureVisible(mesh, refresh);
    if (box.isEmpty()) return setDims(null);
    const size = box.getSize(new THREE.Vector3()).divideScalar(MM);
    setDims({ w: size.x, d: size.z, h: size.y });
    const c = box.getCenter(new THREE.Vector3());
    setSeat({ x: c.x, z: c.z, y: box.min.y });
    const atRest =
      mesh.scale.equals(new THREE.Vector3(1, 1, 1)) &&
      mesh.rotation.x === 0 && mesh.rotation.y === 0 && mesh.rotation.z === 0 &&
      Math.abs(mesh.position.x) < 1e-6 && Math.abs(mesh.position.z) < 1e-6;
    setMoved(!atRest);
  }, []);

  const syncFromMesh = useCallback(() => measure(false), [measure]);

  const handleTarget = useCallback(
    (obj: THREE.Object3D | null) => {
      meshRef.current = obj;
      // The model's layer controls apply in an effect after mount.
      setTimeout(() => measure(true), 60);
    },
    [measure]
  );

  // Layer sliders (heights, base frame, water) change the printed size.
  useEffect(() => {
    const t = setTimeout(() => measure(true), 60);
    return () => clearTimeout(t);
  }, [cityCtl, modelFiles, measure]);

  // Rebuild the frame when its options or the model's footprint change.
  // Rounded so a re-measure that moves nothing doesn't rebuild.
  const tileW = dims ? Math.round(dims.w * 10) / 10 : 0;
  const tileD = dims ? Math.round(dims.d * 10) / 10 : 0;
  useEffect(() => {
    if (!frameOn || !tileW || !tileD) return;
    let cancelled = false;
    setFrameBusy(true);
    const t = setTimeout(async () => {
      try {
        const built = await buildFrame({ w: tileW, d: tileD }, frameOpts);
        if (cancelled) return built.geometry.dispose();
        setFrame((old) => {
          old?.geometry.dispose();
          return built;
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setFrameBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [frameOn, frameOpts, tileW, tileD]);

  function openFrame() {
    setFrameOn(true);
    setActiveTab("frame");
  }

  /** Shrinks the model so the frame around it fits the printer bed. */
  function shrinkForFrame() {
    const mesh = meshRef.current;
    if (!mesh || !dims) return;
    // Scale the model so model + border fits: solve for the frame's outer size.
    const extra = 2 * (frameOpts.border + frameOpts.clearance);
    const [aw, ad] = usableBed(printer, dims.w + extra, dims.d + extra, BED_MARGIN);
    const f = Math.min((aw - extra) / dims.w, (ad - extra) / dims.d);
    if (f >= 1) return;
    mesh.scale.multiplyScalar(f);
    dropToBed(mesh);
    measure(false);
  }

  /** The frame as a 3MF plate object: the body, plus the letters as a second-colour part. */
  function framePlate(f: FrameBuild): ExtraPlate {
    return {
      name: "Frame",
      geometry: f.geometry,
      color: frameOpts.color,
      parts: f.text ? [{ name: "Frame text", geometry: f.text, color: frameOpts.labelColor }] : [],
      opening: frameOpts.back === "open" ? [f.size.opening.w - frameOpts.lip * 2, f.size.opening.d - frameOpts.lip * 2] : undefined,
    };
  }

  async function downloadFrame(format: "stl" | "3mf") {
    if (!hasAccess) {
      setBackerCrowdfundModalOpen(true);
      return;
    }
    if (!frame) return;
    setFrameDownload(format);
    try {
      const blob =
        format === "stl"
          ? await frameSTL(frame.text ? [frame.geometry, frame.text] : [frame.geometry])
          : await exportTo3MF(new THREE.Group(), {
              printerId,
              frameOnly: framePlate(frame),
            });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `framecity-${city.slug}-${location.slug}-frame.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadNotice(`Frame ${format.toUpperCase()} ready — ${Math.round(frame.size.w)} × ${Math.round(frame.size.d)} mm.`);
    } catch (err) {
      console.error(err);
      alert("Couldn't export the frame.");
    } finally {
      setFrameDownload(null);
    }
  }

  /** Sits the model on the bed: lowest point at zero height. */
  function dropToBed(mesh: THREE.Object3D) {
    const box = measureVisible(mesh, false);
    if (!box.isEmpty()) mesh.position.y -= box.min.y;
  }

  function setSize(axis: SizeAxis, mm: number) {
    const mesh = meshRef.current;
    if (!mesh || !dims || !dims[axis]) return;
    const f = mm / dims[axis];
    if (lockRatio) mesh.scale.multiplyScalar(f);
    else if (axis === "h") mesh.scale.y *= f;
    else {
      // Width/depth are world X/Z; after a quarter turn they map to the other local axis.
      const swapped = Math.abs(Math.sin(mesh.rotation.y)) > 0.7;
      const local = (axis === "w") !== swapped ? "x" : "z";
      mesh.scale[local] *= f;
    }
    dropToBed(mesh);
    measure(false);
  }

  function fitToBed() {
    const mesh = meshRef.current;
    if (!mesh || !dims) return;
    const f = fitScale(printer, dims.w, dims.d, dims.h, BED_MARGIN);
    mesh.scale.multiplyScalar(f);
    mesh.position.x = 0;
    mesh.position.z = 0;
    dropToBed(mesh);
    measure(false);
  }

  function centreOnBed() {
    const mesh = meshRef.current;
    if (!mesh) return;
    const box = measureVisible(mesh, false);
    const c = box.getCenter(new THREE.Vector3());
    mesh.position.x -= c.x;
    mesh.position.z -= c.z;
    dropToBed(mesh);
    measure(false);
  }

  function turn90() {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y = (mesh.rotation.y + Math.PI / 2) % (Math.PI * 2);
    if (Math.abs(mesh.rotation.y) < 1e-6) mesh.rotation.y = 0;
    centreOnBed();
  }

  function resetTransform() {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.scale.set(1, 1, 1);
    mesh.rotation.set(0, 0, 0);
    mesh.position.set(0, mesh.position.y, 0);
    dropToBed(mesh);
    measure(false);
  }

  // Either format is available at any point. Colours are a property of the
  // model, not a precondition for 3MF — with them off it just exports in one
  // colour.
  async function downloadModel(format: ExportFormat) {
    if (!hasAccess) {
      setBackerCrowdfundModalOpen(true);
      return;
    }

    const mesh = meshRef.current;
    if (!mesh) return;

    setExportingAs(format);
    setDownloadNotice(null);

    const res = await recordDownload(city.slug, location.slug);
    if (!res.ok) {
      setExportingAs(null);
      if (res.isTempAccess) {
        setTempAccessModalOpen(true);
      } else if (res.error === "limit_reached" || res.remaining === 0) {
        setDownloadLimitModal(true);
      } else if (
        res.error?.includes("unlock access") ||
        res.error?.includes("valid code") ||
        res.error === "Not authenticated"
      ) {
        setBackerCrowdfundModalOpen(true);
      } else {
        alert(res.error || "Failed to process download quota.");
      }
      return;
    }

    try {
      if (format === "3mf") {
        const withFrame = frameOn && frame;
        const blob = await exportTo3MF(mesh, {
          printerId,
          extra: withFrame ? [framePlate(frame)] : [],
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `framecity-${city.slug}-${location.slug}.3mf`;
        a.click();
        URL.revokeObjectURL(url);

        const colorNote =
          (cityCtl.enableColors
            ? " — colors included"
            : " — single color. Turn on Filament Colors for a multi-color file") +
          (withFrame ? ". Frame is on plate 2." : ".");
        if (res.tier === "explorer" && res.remaining !== undefined) {
          setDownloadNotice(
            `Download recorded! ${res.remaining} downloads remaining this month. (3MF)`
          );
        } else {
          setDownloadNotice(`Download recorded! 3MF file ready${colorNote}`);
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
      alert(`Failed to generate ${format.toUpperCase()} file.`);
    } finally {
      setExportingAs(null);
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

      {/* Crowdfunding Backer Modal (MakerWorld & Kickstarter) */}
      <BackerCrowdfundModal
        isOpen={backerCrowdfundModalOpen}
        onClose={() => setBackerCrowdfundModalOpen(false)}
        onOpenConnectModal={() => setConnectModalOpen(true)}
      />

      {/* Connect Studio Modal */}
      <ConnectStudioModal
        isOpen={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
        email={user?.email || ""}
      />

      {/* Revit Info Modal */}
      <AnimatePresence>
        {revitInfoModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.75)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setRevitInfoModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[600px] max-h-[88vh] overflow-y-auto rounded-2xl border border-cream/[0.16] shadow-[0_32px_80px_rgba(0,0,0,0.6)]"
              style={{ background: "#0e1412" }}
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cream/[0.09] px-6 py-4" style={{ background: "#0e1412" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "var(--accent)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="14" width="20" height="6" rx="1.5" stroke="white" strokeWidth="1.8"/>
                      <rect x="5" y="4" width="14" height="10" rx="1" stroke="white" strokeWidth="1.8"/>
                    </svg>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--accent)" }}>Learn More</div>
                    <h2 className="m-0 font-display text-[20px] font-medium text-[#fff]">What is the Revit Base Frame?</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRevitInfoModal(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-[#fff]/40 transition-colors hover:bg-cream/10 hover:text-[#fff]/40 text-[16px]"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex flex-col gap-6 p-6">

                {/* Hero Image 1 */}
                <div className="overflow-hidden rounded-xl border border-cream/[0.12]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/revit.jpg"
                    alt="Revit base frame explainer — city model sitting on a rigid base plate"
                    className="w-full object-cover"
                    style={{ maxHeight: "260px" }}
                  />
                </div>

                {/* Section 1 */}
                <div className="flex flex-col gap-2">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>What it is</div>
                  <p className="m-0 text-[13.5px] leading-[1.7] text-[#ffff]">
                    A flat, rigid rectangular plate generated directly beneath your city model. It serves as a structural mounting board and provides a seamless contact layer, making it much easier to securely anchor and attach your exported Revit geometry to the base.
                  </p>
                </div>

                

                

                {/* Section 2 — How to use */}
                <div className="flex flex-col gap-3 rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-4">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>How to use it</div>
                  <ol className="m-0 flex flex-col gap-2 pl-0 list-none">
                    {[
                      { step: "01", text: "Toggle on \"Revit base frame layer\" in the controls above." },
                      { step: "02", text: "Adjust the Frame Height to how thick you want the base (in mm)." },
                      { step: "03", text: "Use Uniform W+D to lock width and depth, or control them independently." },
                      { step: "04", text: "Download your model — the base frame is merged automatically." },
                    ].map((s) => (
                      <li key={s.step} className="flex items-start gap-3">
                        <span className="mt-[1px] shrink-0 font-mono text-[10px] font-bold" style={{ color: "var(--accent)" }}>{s.step}</span>
                        <span className="text-[12.5px] leading-[1.6] text-[#ffff]">{s.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setRevitInfoModal(false)}
                  className="w-full rounded-full py-3 text-[13px] font-medium text-[var(--color-base)] transition-transform hover:scale-[1.02]"
                  style={{ background: "var(--accent)" }}
                >
                  Got it — back to settings
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-cream/[0.09] bg-deep/70 px-4 backdrop-blur-xl md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex shrink-0 items-center gap-2 rounded-full border border-cream/[0.16] px-4 py-2 text-[12.5px] text-cream/70 transition-colors hover:border-cream/40 hover:text-cream"
            >
              <span aria-hidden>←</span>
              <span className="hidden sm:inline">Map</span>
            </button>
          ) : (
            <Link
              href="/studio"
              className="flex shrink-0 items-center gap-2 rounded-full border border-cream/[0.16] px-4 py-2 text-[12.5px] text-cream/70 no-underline transition-colors hover:border-cream/40 hover:text-cream"
            >
              <span aria-hidden>←</span>
              <span className="hidden sm:inline">Back</span>
            </Link>
          )}
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
          {!hasAccess && (
            <button
              onClick={() => setConnectModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all cursor-pointer"
              title="Studio View Only — Click to Connect Access Code"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span>View Only · Connect Code</span>
            </button>
          )}
          <ThemeToggle />
          <button
            onClick={openFrame}
            className={`hidden items-center gap-1.5 rounded-full border px-3.5 py-[9px] font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors duration-200 sm:flex ${
              frameOn
                ? "border-[var(--accent)]/60 text-[var(--accent)]"
                : "border-cream/25 text-cream/70 hover:border-cream/45 hover:text-cream"
            }`}
            title={frameOn ? "Edit the frame" : "Design a frame for this model"}
          >
            <Frame size={13} />
            {frameOn ? "Frame on" : "Add frame"}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => downloadModel("3mf")}
              disabled={exportingAs !== null}
              className="group flex items-center gap-2 rounded-full bg-cream px-5 py-[10px] text-[13px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.03] disabled:opacity-50"
              title="Download as 3MF — keeps layers separate for multi-color printing"
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
              {exportingAs === "3mf" ? (
                "Exporting…"
              ) : (
                <>
                  <span className="hidden sm:inline">Download </span>3MF
                </>
              )}
            </button>
            <button
              onClick={() => downloadModel("stl")}
              disabled={exportingAs !== null}
              className="rounded-full border border-cream/25 px-3.5 py-[9px] font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-cream/70 transition-colors duration-200 hover:border-cream/45 hover:text-cream disabled:opacity-50"
              title="Download as STL — a single merged mesh"
            >
              {exportingAs === "stl" ? "…" : "STL"}
            </button>
          </div>
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
            frame={
              frameOn && frame && seat
                ? {
                    geometry: frame.geometry,
                    color: frameOpts.color,
                    // The model's base rests on the frame's ledge / back panel.
                    position: [seat.x, seat.y - seatHeight(frameOpts) * MM, seat.z],
                    text: frame.text ? { geometry: frame.text, color: frameOpts.labelColor } : null,
                  }
                : null
            }
          />

          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-cream/[0.12] bg-deep/60 px-[13px] py-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45 backdrop-blur-[6px] md:block">
            {mode ? "Drag the gizmo · " : "Drag to orbit · "}scroll to zoom · right-drag to pan
          </div>
        </div>

        {/* Left Dashboard Dock & Collapsible Drawer Container */}
        <div className="z-20 p-4 lg:p-0 flex flex-col lg:flex-row lg:absolute lg:left-5 lg:top-5 lg:bottom-5 pointer-events-none gap-3">
          {/* Vertical Icon Rail */}
          <div className="pointer-events-auto flex lg:flex-col items-center gap-2 rounded-2xl border border-cream/[0.14] bg-panel/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl shrink-0 h-fit max-w-full overflow-x-auto lg:overflow-x-visible">
            {[
              { id: "city" as const, label: "Manipulate City", icon: <Building2  size={18} /> },
              
              
              { id: "revit" as const, label: "Revit Base Frame", icon: <SquareDimensions  size={18} /> },
              ...(type !== "building" ? [{ id: "colors" as const, label: "Filament Colors", icon: <Palette  size={18} /> }] : []),
              { id: "size" as const, label: "Size & Printer", icon: <Ruler size={18} /> },
              { id: "frame" as const, label: "Frame", icon: <Frame size={18} /> },
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
              onClick={() => setActiveTab(activeTab ? null : "size")}
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
                      {activeTab === "size" && "04"}
                      {activeTab === "frame" && "05"}
                      {activeTab === "city" && "01"}
                      {activeTab === "revit" && "02"}
                      {activeTab === "colors" && "03"}
                    </span>
                    <h3 className="m-0 font-display text-[17px] font-medium capitalize text-cream">
                      {activeTab === "size" && "Size & Printer"}
                      {activeTab === "frame" && "Frame"}
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

                {activeTab === "frame" && (
                  <FramePanel
                    enabled={frameOn}
                    onEnabled={setFrameOn}
                    opts={frameOpts}
                    onOpts={patchFrame}
                    size={frame?.size ?? null}
                    busy={frameBusy}
                    printer={printer}
                    defaultLabel={location.name}
                    onShrinkToFit={shrinkForFrame}
                    onDownload={downloadFrame}
                    downloading={frameDownload}
                  />
                )}

                {/* Size & printer */}
                {activeTab === "size" && (
                  <SizePanel
                    printer={printer}
                    printerSelect={<PrinterSelect value={printerId} onChange={setPrinterId} />}
                    dims={dims}
                    locked={lockRatio}
                    onLocked={setLockRatio}
                    onSize={setSize}
                    onFit={fitToBed}
                    onCentre={centreOnBed}
                    onRotate={turn90}
                    onReset={resetTransform}
                    canReset={moved}
                    mode={mode}
                    onMode={setMode}
                  />
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
                      {layerSet.has("main-building") && (
                          <div className="flex flex-col gap-3 rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-3">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cream/45">
                              Large buildings
                            </span>
                            <ResettableScrubber
                              label="Size"
                              value={cityCtl.large}
                              min={50}
                              max={150}
                              onValueChange={(v) => setCtl("large", v)}
                              onReset={() => resetCtl("large")}
                              atDefault={atDefault("large")}
                            />
                            <ResettableScrubber
                              label="Height"
                              value={cityCtl.largeHeight}
                              min={50}
                              max={200}
                              onValueChange={(v) => setCtl("largeHeight", v)}
                              onReset={() => resetCtl("largeHeight")}
                              atDefault={atDefault("largeHeight")}
                            />
                          </div>
                        )}
                        {layerSet.has("small-building") && (
                          <ResettableScrubber
                            label="Small buildings"
                            value={cityCtl.small}
                            min={50}
                            max={150}
                            onValueChange={(v) => setCtl("small", v)}
                            onReset={() => resetCtl("small")}
                            atDefault={atDefault("small")}
                          />
                        )}
                        
                        {terrainControl && (
                          <div className="flex flex-col gap-3 rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-3">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cream/45">
                                Terrain shape
                              </span>
                              {terrainControl.busy && (
                                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--accent)]">
                                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-cream/20 border-t-[var(--accent)]" />
                                  Rebuilding
                                </span>
                              )}
                            </div>
                            <TerrainModePicker
                              value={terrainControl}
                              onChange={(t) => terrainControl.onChange(t)}
                            />
                          </div>
                        )}

                        {layerSet.has("terrain") && (
                          <ResettableScrubber
                            label="Terrain height"
                            value={cityCtl.terrain}
                            min={20}
                            max={500}
                            onValueChange={(v) => setCtl("terrain", v)}
                            onReset={() => resetCtl("terrain")}
                            atDefault={atDefault("terrain")}
                          />
                        )}
                        {layerSet.has("roads") && (
                          <ResettableScrubber
                            label="Road scale"
                            value={cityCtl.roads}
                            min={50}
                            max={200}
                            onValueChange={(v) => setCtl("roads", v)}
                            onReset={() => resetCtl("roads")}
                            atDefault={atDefault("roads")}
                          />
                        )}
                        {layerSet.has("trees") && (
                          <ResettableScrubber
                            label="Tree scale"
                            value={cityCtl.trees}
                            min={50}
                            max={150}
                            onValueChange={(v) => setCtl("trees", v)}
                            onReset={() => resetCtl("trees")}
                            atDefault={atDefault("trees")}
                          />
                        )}
                        {layerSet.has("water") && (
                          <div className="flex flex-col gap-3 rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-3">
                            <SegmentedToggle
                              label="Water layer"
                              checked={cityCtl.enableWater}
                              onCheckedChange={(v) => setCtl("enableWater", v)}
                            />
                            {cityCtl.enableWater && (
                              <ResettableScrubber
                                label="Water scale"
                                value={cityCtl.water}
                                min={50}
                                max={200}
                                onValueChange={(v) => setCtl("water", v)}
                                onReset={() => resetCtl("water")}
                                atDefault={atDefault("water")}
                              />
                            )}
                          </div>
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
                    {/* What is Revit? Info Banner */}
                    <div className="rounded-xl border border-cream/[0.14] bg-cream/[0.03] p-3.5 flex flex-col gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: "var(--accent)", opacity: 0.9 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="white"/>
                          </svg>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cream/80">What is the Revit Frame?</span>
                          <p className="m-0 font-mono text-[9.5px] leading-[1.65] text-cream/50">
                            A rigid base plate printed beneath your city model — makes it wall-mountable like a picture frame.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRevitInfoModal(true)}
                        className="mt-1 w-full rounded-lg border border-[var(--accent)]/40 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] transition-all duration-200 hover:bg-[var(--accent)]/10 flex items-center justify-center gap-1.5"
                      >
                        
                        Click here to know more about Revit
                      </button>
                    </div>

                    <SegmentedToggle
                      label="Revit base frame layer"
                      checked={cityCtl.enableRevit}
                      onCheckedChange={(v) => setCtl("enableRevit", v)}
                    />
                    {cityCtl.enableRevit && (
                      <div className="flex flex-col gap-3.5 pl-3.5 pt-1">
                        <Scrubber
                          label={`Frame height (${(cityCtl.revitHeight / 100).toFixed(1)} cm)`}
                          value={cityCtl.revitHeight}
                          min={10}
                          max={200}
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
                            min={95}
                            max={105}
                            step={1}
                            decimals={0}
                            onValueChange={(v) => setCtl("revitUniform", v)}
                          />
                        ) : (
                          <>
                            <Scrubber
                              label="Frame width"
                              value={cityCtl.revitWidth}
                              min={95}
                              max={105}
                              step={1}
                              decimals={0}
                              onValueChange={(v) => setCtl("revitWidth", v)}
                            />
                            <Scrubber
                              label="Frame breadth"
                              value={cityCtl.revitBreadth}
                              min={95}
                              max={105}
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
                         {layerSet.has("water") && (
                          <div className="flex flex-col gap-3 rounded-xl border border-cream/[0.12] bg-cream/[0.03] p-3">
                            <SegmentedToggle
                              label="Water layer"
                              checked={cityCtl.enableWater}
                              onCheckedChange={(v) => setCtl("enableWater", v)}
                            />
                           
                          </div>
                        )}

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
                            value={
                              cityCtl.layerColors.trees ||
                              DEFAULT_LAYER_COLORS.trees
                            }
                            onChange={(hex) => setLayerColor("trees", hex)}
                          />
                        )}
                        {activeColorTab === "terrain" && layerSet.has("terrain") && (
                          <FilamentColorCard
                            title="TERRAIN COLOUR"
                            value={
                              cityCtl.layerColors.terrain ||
                              DEFAULT_LAYER_COLORS.terrain
                            }
                            onChange={(hex) => setLayerColor("terrain", hex)}
                          />
                        )}
                        {activeColorTab === "grass" && layerSet.has("grass") && (
                          <FilamentColorCard
                            title="GRASS COLOUR"
                            value={
                              cityCtl.layerColors.grass ||
                              DEFAULT_LAYER_COLORS.grass
                            }
                            onChange={(hex) => setLayerColor("grass", hex)}
                          />
                        )}
                        {activeColorTab === "small-building" && layerSet.has("small-building") && (
                          <FilamentColorCard
                            title="SMALL BUILDINGS COLOUR"
                            value={
                              cityCtl.layerColors["small-building"] ||
                              DEFAULT_LAYER_COLORS["small-building"]
                            }
                            onChange={(hex) => setLayerColor("small-building", hex)}
                          />
                        )}
                        {activeColorTab === "main-building" && layerSet.has("main-building") && (
                          <FilamentColorCard
                            title="MAIN BUILDING COLOUR"
                            value={
                              cityCtl.layerColors["main-building"] ||
                              modelFiles.find((f) => f.layer === "main-building" && f.colorHint)?.colorHint ||
                              DEFAULT_LAYER_COLORS["main-building"]
                            }
                            onChange={(hex) => setLayerColor("main-building", hex)}
                          />
                        )}
                        {activeColorTab === "roads" && layerSet.has("roads") && (
                          <FilamentColorCard
                            title="ROADS COLOUR"
                            value={
                              cityCtl.layerColors.roads ||
                              DEFAULT_LAYER_COLORS.roads
                            }
                            onChange={(hex) => setLayerColor("roads", hex)}
                          />
                        )}
                        {activeColorTab === "water" && layerSet.has("water") && (
                          <FilamentColorCard
                            title="WATER COLOUR"
                            value={
                              cityCtl.layerColors.water ||
                              DEFAULT_LAYER_COLORS.water
                            }
                            onChange={(hex) => setLayerColor("water", hex)}
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

/** A Manipulate City slider with a reset button. */
function ResettableScrubber({
  label,
  value,
  min,
  max,
  onValueChange,
  onReset,
  atDefault,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  onReset: () => void;
  atDefault: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <Scrubber
          label={label}
          value={value}
          min={min}
          max={max}
          step={1}
          decimals={0}
          onValueChange={onValueChange}
        />
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={atDefault}
        title={`Reset ${label.toLowerCase()}`}
        aria-label={`Reset ${label.toLowerCase()}`}
        className="shrink-0 rounded-md px-1 text-[13px] leading-none text-cream/40 outline-offset-2 transition-colors hover:text-cream disabled:pointer-events-none disabled:opacity-25"
      >
        ↺
      </button>
    </div>
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

