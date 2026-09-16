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
export function collectTransformedMeshes(root: THREE.Object3D): MeshEntry[] {
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
        const x = (posAttr.getX(i) - cx) * MM_SCALE + 128;
        const y = (posAttr.getY(i) - cy) * MM_SCALE + 128;
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

// ----- 3MF XML builders -----

function buildModelXML(entries: MeshEntry[]): {
  modelXML: string;
  objectList: { id: number; name: string; extruder: number }[];
} {
  const colorSet = new Map<string, number>();
  entries.forEach((e) => {
    if (!colorSet.has(e.color)) colorSet.set(e.color, colorSet.size + 1);
  });

  let materialsXML = "";
  colorSet.forEach((id, hex) => {
    materialsXML += '    <m:colorgroup id="' + id + '">\n';
    materialsXML += '      <m:color color="' + hex + 'FF" />\n';
    materialsXML += "    </m:colorgroup>\n";
  });

  let objectsXML = "";
  const componentIds: number[] = [];
  const objectList: { id: number; name: string; extruder: number }[] = [];

  entries.forEach((entry, idx) => {
    const objId = 100 + idx;
    const matId = colorSet.get(entry.color)!;
    componentIds.push(objId);

    const geom = entry.geometry;
    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    if (!posAttr) return;

    let verticesXML = "";
    const vCount = posAttr.count;
    for (let i = 0; i < vCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      verticesXML +=
        '          <vertex x="' +
        x.toFixed(4) +
        '" y="' +
        y.toFixed(4) +
        '" z="' +
        z.toFixed(4) +
        '" />\n';
    }

    let trianglesXML = "";
    const index = geom.index;
    if (index) {
      const count = index.count;
      for (let i = 0; i < count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);
        trianglesXML +=
          '          <triangle v1="' +
          a +
          '" v2="' +
          b +
          '" v3="' +
          c +
          '" pid="' +
          matId +
          '" p1="0" />\n';
      }
    } else {
      const count = posAttr.count;
      for (let i = 0; i < count; i += 3) {
        trianglesXML +=
          '          <triangle v1="' +
          i +
          '" v2="' +
          (i + 1) +
          '" v3="' +
          (i + 2) +
          '" pid="' +
          matId +
          '" p1="0" />\n';
      }
    }

    const layerName = entry.name
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

    objectList.push({
      id: objId,
      name: layerName,
      extruder: matId,
    });

    objectsXML +=
      '    <object id="' +
      objId +
      '" type="model" name="' +
      layerName +
      '" pid="' +
      matId +
      '" pindex="0">\n';
    objectsXML += "      <mesh>\n";
    objectsXML += "        <vertices>\n" + verticesXML + "        </vertices>\n";
    objectsXML +=
      "        <triangles>\n" + trianglesXML + "        </triangles>\n";
    objectsXML += "      </mesh>\n";
    objectsXML += "    </object>\n";
  });

  let componentsXML = "";
  componentIds.forEach((id) => {
    componentsXML += '      <component objectid="' + id + '" />\n';
  });

  const rootObjectId = 1;
  objectsXML +=
    '    <object id="' +
    rootObjectId +
    '" type="model" name="FrameCity Model">\n' +
    "      <components>\n" +
    componentsXML +
    "      </components>\n" +
    "    </object>\n";

  const buildXML = '    <item objectid="' + rootObjectId + '" />\n';

  const modelXML =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<model unit="millimeter" xml:lang="en-US"\n' +
    '  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"\n' +
    '  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"\n' +
    '  xmlns:bambu="http://schemas.bambulab.com/package/2021"\n' +
    '  requiredextensions="m">\n' +
    "  <resources>\n" +
    materialsXML +
    objectsXML +
    "  </resources>\n" +
    "  <build>\n" +
    buildXML +
    "  </build>\n" +
    "</model>";

  return { modelXML, objectList };
}

function buildModelSettingsXML(
  objectList: { id: number; name: string; extruder: number }[]
): string {
  let objectsConfig = '  <object id="1">\n    <metadata key="name" value="FrameCity Model"/>\n  </object>\n';

  objectList.forEach((obj) => {
    objectsConfig +=
      '  <object id="' +
      obj.id +
      '">\n' +
      '    <metadata key="name" value="' +
      obj.name +
      '"/>\n' +
      '    <metadata key="extruder" value="' +
      obj.extruder +
      '"/>\n' +
      "  </object>\n";
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<config>\n" +
    objectsConfig +
    "  <plate>\n" +
    '    <metadata key="plater_id" value="1"/>\n' +
    '    <metadata key="plater_name" value=""/>\n' +
    '    <metadata key="locked" value="false"/>\n' +
    "  </plate>\n" +
    "</config>"
  );
}

const RELS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
  '  <Relationship Id="rel0" Target="/3D/model.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n' +
  '  <Relationship Id="rel1" Target="/Metadata/model_settings.config" Type="http://schemas.bambulab.com/bambustudio/2021/model_settings" />\n' +
  '  <Relationship Id="rel2" Target="/Metadata/slice_info.config" Type="http://schemas.bambulab.com/bambustudio/2021/slice_info" />\n' +
  "</Relationships>";

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
  '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n' +
  '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n' +
  '  <Default Extension="config" ContentType="application/vnd.bambulab.bambu-studio.config+xml" />\n' +
  "</Types>";

const SLICE_INFO_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  "<config>\n" +
  "  <header>\n" +
  '    <header_item key="header_info" value="created by BambuStudio 01.09.00.70"/>\n' +
  "  </header>\n" +
  "</config>";

export function exportTo3MF(root: THREE.Object3D): Blob {
  const entries = collectTransformedMeshes(root);

  if (entries.length === 0) {
    throw new Error("No visible meshes found to export.");
  }

  const { modelXML, objectList } = buildModelXML(entries);
  const modelSettingsXML = buildModelSettingsXML(objectList);

  const zipData = zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
    "_rels/.rels": strToU8(RELS_XML),
    "3D/model.model": strToU8(modelXML),
    "Metadata/model_settings.config": strToU8(modelSettingsXML),
    "Metadata/slice_info.config": strToU8(SLICE_INFO_XML),
  });

  entries.forEach((e) => e.geometry.dispose());

  return new Blob([zipData], {
    type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  });
}


