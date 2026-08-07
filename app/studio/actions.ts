"use server";

import { createClient } from "@/lib/supabase/server";

const BUCKET = "city-models";

export type ModelFile = { name: string; url: string };

/**
 * List every GLB layer in a location folder (e.g. "paris/tour-eiffel/" holds
 * grass.glb, roads.glb, terrain.glb, …) and mint short-lived signed URLs for
 * all of them — but only for a signed-in backer who has redeemed an access
 * code. Returns [] when the user isn't allowed or the folder is empty, and
 * the caller falls back to the placeholder tile.
 */
export async function getModelFiles(prefix: string): Promise<ModelFile[]> {
  if (!prefix) return [];

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access")
    .eq("id", user.id)
    .single();
  if (!profile?.has_access) return [];

  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 100 });
  if (listError || !files?.length) return [];

  const glbs = files.filter((f) => f.name.toLowerCase().endsWith(".glb"));
  if (!glbs.length) return [];

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      glbs.map((f) => `${prefix}/${f.name}`),
      300
    );
  if (signError || !signed) return [];

  const out: ModelFile[] = [];
  signed.forEach((s, i) => {
    if (s.signedUrl) {
      out.push({ name: glbs[i].name.replace(/\.glb$/i, ""), url: s.signedUrl });
    }
  });
  return out;
}

/**
 * Fetch all cities and their places directly from Supabase database tables (`cities` and `places`).
 */
export async function fetchStudioCities(): Promise<import("@/lib/studio").StudioCity[]> {
  const supabase = await createClient();

  const { data: dbCities, error: cErr } = await supabase
    .from("cities")
    .select("*")
    .order("display_order", { ascending: true });

  if (cErr || !dbCities) {
    console.error("Error fetching cities from DB:", cErr);
    return [];
  }

  const { data: dbPlaces, error: pErr } = await supabase
    .from("places")
    .select("*")
    .order("display_order", { ascending: true });

  if (pErr) {
    console.error("Error fetching places from DB:", pErr);
  }

  const places = dbPlaces || [];

  return dbCities.map((c) => ({
    slug: c.slug,
    name: c.name,
    available: !!c.available,
    locations: places
      .filter((p) => p.city_slug === c.slug)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        area: p.area || "",
        coords: p.coords || "",
        completed: !!p.completed,
      })),
  }));
}

