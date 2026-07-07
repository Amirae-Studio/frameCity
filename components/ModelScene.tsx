"use client";

import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Html, useProgress } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";

const TARGET_SIZE = 5;

function CityModel() {
  const geometry = useLoader(STLLoader, "/londonModel.stl");

  const { geom, floorY } = useMemo(() => {
    const g = (geometry as THREE.BufferGeometry).clone();
    // The source model is authored Z-up (buildings along +Z); lay it flat for a Y-up scene.
    g.rotateX(-Math.PI / 2);
    g.center();
    g.computeVertexNormals();
    g.computeBoundingBox();

    const size = new THREE.Vector3();
    g.boundingBox!.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = TARGET_SIZE / maxDim;
    g.scale(scale, scale, scale);

    g.computeBoundingBox();
    return { geom: g, floorY: g.boundingBox!.min.y };
  }, [geometry]);

  return (
    <group>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial
          color="#e9e6df"
          roughness={0.62}
          metalness={0.04}
          envMapIntensity={0.5}
        />
      </mesh>
      <ContactShadows
        position={[0, floorY - 0.01, 0]}
        opacity={0.55}
        scale={12}
        blur={2.4}
        far={6}
        color="#000000"
      />
    </group>
  );
}

function Loader() {
  const { progress, active } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/55">
          {active ? `Loading model · ${Math.round(progress)}%` : "Preparing…"}
        </span>
      </div>
    </Html>
  );
}

export default function ModelScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [4.5, 3, 5.5], fov: 42 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
    >
      {/* Calm studio lighting to suit the matte white models */}
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[6, 8, 4]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-6, 4, -5]} intensity={0.7} color="#c8cede" />
      <directionalLight position={[0, 2, -8]} intensity={0.5} color="#e8d9c4" />

      <Suspense fallback={<Loader />}>
        <CityModel />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.7}
        minDistance={4}
        maxDistance={12}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
