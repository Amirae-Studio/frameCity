/**
 * Custom 3MF & Geometry Exporter for FrameCity Studio
 *
 * Generates a valid .3mf ZIP archive (compatible with BambuStudio / Orca Slicer / PrusaSlicer)
 * from a Three.js Object3D/Group.
 *
 * Automatically converts coordinates from Three.js Y-up space to 3D Slicer Z-up space,
 * scales 1 Three.js unit = 50 mm, aligns the base to Z=0, and centers on bed plate.
 *
 * Uses fflate for in-browser ZIP creation (no server round-trip).
 */

import * as THREE from "three";
import { zipSync, strToU8 } from "fflate";

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
 * Collects all visible meshes from Three.js hierarchy, applies world matrices,
 * transforms Y-up to Z-up (X -> X, Y -> -Z, Z -> Y), scales max horizontal dimension
 * to exactly targetSizeMM (default 150mm / 15cm x 15cm), centers X & Y at (128, 128),
 * and sets Z.min = 0.
 */
export function collectTransformedMeshes(
  root: THREE.Object3D,
  targetSizeMM = 150
): MeshEntry[] {
  const entries: MeshEntry[] = [];

  root.updateWorldMatrix(true, true);

  let minZ = Infinity;
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  const rawMeshes: { geom: THREE.BufferGeometry; color: string; name: string }[] = [];

  root.traverse((obj) => {
    if (!obj.visible) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    let name = mesh.name || obj.parent?.name || "mesh";
    if (name.startsWith("boolean_cube")) return; // Skip subtractive volume objects

    const geom = mesh.geometry.clone();
    mesh.updateWorldMatrix(true, false);
    geom.applyMatrix4(mesh.matrixWorld);

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

    rawMeshes.push({
      geom,
      color: getMaterialColor(mesh.material),
      name,
    });
  });

  if (rawMeshes.length === 0) return [];

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const currentWidth = maxX - minX;
  const currentDepth = maxY - minY;
  const maxDim = Math.max(currentWidth, currentDepth);

  // Scale factor to make max dimension exactly targetSizeMM (150 mm = 15 cm)
  const scaleFactor = maxDim > 0 ? targetSizeMM / maxDim : 1;

  // Center X & Y at (128, 128) - exact center of Bambu Lab build plate (256x256mm)
  // Scale size to 15cm x 15cm (150mm x 150mm) and align Z.min to 0 (flat on bed plate)
  rawMeshes.forEach(({ geom, color, name }) => {
    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    if (posAttr) {
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        const x = (posAttr.getX(i) - cx) * scaleFactor + 128;
        const y = (posAttr.getY(i) - cy) * scaleFactor + 128;
        const z = (posAttr.getZ(i) - minZ) * scaleFactor;
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
      geom.computeBoundingBox();
      geom.computeVertexNormals();
    }

    entries.push({
      geometry: geom,
      color,
      name,
    });
  });

  return entries;
}

// ----- 3MF XML builders -----

function buildModelXML(entries: MeshEntry[]): string {
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

  return (
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
    "</model>"
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

const MODEL_SETTINGS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<config>\n' +
  '  <object id="1">\n' +
  '    <metadata key="name" value="FrameCity Model"/>\n' +
  '    <metadata key="extruder" value="1"/>\n' +
  '  </object>\n' +
  '  <plate>\n' +
  '    <metadata key="plater_id" value="1"/>\n' +
  '    <metadata key="plater_name" value=""/>\n' +
  '    <metadata key="locked" value="false"/>\n' +
  '  </plate>\n' +
  '</config>';

const SLICE_INFO_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<config>\n' +
  '  <header>\n' +
  '    <header_item key="header_info" value="created by BambuStudio 01.09.00.70"/>\n' +
  '  </header>\n' +
  '</config>';

export function exportTo3MF(root: THREE.Object3D): Blob {
  const entries = collectTransformedMeshes(root);

  if (entries.length === 0) {
    throw new Error("No visible meshes found to export.");
  }

  const modelXML = buildModelXML(entries);

  const zipData = zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
    "_rels/.rels": strToU8(RELS_XML),
    "3D/model.model": strToU8(modelXML),
    "Metadata/model_settings.config": strToU8(MODEL_SETTINGS_XML),
    "Metadata/slice_info.config": strToU8(SLICE_INFO_XML),
  });

  entries.forEach((e) => e.geometry.dispose());

  return new Blob([zipData], {
    type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  });
}

