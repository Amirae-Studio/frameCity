"use server";

import { createClient } from "@/lib/supabase/server";
import type { StudioCity, StudioBuilding } from "@/lib/studio";

export type ModelFile = { name: string; url: string; ext?: string };

/**
 * List every GLB or STL model file in a location folder and mint short-lived signed URLs.
 * Defaults to bucket 'city-models', but supports 'buildings' bucket for standalone buildings.
 */
export async function getModelFiles(
  prefix: string,
  bucketName: string = "city-models"
): Promise<ModelFile[]> {
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
    .from(bucketName)
    .list(prefix, { limit: 100 });
  if (listError || !files?.length) return [];

  const validFiles = files.filter((f) => {
    const lower = f.name.toLowerCase();
    return lower.endsWith(".glb") || lower.endsWith(".stl");
  });
  if (!validFiles.length) return [];

  const { data: signed, error: signError } = await supabase.storage
    .from(bucketName)
    .createSignedUrls(
      validFiles.map((f) => `${prefix}/${f.name}`),
      300
    );
  if (signError || !signed) return [];

  const out: ModelFile[] = [];
  signed.forEach((s, i) => {
    if (s.signedUrl) {
      const isStl = validFiles[i].name.toLowerCase().endsWith(".stl");
      out.push({
        name: validFiles[i].name.replace(/\.(glb|stl)$/i, ""),
        url: s.signedUrl,
        ext: isStl ? "stl" : "glb",
      });
    }
  });
  return out;
}

/**
 * Fetch all cities and their places directly from Supabase database tables (`cities` and `places`).
 */
export async function fetchStudioCities(): Promise<StudioCity[]> {
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
    country: c.country || "Other",
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

/**
 * Fetch all individual landmark buildings from Supabase table (`buildings`) or return initial seed list.
 */
export async function fetchStudioBuildings(): Promise<StudioBuilding[]> {
  const supabase = await createClient();

  const { data: dbBuildings, error } = await supabase
    .from("buildings")
    .select("*")
    .order("display_order", { ascending: true });

  if (!error && dbBuildings && dbBuildings.length > 0) {
    return dbBuildings.map((b) => ({
      slug: b.slug,
      name: b.name,
      country: b.country || "United States",
      city_slug: b.city_slug || "new-york",
      city_name: b.city_name || "New York",
      area: b.area || "",
      coords: b.coords || "",
      available: !!b.available,
    }));
  }

  // Seed / default fallback list of landmark buildings matching bucket structure
  return [
    {
      slug: "70-pine",
      name: "70 Pine",
      country: "United States",
      city_slug: "new-york",
      city_name: "New York",
      area: "Financial District · Wall St",
      coords: "40.7064° N, 74.0084° W",
      available: true,
    },
    {
      slug: "empire-state-building",
      name: "Empire State Building",
      country: "United States",
      city_slug: "new-york",
      city_name: "New York",
      area: "Midtown Manhattan",
      coords: "40.7484° N, 73.9857° W",
      available: true,
    },
    {
      slug: "one-world-trade-center",
      name: "One World Trade Center",
      country: "United States",
      city_slug: "new-york",
      city_name: "New York",
      area: "Lower Manhattan",
      coords: "40.7127° N, 74.0134° W",
      available: true,
    },
    {
      slug: "trump-tower",
      name: "Trump Tower",
      country: "United States",
      city_slug: "new-york",
      city_name: "New York",
      area: "Fifth Avenue",
      coords: "40.7624° N, 73.9738° W",
      available: true,
    },
    {
      slug: "world-trade-center",
      name: "World Trade Center",
      country: "United States",
      city_slug: "new-york",
      city_name: "New York",
      area: "Financial District",
      coords: "40.7118° N, 74.0131° W",
      available: true,
    },
  ];
}

