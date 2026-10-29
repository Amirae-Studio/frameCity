import { NextResponse } from "next/server";

// Project PLATEAU (Japan MLIT) publishes LOD2 building models per municipality.
// Its catalog is ~10 MB, too large to send to the browser, so this route keeps
// it in memory and answers "which LOD2 tileset covers municipality X?".

const CATALOG = "https://api.plateau.reearth.io/datacatalog/plateau-datasets";
const TTL = 24 * 60 * 60 * 1000;

type Dataset = {
  type_en?: string;
  lod?: string;
  url: string;
  year?: number;
  texture?: boolean;
  city_code?: string;
  ward_code?: string | null;
  city?: string;
  ward?: string | null;
};

let cache: { at: number; byCode: Map<string, Dataset> } | null = null;

async function lod2ByCode(): Promise<Map<string, Dataset>> {
  if (cache && Date.now() - cache.at < TTL) return cache.byCode;
  const res = await fetch(CATALOG, { cache: "no-store" });
  if (!res.ok) throw new Error(`PLATEAU catalog ${res.status}`);
  const { datasets } = (await res.json()) as { datasets: Dataset[] };
  const byCode = new Map<string, Dataset>();
  for (const d of datasets) {
    if (d.type_en !== "bldg" || d.lod !== "2" || !d.url?.endsWith("tileset.json")) continue;
    const code = d.ward_code || d.city_code;
    if (!code) continue;
    // Prints need no textures (and they're 3× larger): prefer untextured, then newest.
    const prev = byCode.get(code);
    const better =
      !prev ||
      (!!prev.texture && !d.texture) ||
      (!!prev.texture === !!d.texture && (d.year ?? 0) > (prev.year ?? 0));
    if (better) byCode.set(code, d);
  }
  cache = { at: Date.now(), byCode };
  return byCode;
}

export async function GET(request: Request) {
  const codes = (new URL(request.url).searchParams.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim().padStart(5, "0"))
    .filter((c) => /^\d{5}$/.test(c))
    .slice(0, 8);
  if (!codes.length) return NextResponse.json({ tilesets: [] });
  try {
    const byCode = await lod2ByCode();
    const tilesets = codes.flatMap((code) => {
      const d = byCode.get(code);
      return d ? [{ code, url: d.url, name: [d.city, d.ward].filter(Boolean).join(" "), year: d.year }] : [];
    });
    return NextResponse.json(
      { tilesets },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } }
    );
  } catch (err) {
    console.error("[explore/plateau]", err);
    return NextResponse.json({ tilesets: [], error: "catalog unavailable" }, { status: 502 });
  }
}
