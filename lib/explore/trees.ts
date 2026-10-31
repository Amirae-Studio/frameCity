// Tree models for Explore World, stored as STL files in the R2 "utils" bucket.
// Each one is loaded once, turned Y-up, stood on its trunk at the origin and
// scaled to one unit tall, so the model builder can stamp copies of it.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type TreeModelId = "tree1" | "tree2" | "tree3";

export const TREE_MODELS: { id: TreeModelId; label: string; file: string }[] = [
  { id: "tree1", label: "Classic", file: "tree1.stl" },
  { id: "tree2", label: "Leafy", file: "tree2.stl" },
  { id: "tree3", label: "Grand", file: "tree3.stl" },
];

export const DEFAULT_TREE: TreeModelId = "tree1";

/** A unit-tall tree template: indexed, base at y = 0, trunk on the y axis. */
export type TreeTemplate = {
  id: TreeModelId;
  geometry: THREE.BufferGeometry;
  /** Crown radius as a fraction of the height. */
  radius: number;
  triangles: number;
};

/** Above this the model is simplified — detail finer than a nozzle is lost in print anyway. */
const MAX_TEMPLATE_TRIS = 1500;

const cache = new Map<TreeModelId, Promise<TreeTemplate>>();

export function loadTree(id: TreeModelId): Promise<TreeTemplate> {
  let p = cache.get(id);
  if (!p) {
    p = fetchTree(id);
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

async function fetchTree(id: TreeModelId): Promise<TreeTemplate> {
  const model = TREE_MODELS.find((m) => m.id === id)!;
  const res = await fetch(`/api/r2/utils/${model.file}`);
  if (!res.ok) throw new Error(`Tree model ${model.file}: ${res.status}`);
  const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
  const raw = new STLLoader().parse(await res.arrayBuffer());
  return normalize(id, raw);
}

function normalize(id: TreeModelId, raw: THREE.BufferGeometry): TreeTemplate {
  raw.deleteAttribute("normal");
  // STL files are Z-up; three.js is Y-up.
  raw.rotateX(-Math.PI / 2);
  let g = mergeVertices(raw, 1e-4);
  raw.dispose();

  g.computeBoundingBox();
  const box = g.boundingBox!;
  const height = box.max.y - box.min.y;

  // Stand the tree on its trunk: centre on the lowest slice of vertices, not
  // the bounding box, so a crown leaning to one side doesn't float the trunk.
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const cut = box.min.y + height * 0.08;
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > cut) continue;
    sx += pos.getX(i);
    sz += pos.getZ(i);
    n++;
  }
  const cx = n ? sx / n : (box.min.x + box.max.x) / 2;
  const cz = n ? sz / n : (box.min.z + box.max.z) / 2;
  g.translate(-cx, -box.min.y, -cz);
  g.scale(1 / height, 1 / height, 1 / height);

  if (g.index && g.index.count / 3 > MAX_TEMPLATE_TRIS) g = simplify(g);

  const p = g.getAttribute("position") as THREE.BufferAttribute;
  let r = 0;
  for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const triangles = g.index ? g.index.count / 3 : g.getAttribute("position").count / 3;
  return { id, geometry: g, radius: Math.min(0.6, Math.max(0.2, r)), triangles };
}

/**
 * Vertex clustering: snaps vertices to a grid and drops the triangles that
 * collapse. Unlike edge-collapse it keeps every leaf cluster in place, and the
 * coarsest grid (1/36 of the height ≈ 0.17 mm at print size) is still finer
 * than a nozzle.
 */
function simplify(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const src = g.index!.array;
  let best = g;
  for (let res = 90; res >= 36; res = Math.floor(res / 1.2)) {
    const q = 1 / res;
    const cell = new Map<string, number>();
    const remap = new Int32Array(pos.count);
    const sum: number[] = [];
    const cnt: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`;
      let c = cell.get(k);
      if (c === undefined) {
        c = cnt.length;
        cell.set(k, c);
        sum.push(0, 0, 0);
        cnt.push(0);
      }
      remap[i] = c;
      sum[c * 3] += pos.getX(i);
      sum[c * 3 + 1] += pos.getY(i);
      sum[c * 3 + 2] += pos.getZ(i);
      cnt[c]++;
    }
    const seen = new Set<string>();
    const idx: number[] = [];
    for (let t = 0; t < src.length; t += 3) {
      const a = remap[src[t]], b = remap[src[t + 1]], c = remap[src[t + 2]];
      if (a === b || b === c || a === c) continue;
      const k = [a, b, c].sort((x, y) => x - y).join(",");
      if (seen.has(k)) continue;
      seen.add(k);
      idx.push(a, b, c);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(sum.map((v, i) => v / cnt[Math.floor(i / 3)]), 3));
    out.setIndex(idx);
    if (best !== g) best.dispose();
    best = out;
    if (idx.length / 3 <= MAX_TEMPLATE_TRIS) break;
  }
  g.dispose();
  return best;
}
