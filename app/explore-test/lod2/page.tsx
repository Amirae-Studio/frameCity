"use client";
// TEMP: local verification only — delete before commit.
import { useEffect, useState } from "react";
import { fetchLod2 } from "@/lib/explore/lod2";
import { fetchOvertureBuildings } from "@/lib/explore/overture";
import { centroid, pointInRing } from "@/lib/explore/geo";

const PLACES: [string, number, number][] = [
  ["Docomo Yoyogi (PLATEAU)", 139.7031, 35.68372],
  ["Zurich Grossmünster (swisstopo)", 8.5441, 47.37],
  ["Amsterdam Dam (3DBAG)", 4.8936, 52.3731],
];

export default function Page() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      for (const [name, lng, lat] of PLACES) {
        const shape = { kind: "square" as const, center: [lng, lat] as [number, number], size: 300, rotation: 0 };
        try {
          const [r, osm] = await Promise.all([fetchLod2(shape), fetchOvertureBuildings(shape)]);
          if (!r) { setLog((l) => [...l, `${name}: null`]); continue; }
          let vPos = 0, inOsm = 0, dx = 0, dy = 0, nOff = 0;
          for (const m of r.meshes) {
            let vol = 0;
            const t = m.tris;
            for (let i = 0; i < t.length; i += 9) {
              const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.slice(i, i + 9);
              vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
            }
            if (vol > 0) vPos++;
            const c: [number, number] = [(m.box.minX + m.box.maxX) / 2, (m.box.minY + m.box.maxY) / 2];
            const hit = osm.find((b) => pointInRing(c, b.outer));
            if (hit) {
              inOsm++;
              const oc = centroid(hit.outer);
              if (m.footprint < 3000) { dx += c[0] - oc[0]; dy += c[1] - oc[1]; nOff++; }
            }
          }
          setLog((l) => [...l, `${name}: meshes=${r.meshes.length} outwardVolume=${vPos}/${r.meshes.length} insideOsmFootprint=${inOsm} meanOffset=(${(dx / (nOff || 1)).toFixed(2)}, ${(dy / (nOff || 1)).toFixed(2)})m`]);
        } catch (e) {
          setLog((l) => [...l, `${name}: ERROR ${String(e)}`]);
        }
      }
      setLog((l) => [...l, "DONE"]);
    })();
  }, []);
  return <pre id="out" style={{ padding: 20, whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>;
}
