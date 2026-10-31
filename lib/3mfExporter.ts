/**
 * Custom 3MF & Geometry Exporter for FrameCity Studio
 *
 * Generates a valid, manifold, uncompressed .3mf ZIP archive (compatible with BambuStudio / Orca Slicer / PrusaSlicer)
 * from a Three.js Object3D/Group.
 *
 * Features:
 * 1. True 1:1 Scale (No Compression): Converts Three.js units directly to millimeters (1 unit = 50 mm)
 *    preserving exact model dimensions, heights, and slider scale modifications.
 * 2. Bed Centering & Z-alignment: Centers model at (128, 128) on the 256x256mm build plate with base at Z=0.
 * 3. Manifold Geometry & Shared Vertices: Welds duplicate vertex coordinates so adjacent faces properly share indices.
 * 4. Deduplication & Degenerate Removal: Removes duplicate vertices, collinear triangles, and zero-area faces.
 * 5. Face Normals & Winding Order: Ensures consistent counter-clockwise (CCW) outward-facing triangle winding.
 * 6. Multi-Material Grouping: Groups layers by color/name into distinct closed sub-meshes with Bambu AMS extruder mappings.
 *
 * Uses fflate for in-browser ZIP creation (no server round-trip).
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { zipSync, strToU8 } from "fflate";
import { MM } from "./studio";
import { loadBambuProfile, profileBed, projectSettings, type BambuProfile } from "./bambuProject";

// ----- Types -----

export interface MeshEntry {
  geometry: THREE.BufferGeometry;
  color: string; // "#RRGGBB"
  name: string;
}

// ----- Helpers -----

function getMaterialColor(mat: THREE.Material | THREE.Material[]): string {
  const m = Array.isArray(mat) ? mat[0] : mat;
  if (!m) return "#FFFFFF";
  if ((m as THREE.MeshStandardMaterial).color) {
    const c = (m as THREE.MeshStandardMaterial).color;
    return "#" + c.getHexString().toUpperCase();
  }
  return "#FFFFFF";
}

/**
 * Welds duplicate vertices using spatial hashing, eliminates zero-area/degenerate
 * triangles, removes duplicate faces, ensures consistent outward CCW winding order,
 * and eliminates unreferenced vertices.
 */
export function cleanAndWeldGeometry(
  geom: THREE.BufferGeometry,
  isFlippedMatrix = false,
  tolerance = 1e-4
): THREE.BufferGeometry {
  const posAttr = geom.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr || posAttr.count === 0) return geom;

  // 1. Build spatial hash table to weld duplicate vertices
  const invTol = 1 / tolerance;
  const uniquePositions: number[] = [];
  const coordMap = new Map<string, number>();
  const oldToNewIndex: number[] = [];

  const vCount = posAttr.count;
  for (let i = 0; i < vCount; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const key = `${Math.round(x * invTol)}_${Math.round(y * invTol)}_${Math.round(z * invTol)}`;
    let newIdx = coordMap.get(key);
    if (newIdx === undefined) {
      newIdx = uniquePositions.length / 3;
      coordMap.set(key, newIdx);
      uniquePositions.push(x, y, z);
    }
    oldToNewIndex.push(newIdx);
  }

  // 2. Map existing triangles to welded indices
  const rawTriangles: [number, number, number][] = [];
  const index = geom.index;
  if (index) {
    const count = index.count;
    for (let i = 0; i < count; i += 3) {
      const a = oldToNewIndex[index.getX(i)];
      const b = oldToNewIndex[index.getX(i + 1)];
      const c = oldToNewIndex[index.getX(i + 2)];
      if (isFlippedMatrix) {
        rawTriangles.push([a, c, b]);
      } else {
        rawTriangles.push([a, b, c]);
      }
    }
  } else {
    for (let i = 0; i < vCount; i += 3) {
      if (i + 2 < vCount) {
        const a = oldToNewIndex[i];
        const b = oldToNewIndex[i + 1];
        const c = oldToNewIndex[i + 2];
        if (isFlippedMatrix) {
          rawTriangles.push([a, c, b]);
        } else {
          rawTriangles.push([a, b, c]);
        }
      }
    }
  }

  // 3. Filter degenerate, zero-area, and duplicate triangles
  const validTriangles: [number, number, number][] = [];
  const faceSet = new Set<string>();

  for (const [a, b, c] of rawTriangles) {
    // Degenerate check: identical vertices
    if (a === b || b === c || c === a) continue;

    const ax = uniquePositions[a * 3];
    const ay = uniquePositions[a * 3 + 1];
    const az = uniquePositions[a * 3 + 2];

    const bx = uniquePositions[b * 3];
    const by = uniquePositions[b * 3 + 1];
    const bz = uniquePositions[b * 3 + 2];

    const cx = uniquePositions[c * 3];
    const cy = uniquePositions[c * 3 + 1];
    const cz = uniquePositions[c * 3 + 2];

    // Edge vectors
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;

    // Cross product
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const lenSq = nx * nx + ny * ny + nz * nz;

    // Zero-area / collinear triangle check (< 1e-10 mm^2)
    if (lenSq < 1e-10) continue;

    // Duplicate face check (canonical orientation)
    const sorted = [a, b, c].slice().sort((x, y) => x - y);
    const faceKey = `${sorted[0]}_${sorted[1]}_${sorted[2]}`;
    if (faceSet.has(faceKey)) continue;
    faceSet.add(faceKey);

    validTriangles.push([a, b, c]);
  }

  if (validTriangles.length === 0) return geom;

  // 4. Calculate signed volume to ensure outward-facing normals
  let signedVolume6 = 0;
  for (const [a, b, c] of validTriangles) {
    const ax = uniquePositions[a * 3], ay = uniquePositions[a * 3 + 1], az = uniquePositions[a * 3 + 2];
    const bx = uniquePositions[b * 3], by = uniquePositions[b * 3 + 1], bz = uniquePositions[b * 3 + 2];
    const cx = uniquePositions[c * 3], cy = uniquePositions[c * 3 + 1], cz = uniquePositions[c * 3 + 2];
    signedVolume6 +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);
  }

  // If signed volume is negative, flip all faces to maintain CCW outward orientation
  const flipWinding = signedVolume6 < -1e-5;

  // 5. Compact vertex list to remove unreferenced vertices
  const referencedOld = new Set<number>();
  validTriangles.forEach(([a, b, c]) => {
    referencedOld.add(a);
    referencedOld.add(b);
    referencedOld.add(c);
  });

  const finalPositions: number[] = [];
  const remapIndex = new Map<number, number>();
  referencedOld.forEach((oldIdx) => {
    remapIndex.set(oldIdx, finalPositions.length / 3);
    finalPositions.push(
      uniquePositions[oldIdx * 3],
      uniquePositions[oldIdx * 3 + 1],
      uniquePositions[oldIdx * 3 + 2]
    );
  });

  const finalIndices: number[] = [];
  validTriangles.forEach(([a, b, c]) => {
    const ra = remapIndex.get(a)!;
    const rb = remapIndex.get(b)!;
    const rc = remapIndex.get(c)!;
    if (flipWinding) {
      finalIndices.push(ra, rc, rb);
    } else {
      finalIndices.push(ra, rb, rc);
    }
  });

  const cleanGeom = new THREE.BufferGeometry();
  cleanGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(finalPositions, 3)
  );
  cleanGeom.setIndex(finalIndices);
  cleanGeom.computeVertexNormals();
  cleanGeom.computeBoundingBox();

  return cleanGeom;
}

/**
 * Collects all visible meshes from Three.js hierarchy, applies world matrices,
 * transforms Y-up to Z-up (X -> X, Y -> -Z, Z -> Y), converts Three.js units to exact
 * millimeters (1 unit = 50 mm) without artificial dimension compression, centers
 * on build plate (128, 128 mm), aligns base to Z=0, and welds manifold geometry.
 */
export function collectTransformedMeshes(root: THREE.Object3D, plateCenter: [number, number] = [128, 128]): MeshEntry[] {
  root.updateWorldMatrix(true, true);

  // Conversion scale factor: 1 Three.js unit = 50 mm (1 / MM)
  const MM_SCALE = MM > 0 ? 1 / MM : 50;

  let minZ = Infinity;
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  interface RawItem {
    geom: THREE.BufferGeometry;
    color: string;
    name: string;
    isFlipped: boolean;
  }

  const rawItems: RawItem[] = [];

  // NB: Object3D.traverse() does not prune — returning from its callback skips
  // that node but still descends into its children. The "Hide layers" toggles
  // clear `visible` on the layer Group while its child meshes stay visible, so a
  // traverse() would happily export hidden roads/trees/grass. Walk manually and
  // drop the whole subtree instead, matching what the renderer shows.
  const collectMesh = (obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    let name = mesh.name || obj.parent?.name || "mesh";
    if (name.startsWith("boolean_cube")) return; // Skip subtractive volume helpers

    const geom = mesh.geometry.clone();
    mesh.updateWorldMatrix(true, false);
    geom.applyMatrix4(mesh.matrixWorld);

    const det = mesh.matrixWorld.determinant();
    const isFlipped = det < 0;

    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    if (posAttr) {
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        const x3 = posAttr.getX(i);
        const y3 = posAttr.getY(i);
        const z3 = posAttr.getZ(i);

        // Three.js Y-up -> 3D Printing Z-up (+90deg rotation around X)
        const xSlicer = x3;
        const ySlicer = -z3;
        const zSlicer = y3;

        posAttr.setXYZ(i, xSlicer, ySlicer, zSlicer);

        if (zSlicer < minZ) minZ = zSlicer;
        if (xSlicer < minX) minX = xSlicer;
        if (xSlicer > maxX) maxX = xSlicer;
        if (ySlicer < minY) minY = ySlicer;
        if (ySlicer > maxY) maxY = ySlicer;
      }
      posAttr.needsUpdate = true;
    }

    rawItems.push({
      geom,
      color: getMaterialColor(mesh.material),
      name,
      isFlipped,
    });
  };

  const collect = (obj: THREE.Object3D) => {
    if (!obj.visible) return;
    collectMesh(obj);
    obj.children.forEach(collect);
  };

  collect(root);

  if (rawItems.length === 0) return [];

  // Center of the model in Three.js world space
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Group raw meshes by (name + color) to merge identical layer parts
  const groups = new Map<string, { name: string; color: string; geoms: THREE.BufferGeometry[]; flipped: boolean }>();

  rawItems.forEach(({ geom, color, name, isFlipped }) => {
    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    if (posAttr) {
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        // Exact millimeter positioning: 1 Three.js unit = 50 mm (no compression)
        // Center model at (128, 128) mm on Bambu 256x256mm build plate
        // Base flat on bed plate at Z = 0 mm
        const x = (posAttr.getX(i) - cx) * MM_SCALE + plateCenter[0];
        const y = (posAttr.getY(i) - cy) * MM_SCALE + plateCenter[1];
        const z = (posAttr.getZ(i) - minZ) * MM_SCALE;
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }

    const key = `${name}___${color}`;
    if (!groups.has(key)) {
      groups.set(key, { name, color, geoms: [], flipped: isFlipped });
    }
    groups.get(key)!.geoms.push(geom);
  });

  const entries: MeshEntry[] = [];

  groups.forEach(({ name, color, geoms, flipped }) => {
    let combined: THREE.BufferGeometry | null = null;
    if (geoms.length === 1) {
      combined = geoms[0];
    } else {
      combined = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
    }

    if (combined) {
      const cleaned = cleanAndWeldGeometry(combined, flipped, 1e-3);
      if (cleaned !== combined) combined.dispose();

      entries.push({
        geometry: cleaned,
        color,
        name,
      });
    }
  });

  return entries;
}

// ----- 3MF writer (Bambu Studio project format) -----
//
// Bambu Studio only reads plates and per-part filaments from files that say
// they come from Bambu Studio; anything else loads as bare geometry on one
// plate in one colour. So the file follows its project layout: meshes inline,
// one object per plate made of parts, the object placed by its build
// transform, and Metadata/model_settings.config naming each part's filament
// and each plate's objects.

/** One printable object, alone on its own plate. Parts are in plate millimetres, Z up. */
type PlateObject = {
  name: string;
  entries: MeshEntry[];
  /** Where this plate starts in Bambu's plate grid, mm. */
  origin: [number, number];
  /** An empty middle (a frame's window), centred on the object, mm. */
  opening?: [number, number];
};

type Tower = { x: number; y: number; w: number };

/**
 * Finds room for the prime tower Bambu adds to multi-colour plates: inside a
 * frame's open window, else down the wider side margin, narrowed to fit.
 * Bambu's default corner would land on top of a bed-sized model.
 */
function placeTower(
  plate: PlateObject,
  bed: [number, number],
  width: number,
  brim: number,
  exclude: THREE.Box2 | null
): Tower | null {
  const box = new THREE.Box3();
  plate.entries.forEach((e) => box.union(e.geometry.boundingBox!));
  const [ox, oy] = plate.origin;
  const x0 = box.min.x - ox, x1 = box.max.x - ox, y0 = box.min.y - oy, y1 = box.max.y - oy;
  const pad = brim + 3;
  if (plate.opening) {
    const [w, d] = plate.opening;
    const fit = Math.min(width, w - 2 * pad - 10);
    if (fit >= 15 && d >= fit + 2 * pad + 10) {
      return { x: (x0 + x1) / 2 - fit / 2, y: (y0 + y1) / 2 - Math.min(d / 2 - pad - 5, fit), w: fit };
    }
  }
  const left = x0, right = bed[0] - x1;
  const room = Math.max(left, right) - 2 * pad;
  if (room < 12) return null;
  const w = Math.min(width, room);
  const x = left >= right ? pad : bed[0] - pad - w;
  // Start above the printer's no-print corner (e.g. the X1's calibration area).
  let y = 20;
  if (exclude && x < exclude.max.x + pad && x + w > exclude.min.x - pad) y = Math.max(y, exclude.max.y + pad + 5);
  return { x, y, w };
}

/** Moves a plate's object just clear of the no-print area, if it overlaps and the bed has room. */
function clearExclusion(plate: PlateObject, bed: [number, number], exclude: THREE.Box2) {
  const gap = 4;
  const box = new THREE.Box3();
  plate.entries.forEach((e) => box.union(e.geometry.boundingBox!));
  const [ox, oy] = plate.origin;
  const x0 = box.min.x - ox, x1 = box.max.x - ox, y0 = box.min.y - oy, y1 = box.max.y - oy;
  const hits = x0 < exclude.max.x + gap && x1 > exclude.min.x - gap && y0 < exclude.max.y + gap && y1 > exclude.min.y - gap;
  if (!hits) return;
  const dx = exclude.max.x + gap - x0, dy = exclude.max.y + gap - y0;
  const canX = x1 + dx <= bed[0] - 1, canY = y1 + dy <= bed[1] - 1;
  if (!canX && !canY) return;
  const [tx, ty] = canX && (!canY || dx <= dy) ? [dx, 0] : [0, dy];
  plate.entries.forEach((e) => {
    e.geometry.translate(tx, ty, 0);
    e.geometry.computeBoundingBox();
  });
}

/** Bounding box of the printer's no-print area, from its profile. */
function excludeBox(cfg: Record<string, unknown>): THREE.Box2 | null {
  const pts = ((cfg.bed_exclude_area as string[] | undefined) ?? [])
    .map((p) => p.split("x").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (pts.length < 3) return null;
  const box = new THREE.Box2();
  pts.forEach(([x, y]) => box.expandByPoint(new THREE.Vector2(x, y)));
  return box.isEmpty() || box.getSize(new THREE.Vector2()).x === 0 ? null : box;
}

const BAMBU_VERSION = "02.08.02.60";

const xmlAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const prettyName = (name: string) => name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

function meshXML(id: number, geom: THREE.BufferGeometry, offset: THREE.Vector3): string {
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const out: string[] = ['  <object id="' + id + '" type="model">\n   <mesh>\n    <vertices>\n'];
  for (let i = 0; i < pos.count; i++) {
    out.push(
      '     <vertex x="' + (pos.getX(i) - offset.x).toFixed(4) +
        '" y="' + (pos.getY(i) - offset.y).toFixed(4) +
        '" z="' + (pos.getZ(i) - offset.z).toFixed(4) + '"/>\n'
    );
  }
  out.push("    </vertices>\n    <triangles>\n");
  const index = geom.index;
  const n = index ? index.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    out.push('     <triangle v1="' + a + '" v2="' + b + '" v3="' + c + '"/>\n');
  }
  out.push("    </triangles>\n   </mesh>\n  </object>\n");
  return out.join("");
}

function buildBambuProject(plates: PlateObject[], profile: BambuProfile, bed: [number, number]) {
  // One filament per distinct colour, numbered from 1 in order of use.
  const filaments: string[] = [];
  const filamentOf = (hex: string) => {
    const c = hex.toUpperCase();
    let i = filaments.indexOf(c);
    if (i < 0) i = filaments.push(c) - 1;
    return i + 1;
  };

  let nextId = 1;
  const resources: string[] = [];
  const items: string[] = [];
  const objectsConfig: string[] = [];
  const platesConfig: string[] = [];
  const assemble: string[] = [];

  plates.forEach((plate, pi) => {
    // Meshes are stored relative to the object's base centre; the build
    // transform puts the object back where it belongs on its plate.
    const box = new THREE.Box3();
    plate.entries.forEach((e) => {
      e.geometry.computeBoundingBox();
      box.union(e.geometry.boundingBox!);
    });
    const origin = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);

    const parts = plate.entries.map((e) => {
      const id = nextId++;
      resources.push(meshXML(id, e.geometry, origin));
      return { id, name: prettyName(e.name), filament: filamentOf(e.color), faces: (e.geometry.index?.count ?? e.geometry.attributes.position.count) / 3 };
    });

    const objectId = nextId++;
    resources.push(
      '  <object id="' + objectId + '" type="model">\n   <components>\n' +
        parts.map((p) => '    <component objectid="' + p.id + '" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n').join("") +
        "   </components>\n  </object>\n"
    );
    const t = "1 0 0 0 1 0 0 0 1 " + origin.x.toFixed(4) + " " + origin.y.toFixed(4) + " " + origin.z.toFixed(4);
    items.push('  <item objectid="' + objectId + '" transform="' + t + '" printable="1"/>\n');

    objectsConfig.push(
      '  <object id="' + objectId + '">\n' +
        '    <metadata key="name" value="' + xmlAttr(plate.name) + '"/>\n' +
        '    <metadata key="extruder" value="' + parts[0].filament + '"/>\n' +
        parts
          .map(
            (p) =>
              '    <part id="' + p.id + '" subtype="normal_part">\n' +
              '      <metadata key="name" value="' + xmlAttr(p.name) + '"/>\n' +
              '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n' +
              '      <metadata key="extruder" value="' + p.filament + '"/>\n' +
              '      <mesh_stat face_count="' + p.faces + '" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n' +
              "    </part>\n"
          )
          .join("") +
        "  </object>\n"
    );
    platesConfig.push(
      "  <plate>\n" +
        '    <metadata key="plater_id" value="' + (pi + 1) + '"/>\n' +
        '    <metadata key="plater_name" value="' + xmlAttr(plate.name) + '"/>\n' +
        '    <metadata key="locked" value="false"/>\n' +
        "    <model_instance>\n" +
        '      <metadata key="object_id" value="' + objectId + '"/>\n' +
        '      <metadata key="instance_id" value="0"/>\n' +
        '      <metadata key="identify_id" value="' + (1000 + pi) + '"/>\n' +
        "    </model_instance>\n" +
        "  </plate>\n"
    );
    assemble.push('   <assemble_item object_id="' + objectId + '" instance_id="0" transform="' + t + '" offset="0 0 0"/>\n');
  });

  const modelXML =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">\n' +
    ' <metadata name="Application">BambuStudio-' + BAMBU_VERSION + "</metadata>\n" +
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n' +
    ' <metadata name="Title">FrameCity</metadata>\n' +
    " <resources>\n" + resources.join("") + " </resources>\n" +
    " <build>\n" + items.join("") + " </build>\n" +
    "</model>\n";

  const settingsXML =
    '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' +
    objectsConfig.join("") +
    platesConfig.join("") +
    "  <assemble>\n" + assemble.join("") + "  </assemble>\n" +
    "</config>\n";

  // Prime tower spot per plate (only plates printing more than one filament need one).
  const cfg = profile.config;
  const width = Number(cfg.prime_tower_width) || 35;
  const brim = Math.max(3, Number(cfg.prime_tower_brim_width) || 0);
  const towers = plates.map((p) =>
    new Set(p.entries.map((e) => e.color.toUpperCase())).size > 1 ? placeTower(p, bed, width, brim, excludeBox(cfg)) : null
  );
  const defX = Number((cfg.wipe_tower_x as string[] | undefined)?.[0] ?? 15);
  const defY = Number((cfg.wipe_tower_y as string[] | undefined)?.[0] ?? 220);
  const projectJSON = projectSettings(profile, filaments, {
    towerX: towers.map((t) => String(+(t?.x ?? defX).toFixed(2))),
    towerY: towers.map((t) => String(+(t?.y ?? defY).toFixed(2))),
    towerWidth: Math.min(width, ...towers.filter((t): t is Tower => !!t).map((t) => t.w)),
  });

  return { modelXML, settingsXML, projectJSON };
}

const RELS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
  ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
  "</Relationships>\n";

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
  ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
  ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
  "</Types>\n";

/** A part in millimetres, Z up, centred on XY with its base at z = 0. */
export type PlatePart = { name: string; geometry: THREE.BufferGeometry; color: string };
/** An object printed on its own plate; `parts` are extra pieces in other colours (e.g. frame text). */
export type ExtraPlate = PlatePart & {
  parts?: PlatePart[];
  /** Open middle of the object (a frame's window), mm — room for the prime tower. */
  opening?: [number, number];
};

/**
 * Bambu Studio lays plates out in a grid one bed width plus a fifth apart;
 * plates are filled left to right, ⌈√count⌉ to a row.
 */
const plateOrigin = (i: number, count: number, bed: [number, number]): [number, number] => {
  const cols = Math.ceil(Math.sqrt(count));
  return [(i % cols) * bed[0] * 1.2, -Math.floor(i / cols) * bed[1] * 1.2];
};

/**
 * A Bambu Studio project: the model on plate 1, each extra object (the frame)
 * on the next plate, set up for `printerId` with one filament per colour.
 */
export async function exportTo3MF(
  root: THREE.Object3D,
  opts: { printerId?: string; profile?: BambuProfile; extra?: ExtraPlate[]; frameOnly?: ExtraPlate } = {}
): Promise<Blob> {
  const profile = opts.profile ?? (await loadBambuProfile(opts.printerId ?? "a1"));
  const bed = profileBed(profile);
  const plates: PlateObject[] = [];
  // frameOnly: a file holding just that object, on plate 1.
  if (!opts.frameOnly) {
    const entries = collectTransformedMeshes(root, [bed[0] / 2, bed[1] / 2]);
    if (entries.length === 0) {
      throw new Error("No visible meshes found to export.");
    }
    plates.push({ name: "FrameCity Model", entries, origin: [0, 0] });
  }

  const extra = opts.frameOnly ? [opts.frameOnly] : opts.extra ?? [];
  const first = plates.length;
  extra.forEach((x, i) => {
    const [ox, oy] = plateOrigin(first + i, first + extra.length, bed);
    const entries = [x, ...(x.parts ?? [])].map((part) => {
      const g = part.geometry.clone().translate(ox + bed[0] / 2, oy + bed[1] / 2, 0);
      const welded = cleanAndWeldGeometry(g, false, 1e-3);
      if (welded !== g) g.dispose();
      return { geometry: welded, color: part.color, name: part.name };
    });
    plates.push({ name: x.name, entries, origin: [ox, oy], opening: x.opening });
  });

  plates.forEach((p) => p.entries.forEach((e) => e.geometry.computeBoundingBox()));
  // Slide objects out of the printer's no-print corner when the bed has room.
  const exclude = excludeBox(profile.config);
  if (exclude) plates.forEach((p) => clearExclusion(p, bed, exclude));
  const { modelXML, settingsXML, projectJSON } = buildBambuProject(plates, profile, bed);
  const zipData = zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
    "_rels/.rels": strToU8(RELS_XML),
    "3D/3dmodel.model": strToU8(modelXML),
    "Metadata/model_settings.config": strToU8(settingsXML),
    "Metadata/project_settings.config": strToU8(projectJSON),
  });

  plates.forEach((p) => p.entries.forEach((e) => e.geometry.dispose()));

  return new Blob([zipData], {
    type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  });
}
