"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { loadTree, TREE_MODELS, type TreeModelId, type TreeTemplate } from "@/lib/explore/trees";

/** Renders a tree template to a small transparent PNG for the picker. */
function snapshot(t: TreeTemplate, color: string): string {
  const size = 160;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#667", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.position.set(2, 3, 2.5);
  scene.add(sun);
  const mesh = new THREE.Mesh(t.geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true }));
  scene.add(mesh);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  cam.position.set(1.5, 1.05, 1.9);
  cam.lookAt(0, 0.48, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL("image/png");
  (mesh.material as THREE.Material).dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

export function TreePicker({
  value,
  onChange,
  color,
}: {
  value: TreeModelId;
  onChange: (id: TreeModelId) => void;
  color: string;
}) {
  const [thumbs, setThumbs] = useState<Partial<Record<TreeModelId, string>>>({});
  const [failed, setFailed] = useState<Partial<Record<TreeModelId, boolean>>>({});

  useEffect(() => {
    let alive = true;
    for (const m of TREE_MODELS) {
      loadTree(m.id)
        .then((t) => alive && setThumbs((s) => ({ ...s, [m.id]: snapshot(t, color) })))
        .catch(() => alive && setFailed((s) => ({ ...s, [m.id]: true })));
    }
    return () => {
      alive = false;
    };
  }, [color]);

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tree style">
      {TREE_MODELS.map((m) => {
        const on = m.id === value;
        const src = thumbs[m.id];
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={failed[m.id]}
            onClick={() => onChange(m.id)}
            className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors disabled:opacity-40 ${
              on
                ? "border-[var(--accent)] bg-[var(--accent)]/[0.08]"
                : "border-cream/[0.12] hover:border-cream/30 hover:bg-cream/[0.04]"
            }`}
          >
            <span className="flex aspect-square w-full items-center justify-center">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-contain" />
              ) : failed[m.id] ? (
                <span className="font-mono text-[9px] text-cream/40">Unavailable</span>
              ) : (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-cream/15 border-t-[color:var(--accent)]" />
              )}
            </span>
            <span className={`text-[12px] ${on ? "text-cream" : "text-cream/65"}`}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
