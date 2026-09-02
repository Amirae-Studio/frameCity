"use client";

import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Html, useProgress } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";

const TARGET_SIZE = 4.2;

function CityModelOnly() {
  const geometry = useLoader(STLLoader, "/londonModel.stl");

  const { geom, floorY } = useMemo(() => {
    const g = (geometry as THREE.BufferGeometry).clone();
    // Lay flat (Z-up source to Y-up Three scene)
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
    return {
      geom: g,
      floorY: g.boundingBox!.min.y,
    };
  }, [geometry]);

  return (
    <group position={[0, -floorY / 2, 0]}>
      {/* Pure 3D City Model (No table/board underneath) */}
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial
          color="#f0ede6"
          roughness={0.55}
          metalness={0.06}
          envMapIntensity={0.6}
        />
      </mesh>

      {/* Subtle Ground Contact Shadows */}
      <ContactShadows
        position={[0, floorY - 0.05, 0]}
        opacity={0.5}
        scale={8}
        blur={2.0}
        far={5}
        color="#000000"
      />
    </group>
  );
}

function Loader() {
  const { progress, active } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 bg-black/60 p-4 rounded-xl backdrop-blur-md border border-white/10">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-cream/20 border-t-[color:var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/70 whitespace-nowrap">
          {active ? `Loading 3D Model · ${Math.round(progress)}%` : "Preparing Model…"}
        </span>
      </div>
    </Html>
  );
}

export default function HeroModelScene() {
  return (
    <div className="h-full w-full relative flex items-center justify-center">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [4.2, 3.0, 5.0], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Soft Studio Lighting */}
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[7, 9, 5]}
          intensity={2.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-6, 5, -5]} intensity={0.8} color="#cbd5e1" />
        <directionalLight position={[0, 3, -7]} intensity={0.5} color="#fed7aa" />

        <Suspense fallback={<Loader />}>
          <CityModelOnly />
        </Suspense>

        {/* Auto Horizontal Rotation */}
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.06}
          autoRotate
          autoRotateSpeed={1.0}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Canvas>

     
    </div>
  );
}
