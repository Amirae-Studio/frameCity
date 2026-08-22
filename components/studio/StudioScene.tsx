"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  TransformControls,
  Edges,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.5/");
import { MM, DEFAULT_LAYER_COLORS, type CityControls } from "@/lib/studio";
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

function getLocalBoundingBox(node: THREE.Object3D, container: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }
      if (mesh.geometry.boundingBox) {
        const b = mesh.geometry.boundingBox.clone();
        const localMatrix = new THREE.Matrix4().identity();
        let curr: THREE.Object3D | null = mesh;
        while (curr && curr !== container) {
          localMatrix.premultiply(curr.matrix);
          curr = curr.parent;
        }
        b.applyMatrix4(localMatrix);
        box.union(b);
      }
    }
  });
  return box;
}

function isStlFile(f: ModelFile): boolean {
  if (f.ext && f.ext.toLowerCase() === "stl") return true;
  const lowerName = (f.name || "").toLowerCase();
  const lowerUrl = (f.url || "").toLowerCase();
  return lowerName.endsWith(".stl") || lowerUrl.includes(".stl");
}

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
  const glbFiles = useMemo(() => files.filter((f) => !isStlFile(f)), [files]);
  const stlFiles = useMemo(() => files.filter((f) => isStlFile(f)), [files]);

  const glbUrls = useMemo(() => glbFiles.map((f) => f.url), [glbFiles]);
  const stlUrls = useMemo(() => stlFiles.map((f) => f.url), [stlFiles]);

  const gltfs = useLoader(GLTFLoader, glbUrls, (loader) => {
    loader.setDRACOLoader(dracoLoader);
  });
  const stls = useLoader(STLLoader, stlUrls);

  const {
    object,
    scale,
    center,
    halfHeight,
    layerInfo,
    upAxis,
    horizAxes,
    baseDimensions,
    terrainBottomAtRest,
    terrainHeightAtRest,
    boxMin,
    boxMax,
  } = useMemo(() => {
    const object = new THREE.Group();

    // Process GLB layers
    glbFiles.forEach((file, i) => {
      const gltfObj = Array.isArray(gltfs) ? gltfs[i] : gltfs;
      if (gltfObj && gltfObj.scene) {
        const layer = gltfObj.scene.clone(true);
        layer.name = file.name; // "roads", "terrain", "small-building", …
        layer.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            if (m.geometry && m.geometry.attributes.position) {
              m.userData.origPosition = m.geometry.attributes.position.array.slice();
            }
          }
        });
        object.add(layer);
      }
    });

    // Process STL layers
    stlFiles.forEach((file, i) => {
      const geomObj = Array.isArray(stls) ? stls[i] : stls;
      if (geomObj) {
        const g = (geomObj as THREE.BufferGeometry).clone();
        g.computeVertexNormals();
        g.computeBoundingBox();

        // Check if STL is Z-up (if Z height > Y and X)
        const size = new THREE.Vector3();
        if (g.boundingBox) {
          g.boundingBox.getSize(size);
          if (size.z > size.y && size.z > size.x) {
            g.rotateX(-Math.PI / 2);
            g.center();
            g.computeVertexNormals();
            g.computeBoundingBox();
          }
        }

        const mat = new THREE.MeshStandardMaterial({
          color: "#e9e6df",
          roughness: 0.6,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (g.attributes.position) {
          mesh.userData.origPosition = g.attributes.position.array.slice();
        }

        const layer = new THREE.Group();
        layer.name = file.name;
        layer.add(mesh);
        object.add(layer);
      }
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

    const horizAxes = AXES.filter((a) => a !== upAxis) as [Axis, Axis];

    // Per-layer anchors (at rest): base along up-axis, centre elsewhere.
    const layerInfo = new Map<
      string,
      { min: THREE.Vector3; max: THREE.Vector3; center: THREE.Vector3 }
    >();
    object.children.forEach((layer) => {
      const b = new THREE.Box3().setFromObject(layer);
      const c = new THREE.Vector3();
      b.getCenter(c);
      layerInfo.set(layer.name, {
        min: b.min.clone(),
        max: b.max.clone(),
        center: c,
      });
    });

    // Compute bounding box ONLY for city model layers (excluding revit and boolean_cube)
    const box = new THREE.Box3();
    object.children.forEach((layer) => {
      if (layer.name !== "revit" && !layer.name.startsWith("boolean_cube")) {
        box.expandByObject(layer);
      }
    });
    if (box.isEmpty()) {
      box.setFromObject(object);
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const boxMin = box.min.clone();
    const boxMax = box.max.clone();

    const terrainInfo = layerInfo.get("terrain");
    const terrainBottomAtRest = terrainInfo
      ? terrainInfo.min[upAxis]
      : box.min[upAxis];
    const terrainHeightAtRest = terrainInfo
      ? terrainInfo.max[upAxis] - terrainInfo.min[upAxis]
      : 0;

    const scale = TARGET_SIZE / (Math.max(size.x, size.y, size.z) || 1);

    // Create dynamic Revit base frame mesh underneath the terrain
    // 1 Three.js world unit = 50 mm = 5 cm (MM = 1 / 50).
    // 1 cm height = 10 mm = 10 * MM = 0.2 world units.
    // In object space, 1 cm height is (10 * MM) / scale.
    const baseHeight0 = (10 * MM) / scale;
    const baseWidth0 = size[horizAxes[0]] || 1;
    const baseDepth0 = size[horizAxes[1]] || 1;

    const revitGeom = new THREE.BoxGeometry(1, 1, 1);
    const revitMat = new THREE.MeshStandardMaterial({
      color: "#e9e6df",
      roughness: 0.65,
      metalness: 0.05,
    });
    const revitMesh = new THREE.Mesh(revitGeom, revitMat);
    revitMesh.name = "revit";
    revitMesh.castShadow = true;
    revitMesh.receiveShadow = true;
    revitMesh.visible = false;
    object.add(revitMesh);
    return {
      object,
      scale,
      center,
      halfHeight: (size.y * scale) / 2,
      layerInfo,
      upAxis,
      horizAxes,
      baseDimensions: {
        width: baseWidth0,
        depth: baseDepth0,
        height: baseHeight0,
      },
      terrainBottomAtRest,
      terrainHeightAtRest,
      boxMin,
      boxMax,
    };
  }, [glbFiles, stlFiles, gltfs, stls]);

  // Compute dynamic Y bounds so the entire model assembly rests above the checkerboard bed plate.
  const { lowestY, totalHeight } = useMemo(() => {
    const sTerrain = controls.terrain / 100;
    const terrainInfo = layerInfo.get("terrain");
    const totalH = terrainInfo ? terrainInfo.max[upAxis] - terrainInfo.min[upAxis] : 0;
    const baseHeight = totalH * 0.4;
    const currentTerrainBottom = terrainBottomAtRest - (sTerrain - 1) * baseHeight;
    const REVIT_OVERLAP = 0.035;
    const h = baseDimensions.height * (controls.revitHeight / 100);
    const revitBottom = currentTerrainBottom + REVIT_OVERLAP - h;
    const lowestPoint = controls.enableRevit
      ? Math.min(currentTerrainBottom, revitBottom)
      : currentTerrainBottom;
    const lowestY = Math.min(boxMin[upAxis], lowestPoint);
    const totalHeight = boxMax[upAxis] - lowestY;
    return { lowestY, totalHeight };
  }, [
    controls.enableRevit,
    controls.revitHeight,
    controls.terrain,
    terrainBottomAtRest,
    baseDimensions,
    boxMin,
    boxMax,
    upAxis,
    layerInfo,
  ]);


  // Apply the Manipulate City controls, non-destructively.
  // When the revit frame is enabled, we also run a CSG boolean subtraction:
  // every mesh whose name starts with "boolean_cube" is carved out of the
  // revit geometry so the frame disappears in those footprints.
  useEffect(() => {
    const sTerrain = controls.terrain / 100;

    // Non-terrain components stay right at rest positions on the terrain surface.
    const COMPONENT_INSERTION = 0;
    const apply = (name: string, vert: number, all: number) => {
      const layer = object.getObjectByName(name);
      const info = layerInfo.get(name);
      if (!layer || !info || name === "terrain") return;
      AXES.forEach((a) => {
        const s = (a === upAxis ? vert : 1) * all;
        const anchor = a === upAxis ? info.min[a] : info.center[a];
        layer.scale[a] = s;
        let pos = anchor * (1 - s);
        if (a === upAxis) {
          pos -= COMPONENT_INSERTION;
        }
        layer.position[a] = pos;
      });
    };

    apply("small-building", controls.small / 100, 1);
    apply("main-building", 1, controls.large / 100);
    apply("roads", controls.roads / 100, 1);
    apply("trees", controls.trees / 100, 1);
    apply("grass", 1, 1);

    // Deform terrain base block from bottom up — top surface topography (t=1) stays fixed (0 delta).
    const terrainLayer = object.getObjectByName("terrain");
    const terrainInfo = layerInfo.get("terrain");
    let currentTerrainBottom = terrainBottomAtRest;
    if (terrainLayer && terrainInfo) {
      const minY = terrainInfo.min[upAxis];
      const maxY = terrainInfo.max[upAxis];
      const totalH = maxY - minY;
      const topThreshold = minY + 0.35 * totalH;
      const baseHeight = topThreshold - minY;
      currentTerrainBottom = minY - (sTerrain - 1) * baseHeight;

      terrainLayer.position.set(0, 0, 0);
      terrainLayer.scale.set(1, 1, 1);

      terrainLayer.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.isMesh && m.geometry && m.userData.origPosition) {
          const orig = m.userData.origPosition as Float32Array;
          const posAttr = m.geometry.attributes.position;
          const arr = posAttr.array as Float32Array;

          m.updateMatrix();
          const localMat = m.matrix;
          const invMat = localMat.clone().invert();
          const v = new THREE.Vector3();

          for (let i = 0; i < orig.length; i += 3) {
            v.set(orig[i], orig[i + 1], orig[i + 2]);
            v.applyMatrix4(localMat);

            const yLocal = v[upAxis];
            const t = THREE.MathUtils.clamp((yLocal - minY) / (topThreshold - minY), 0, 1);
            const delta = (1 - t) * (sTerrain - 1) * baseHeight;
            v[upAxis] = yLocal - delta;

            v.applyMatrix4(invMat);
            arr[i] = v.x;
            arr[i + 1] = v.y;
            arr[i + 2] = v.z;
          }
          posAttr.needsUpdate = true;
          m.geometry.computeVertexNormals();
        }
      });
    }

    // Hide boolean_cube layer (subtraction volume only)
    object.children.forEach((layer) => {
      if (layer.name.startsWith("boolean_cube")) {
        layer.visible = false;
      }
    });
    object.traverse((o) => {
      if (o.name.startsWith("boolean_cube")) {
        o.visible = false;
      }
    });

    // Apply Revit base frame layer controls — inserted inside currentTerrainBottom
    const revitLayer = object.getObjectByName("revit") as THREE.Mesh | undefined;
    if (revitLayer) {
      revitLayer.visible = !!controls.enableRevit;
      if (controls.enableRevit) {
        const h = baseDimensions.height * (controls.revitHeight / 100);
        const wScale = controls.revitUniformScale
          ? controls.revitUniform / 100
          : controls.revitWidth / 100;
        const dScale = controls.revitUniformScale
          ? controls.revitUniform / 100
          : controls.revitBreadth / 100;
        const w = baseDimensions.width * wScale;
        const d = baseDimensions.depth * dScale;

        object.updateMatrixWorld(true);

        const REVIT_OVERLAP = 0.035;
        const rx = center[horizAxes[0]];
        const ry = currentTerrainBottom + REVIT_OVERLAP - h / 2;
        const rz = center[horizAxes[1]];

        // Create local-space cloned meshes of boolean_cube for exact 3D geometry raycasting
        const localBoolMeshes: THREE.Mesh[] = [];
        object.children.forEach((layer) => {
          if (layer.name.startsWith("boolean_cube")) {
            layer.traverse((child) => {
              const mesh = child as THREE.Mesh;
              if (mesh.isMesh && mesh.geometry) {
                const localMatrix = new THREE.Matrix4().identity();
                let curr: THREE.Object3D | null = mesh;
                while (curr && curr !== object) {
                  localMatrix.premultiply(curr.matrix);
                  curr = curr.parent;
                }
                const cloneGeom = mesh.geometry.clone();
                cloneGeom.applyMatrix4(localMatrix);
                const localMesh = new THREE.Mesh(
                  cloneGeom,
                  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
                );
                localMesh.matrixWorld.identity();
                localBoolMeshes.push(localMesh);
              }
            });
          }
        });

        // Set up Raycaster along upAxis
        const raycaster = new THREE.Raycaster();
        const rayDir = new THREE.Vector3();
        rayDir[upAxis] = -1;

        const rayHeight = boxMax[upAxis] + 100;
        const rayOrigin = new THREE.Vector3();

        // Build merged Revit geometry using 2D grid raycasting + greedy box merging.
        // Adjacent solid cells are merged into maximal rectangular boxes, producing clean,
        // straight vertical walls with zero missing chunks under bridges or unmasked regions.
        const GRID_X = 60;
        const GRID_Z = 60;
        const cellW = w / GRID_X;
        const cellD = d / GRID_Z;

        const mask: boolean[][] = Array.from({ length: GRID_X }, () => Array(GRID_Z).fill(false));

        for (let ix = 0; ix < GRID_X; ix++) {
          for (let iz = 0; iz < GRID_Z; iz++) {
            const cx = rx - w / 2 + (ix + 0.5) * cellW;
            const cz = rz - d / 2 + (iz + 0.5) * cellD;

            let isMasked = false;
            if (localBoolMeshes.length > 0) {
              rayOrigin[upAxis] = rayHeight;
              rayOrigin[horizAxes[0]] = cx;
              rayOrigin[horizAxes[1]] = cz;

              raycaster.set(rayOrigin, rayDir);
              const hits = raycaster.intersectObjects(localBoolMeshes, false);
              if (hits.length > 0) {
                isMasked = true;
              }
            }
            mask[ix][iz] = !isMasked;
          }
        }

        const visited: boolean[][] = Array.from({ length: GRID_X }, () => Array(GRID_Z).fill(false));
        const mergedGeoms: THREE.BufferGeometry[] = [];

        for (let ix = 0; ix < GRID_X; ix++) {
          for (let iz = 0; iz < GRID_Z; iz++) {
            if (mask[ix][iz] && !visited[ix][iz]) {
              let runW = 1;
              while (ix + runW < GRID_X && mask[ix + runW][iz] && !visited[ix + runW][iz]) {
                runW++;
              }

              let runD = 1;
              let canExpandZ = true;
              while (iz + runD < GRID_Z && canExpandZ) {
                for (let k = 0; k < runW; k++) {
                  if (!mask[ix + k][iz + runD] || visited[ix + k][iz + runD]) {
                    canExpandZ = false;
                    break;
                  }
                }
                if (canExpandZ) runD++;
              }

              for (let kx = 0; kx < runW; kx++) {
                for (let kz = 0; kz < runD; kz++) {
                  visited[ix + kx][iz + kz] = true;
                }
              }

              const boxW = runW * cellW;
              const boxD = runD * cellD;
              const boxCx = rx - w / 2 + (ix + runW / 2) * cellW;
              const boxCz = rz - d / 2 + (iz + runD / 2) * cellD;

              const geom = new THREE.BoxGeometry(1, 1, 1);
              const s = new THREE.Vector3();
              s[upAxis] = h;
              s[horizAxes[0]] = boxW;
              s[horizAxes[1]] = boxD;
              geom.scale(s.x, s.y, s.z);

              const p = new THREE.Vector3();
              p[upAxis] = ry;
              p[horizAxes[0]] = boxCx;
              p[horizAxes[1]] = boxCz;
              geom.translate(p.x, p.y, p.z);

              mergedGeoms.push(geom);
            }
          }
        }

        // Merge all cell geometries into one revit mesh geometry
        if (mergedGeoms.length > 0) {
          const merged = mergeGeometries(mergedGeoms);
          if (merged) {
            merged.computeVertexNormals();
            if (revitLayer.geometry) revitLayer.geometry.dispose();
            revitLayer.geometry = merged;
          }
          mergedGeoms.forEach((g) => g.dispose());
        } else {
          // All cells masked — show nothing
          if (revitLayer.geometry) revitLayer.geometry.dispose();
          revitLayer.geometry = new THREE.BufferGeometry();
        }

        localBoolMeshes.forEach((m) => m.geometry.dispose());

        // Geometry is already in world-local coords — reset mesh transform
        revitLayer.position.set(0, 0, 0);
        revitLayer.scale.set(1, 1, 1);
      }
    }

    const setVisible = (name: string, hidden: boolean) => {
      const layer = object.getObjectByName(name);
      if (layer) layer.visible = !hidden;
    };
    setVisible("roads", controls.hideRoads);
    setVisible("trees", controls.hideTrees);
    setVisible("grass", controls.hideGrass);

    // Apply layer colors dynamically
    object.children.forEach((layer) => {
      if (layer.name.startsWith("boolean_cube")) return;
      let targetHex = "#e9e6df";
      if (controls.enableColors) {
        if (layer.name === "revit") {
          targetHex = "#FFFFFF";
        } else {
          targetHex =
            controls.layerColors[layer.name] ||
            DEFAULT_LAYER_COLORS[layer.name] ||
            "#e9e6df";
        }
      }

      layer.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material) {
          if (!m.userData.clonedMat) {
            m.material = (m.material as THREE.Material).clone();
            m.userData.clonedMat = true;
          }
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.color) {
            mat.color.set(targetHex);
          }
        }
      });
    });
  }, [
    object,
    layerInfo,
    upAxis,
    horizAxes,
    baseDimensions,
    terrainBottomAtRest,
    terrainHeightAtRest,
    center,
    controls,
  ]);

  return (
    <TransformTarget
      mode={mode}
      position={[0, 0, 0]}
      onTarget={onTarget}
      onTransform={onTransform}
    >
      <group
        scale={scale}
        position={[-center.x * scale, -lowestY * scale, -center.z * scale]}
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

function StudioLighting({ controls }: { controls: CityControls }) {
  const isCustom = controls.enableLighting;
  const intensityMult = isCustom ? controls.lightIntensity / 100 : 1.0;
  const sunRotationRad = ((isCustom ? controls.sunRotation : 55) * Math.PI) / 180;
  const sunElevationRad = ((isCustom ? controls.sunElevation : 30) * Math.PI) / 180;
  const radius = 12;

  // Spherical celestial coordinates: elevation pitch + rotation heading
  const sunY = Math.max(1.5, radius * Math.sin(sunElevationRad));
  const sunHoriz = radius * Math.cos(sunElevationRad);
  const sunX = sunHoriz * Math.cos(sunRotationRad);
  const sunZ = sunHoriz * Math.sin(sunRotationRad);

  const preset = isCustom ? controls.lightingPreset : "natural";
  let keyColor = "#fff1d6";
  let rimColor = "#b8d2fe";
  let fillColor = "#f5ebd6";
  let ambientColor = "#e8f0fe";
  let keyIntensity = 2.4 * intensityMult;
  let rimIntensity = 0.8 * intensityMult;
  let fillIntensity = 0.6 * intensityMult;
  let ambientIntensity = 0.45 * intensityMult;

  if (preset === "natural") {
    // Realistic Architectural Natural Sunlight (like isometric room renders)
    keyColor = "#fff3df";      // Warm sunlight rays
    rimColor = "#b3d1ff";      // Soft atmospheric sky bounce
    fillColor = "#f4ebd8";     // Warm floor contact bounce
    ambientColor = "#e3ecfa";   // Diffuse sky fill
    keyIntensity = 2.5 * intensityMult;
    rimIntensity = 0.85 * intensityMult;
    fillIntensity = 0.65 * intensityMult;
    ambientIntensity = 0.45 * intensityMult;
  } else if (preset === "studio") {
    keyColor = "#ffffff";
    rimColor = "#c8cede";
    fillColor = "#e8d9c4";
    ambientColor = "#ffffff";
    keyIntensity = 1.9 * intensityMult;
    rimIntensity = 0.6 * intensityMult;
    fillIntensity = 0.45 * intensityMult;
    ambientIntensity = 0.5 * intensityMult;
  } else if (preset === "golden") {
    keyColor = "#ff9e2c";
    rimColor = "#3b6eff";
    fillColor = "#ffcf96";
    ambientColor = "#ffd8a8";
    keyIntensity = 2.7 * intensityMult;
    rimIntensity = 1.0 * intensityMult;
    fillIntensity = 0.55 * intensityMult;
    ambientIntensity = 0.38 * intensityMult;
  } else if (preset === "cyberpunk") {
    keyColor = "#00f0ff";
    rimColor = "#ff007f";
    fillColor = "#8a00ff";
    ambientColor = "#220044";
    keyIntensity = 2.6 * intensityMult;
    rimIntensity = 1.6 * intensityMult;
    fillIntensity = 0.8 * intensityMult;
    ambientIntensity = 0.35 * intensityMult;
  } else if (preset === "dramatic") {
    keyColor = "#ffffff";
    rimColor = "#555566";
    fillColor = "#222233";
    ambientColor = "#111122";
    keyIntensity = 3.2 * intensityMult;
    rimIntensity = 0.4 * intensityMult;
    fillIntensity = 0.2 * intensityMult;
    ambientIntensity = 0.15 * intensityMult;
  } else if (preset === "warm") {
    keyColor = "#ffc288";
    rimColor = "#ffd6aa";
    fillColor = "#ffae70";
    ambientColor = "#fff3e0";
    keyIntensity = 1.8 * intensityMult;
    rimIntensity = 0.7 * intensityMult;
    fillIntensity = 0.5 * intensityMult;
    ambientIntensity = 0.65 * intensityMult;
  }

  const shadowMapSize = isCustom && !controls.shadowSoftness ? 2048 : 1024;
  const shadowBias = isCustom && !controls.shadowSoftness ? -0.0001 : -0.0003;

  return (
    <>
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <directionalLight
        position={[sunX, sunY, sunZ]}
        intensity={keyIntensity}
        color={keyColor}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={shadowBias}
      />
      <directionalLight
        position={[-sunX, Math.max(2, sunY * 0.5), -sunZ]}
        intensity={rimIntensity}
        color={rimColor}
      />
      <directionalLight
        position={[0, 2, -8]}
        intensity={fillIntensity}
        color={fillColor}
      />
    </>
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
      <StudioLighting controls={cityControls} />

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
