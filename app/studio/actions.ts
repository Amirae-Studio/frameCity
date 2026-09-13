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

export type BackerTier = "merchant" | "architect" | "explorer";

/**
 * Normalizes backer reward tier names into one of the three core platform tiers:
 * - 'Patron' or 'Merchant...' -> 'merchant'
 * - 'Architect...' -> 'architect'
 * - 'Explorer...' -> 'explorer'
 */
function normalizeRewardTier(rawTier: string | null | undefined): BackerTier {
  if (!rawTier) return "explorer";
  const lower = rawTier.toLowerCase();
  if (lower.includes("patron") || lower.includes("merchant")) {
    return "merchant";
  }
  if (lower.includes("architect")) {
    return "architect";
  }
  if (lower.includes("explorer")) {
    return "explorer";
  }
  return "explorer";
}

/**
 * Verify if a MakerWorld username exists in the Supabase `customers` table
 * and retrieve their normalized tier from the `reward_tier` or `tier` column.
 */
export async function verifyMakerWorldUsername(
  username: string
): Promise<{
  ok: boolean;
  cleanName?: string;
  tier?: BackerTier;
  rawTier?: string;
  error?: string;
}> {
  const cleanName = username.trim().replace(/^@/, "");

  if (!cleanName) {
    return { ok: false, error: "Please enter your MakerWorld username." };
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    // Query customers table for makerworld_username matching cleanName or @cleanName
    const res = await fetch(
      `${supabaseUrl}/rest/v1/customers?or=(makerworld_username.ilike.${encodeURIComponent(
        cleanName
      )},makerworld_username.ilike.${encodeURIComponent("@" + cleanName)})&select=*&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (res.ok) {
      const customers = await res.json();
      if (customers && customers.length > 0) {
        const customer = customers[0];
        const rawTier = customer.tier || customer.reward_tier || "";
        const normalizedTier = normalizeRewardTier(rawTier);
        const resolvedName = (customer.makerworld_username || cleanName).replace(/^@/, "");

        return {
          ok: true,
          cleanName: resolvedName,
          tier: normalizedTier,
          rawTier: rawTier,
        };
      }
    }

    return {
      ok: false,
      error: `MakerWorld username "@${cleanName}" was not found in the backer database.`,
    };
  } catch (err) {
    console.error("MakerWorld customer verification error:", err);
    return { ok: false, error: "Error checking backer database." };
  }
}

/**
 * Redeem an access code for an authenticated user, verifying:
 * 1. Backer exists in `customers` table and getting their reward tier
 * 2. Access code exists in `access_codes` table and getting its tier
 * 3. Checking that the access code tier matches the customer's reward tier
 * 4. Redeeming code and setting profile access and tier
 */
export async function redeemBackerAccessCode(
  rawCode: string,
  rawUsername: string
): Promise<{ ok: boolean; tier?: BackerTier; error?: string }> {
  const code = rawCode.trim().toUpperCase();
  const username = rawUsername.trim().replace(/^@/, "");

  if (!code) {
    return { ok: false, error: "Please enter an access code." };
  }
  if (!username) {
    return { ok: false, error: "Please enter your MakerWorld username." };
  }

  // 1. Verify user session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated. Please log in first." };
  }

  // 2. Verify MakerWorld customer & tier from `customers` table
  const verifyRes = await verifyMakerWorldUsername(username);
  if (!verifyRes.ok || !verifyRes.cleanName || !verifyRes.tier) {
    return {
      ok: false,
      error: verifyRes.error || "MakerWorld username could not be verified in backer list.",
    };
  }

  const verifiedUsername = verifyRes.cleanName;
  const customerTier = verifyRes.tier;

  // 3. Fetch access code from `access_codes` table to check validity and code tier
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  try {
    const codeRes = await fetch(
      `${supabaseUrl}/rest/v1/access_codes?code=eq.${encodeURIComponent(code)}&select=*&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!codeRes.ok) {
      console.error("Error fetching access code from Supabase:", await codeRes.text());
      return { ok: false, error: "Error verifying access code in database." };
    }

    const codeRecords = await codeRes.json();
    if (!codeRecords || codeRecords.length === 0) {
      return { ok: false, error: "That access code is not valid." };
    }

    const codeRecord = codeRecords[0];

    if (!codeRecord.is_active) {
      return { ok: false, error: "This access code is inactive or has been disabled." };
    }

    if (codeRecord.uses >= codeRecord.max_uses) {
      return { ok: false, error: "That access code has already been redeemed." };
    }

    const rawCodeTier = codeRecord.tier || "explorer";
    const codeTier = normalizeRewardTier(rawCodeTier);

    // 4. Check if access code tier matches customer table tier!
    if (codeTier !== customerTier) {
      const codeTierName = codeTier.charAt(0).toUpperCase() + codeTier.slice(1);
      const customerTierName = customerTier.charAt(0).toUpperCase() + customerTier.slice(1);
      return {
        ok: false,
        error: `Tier mismatch: This access code is for the ${codeTierName} Tier, but your MakerWorld backer reward is for the ${customerTierName} Tier.`,
      };
    }
  } catch (err) {
    console.error("Access code verification error:", err);
    return { ok: false, error: "Error checking access code tier." };
  }

  // 5. Redeem code atomically via RPC
  let rpcRes = await supabase.rpc("redeem_access_code", {
    p_code: code,
    p_makerworld_name: verifiedUsername,
  });

  if (rpcRes.error) {
    console.warn("2-param RPC fallback, trying 1-param RPC:", rpcRes.error.message);
    rpcRes = await supabase.rpc("redeem_access_code", {
      p_code: code,
    });
  }

  const { data, error } = rpcRes;

  if (error) {
    console.error("Redeem code error:", error);
    return { ok: false, error: error.message || "Failed to redeem access code." };
  }

  if (!data?.ok) {
    return {
      ok: false,
      error:
        data?.error === "invalid_code"
          ? "That code isn't valid or has already been used."
          : "Couldn't redeem the code — please try again.",
    };
  }

  // 6. Ensure profile has the exact tier and makerworld_name
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      has_access: true,
      tier: customerTier,
      makerworld_name: verifiedUsername,
      redeemed_code: code,
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileErr) {
    console.error("Error updating profile tier:", profileErr);
  }

  return { ok: true, tier: customerTier };
}
