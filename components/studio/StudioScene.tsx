"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  TransformControls,
  Edges,
  useGLTF,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { MM, type CityControls } from "@/lib/studio";
import type { ModelFile } from "@/app/studio/actions";

export type GizmoMode = "translate" | "rotate" | "scale";

function Bed({ w, d, light }: { w: number; d: number; light: boolean }) {
  // Grid every 20 mm, plus a brighter outer border.
  const { grid, border } = useMemo(() => {
    const hw = (w * MM) / 2;
    const hd = (d * MM) / 2;
    const step = 20 * MM;

    const gridPts: number[] = [];
    for (let x = -hw; x <= hw + 1e-6; x += step)
      gridPts.push(x, 0, -hd, x, 0, hd);
    for (let z = -hd; z <= hd + 1e-6; z += step)
      gridPts.push(-hw, 0, z, hw, 0, z);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));

    const borderPts = [
      -hw, 0, -hd, hw, 0, -hd,
      hw, 0, -hd, hw, 0, hd,
      hw, 0, hd, -hw, 0, hd,
      -hw, 0, hd, -hw, 0, -hd,
    ];
    const border = new THREE.BufferGeometry();
    border.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(borderPts, 3)
    );

    return { grid, border };
  }, [w, d]);

  const plate = light ? "#d9d1c0" : "#16130f";
  const lineColor = light ? "#3a352b" : "#f2efe9";

  return (
    <group>
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[w * MM + 0.24, 0.12, d * MM + 0.24]} />
        <meshStandardMaterial color={plate} roughness={0.85} metalness={light ? 0.05 : 0.15} />
      </mesh>
      <lineSegments geometry={grid} position={[0, 0.003, 0]}>
        <lineBasicMaterial color={lineColor} transparent opacity={light ? 0.16 : 0.1} />
      </lineSegments>
      <lineSegments geometry={border} position={[0, 0.005, 0]}>
        <lineBasicMaterial color={lineColor} transparent opacity={light ? 0.4 : 0.3} />
      </lineSegments>
    </group>
  );
}

/**
 * Owns BOTH the transformable group and its TransformControls, so they mount
 * and unmount in the same commit. The gizmo can never outlive (or attach to)
 * an object that has left the scene graph — which is what caused
 * "TransformControls: The attached 3D object must be a part of the scene graph".
 */
function TransformTarget({
  mode,
  position,
  onTarget,
  onTransform,
  children,
}: {
  mode: GizmoMode;
  position: [number, number, number];
  onTarget: (o: THREE.Object3D | null) => void;
  onTransform: (o: THREE.Object3D) => void;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const [obj, setObj] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const g = group.current;
    setObj(g);
    onTarget(g);
    return () => {
      setObj(null);
      onTarget(null);
    };
  }, [onTarget]);

  return (
    <>
      <group ref={group} position={position}>
        {children}
      </group>
      {obj && (
        <TransformControls
          object={obj}
          mode={mode}
          size={0.85}
          onObjectChange={() => onTransform(obj)}
        />
      )}
    </>
  );
}

const TARGET_SIZE = 4;

// A city tile assembled from multiple GLB layers (terrain, roads, buildings,
// trees, …) that share one origin. useGLTF suspends until EVERY layer has
// downloaded, so the tile appears fully assembled — never piece by piece.
type Axis = "x" | "y" | "z";
const AXES: Axis[] = ["x", "y", "z"];

function CityAssembly({
  files,
  mode,
  controls,
  onTarget,
  onTransform,
}: {
  files: ModelFile[];
  mode: GizmoMode;
  controls: CityControls;
  onTarget: (o: THREE.Object3D | null) => void;
  onTransform: (o: THREE.Object3D) => void;
}) {
  const gltfs = useGLTF(files.map((f) => f.url));

  const { object, scale, center, halfHeight, layerInfo, upAxis } =
    useMemo(() => {
      const object = new THREE.Group();
      files.forEach((file, i) => {
        const layer = gltfs[i].scene.clone(true);
        layer.name = file.name; // "roads", "terrain", "small-building", …
        layer.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = true;
        });
        object.add(layer);
      });

      // Which axis is "up"? Flat layers (roads/terrain/grass) are thinnest
      // along it — robust whether the exports are Y-up or Z-up.
      let upAxis: Axis = "y";
      const flat = ["roads", "terrain", "grass"]
        .map((n) => object.getObjectByName(n))
        .find(Boolean);
      if (flat) {
        const s = new THREE.Vector3();
        new THREE.Box3().setFromObject(flat).getSize(s);
        upAxis = s.x < s.y ? (s.x < s.z ? "x" : "z") : s.y < s.z ? "y" : "z";
      }

      // Per-layer anchors (at rest): base along up-axis, centre elsewhere.
      const layerInfo = new Map<
        string,
        { min: THREE.Vector3; center: THREE.Vector3 }
      >();
      object.children.forEach((layer) => {
        const b = new THREE.Box3().setFromObject(layer);
        const c = new THREE.Vector3();
        b.getCenter(c);
        layerInfo.set(layer.name, { min: b.min.clone(), center: c });
      });

      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const scale = TARGET_SIZE / (Math.max(size.x, size.y, size.z) || 1);
      return {
        object,
        scale,
        center,
        halfHeight: (size.y * scale) / 2,
        layerInfo,
        upAxis,
      };
    }, [gltfs, files]);

  // Apply the Manipulate City controls, non-destructively. Scaling a layer
  // by s about anchor a: p → p·s + a·(1−s), so bases stay planted and the
  // large-building footprint stays centred.
  useEffect(() => {
    const apply = (name: string, vert: number, all: number) => {
      const layer = object.getObjectByName(name);
      const info = layerInfo.get(name);
      if (!layer || !info) return;
      AXES.forEach((a) => {
        const s = (a === upAxis ? vert : 1) * all;
        const anchor = a === upAxis ? info.min[a] : info.center[a];
        layer.scale[a] = s;
        layer.position[a] = anchor * (1 - s);
      });
    };

    apply("small-building", controls.small / 100, 1);
    apply("main-building", 1, controls.large / 100);
    apply("terrain", controls.terrain / 100, 1);
    apply("roads", controls.roads / 100, 1);
    apply("trees", controls.trees / 100, 1);

    const setVisible = (name: string, hidden: boolean) => {
      const layer = object.getObjectByName(name);
      if (layer) layer.visible = !hidden;
    };
    setVisible("roads", controls.hideRoads);
    setVisible("trees", controls.hideTrees);
    setVisible("grass", controls.hideGrass);
  }, [object, layerInfo, upAxis, controls]);

  return (
    <TransformTarget
      mode={mode}
      position={[0, halfHeight, 0]}
      onTarget={onTarget}
      onTransform={onTransform}
    >
      <group
        scale={scale}
        position={[-center.x * scale, -center.y * scale, -center.z * scale]}
      >
        <primitive object={object} />
      </group>
    </TransformTarget>
  );
}

// Fallback tile for locations that don't have a model uploaded yet.
function PlaceholderTile({
  mode,
  onTarget,
  onTransform,
}: {
  mode: GizmoMode;
  onTarget: (o: THREE.Object3D | null) => void;
  onTransform: (o: THREE.Object3D) => void;
}) {
  return (
    <TransformTarget
      mode={mode}
      position={[0, 1, 0]}
      onTarget={onTarget}
      onTransform={onTransform}
    >
      <mesh castShadow>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#e9e6df" roughness={0.6} metalness={0.05} />
        <Edges color="#8a8478" threshold={20} opacity={0.35} transparent />
      </mesh>
    </TransformTarget>
  );
}

function Loader() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.24em] text-cream/55">
          Loading model…
        </span>
      </div>
    </Html>
  );
}

export default function StudioScene({
  bedW,
  bedD,
  mode,
  light,
  loading,
  files,
  cityControls,
  onTarget,
  onTransform,
}: {
  bedW: number;
  bedD: number;
  mode: GizmoMode;
  light: boolean;
  loading: boolean;
  files: ModelFile[];
  cityControls: CityControls;
  onTarget: (o: THREE.Object3D | null) => void;
  onTransform: (o: THREE.Object3D) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [7, 5.5, 9], fov: 40 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[6, 9, 4]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-6, 4, -5]} intensity={0.6} color="#c8cede" />
      <directionalLight position={[0, 2, -8]} intensity={0.45} color="#e8d9c4" />

      <Bed w={bedW} d={bedD} light={light} />

      {/* One render path — no placeholder→model swap. */}
      {loading ? (
        <Loader />
      ) : files.length > 0 ? (
        <Suspense fallback={<Loader />}>
          <CityAssembly
            key={files[0].url}
            files={files}
            mode={mode}
            controls={cityControls}
            onTarget={onTarget}
            onTransform={onTransform}
          />
        </Suspense>
      ) : (
        <PlaceholderTile mode={mode} onTarget={onTarget} onTransform={onTransform} />
      )}

      <OrbitControls
        makeDefault
        target={[0, 0.8, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}
