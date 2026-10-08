"use server";

import { createClient } from "@/lib/supabase/server";
import { inferColorFromName } from "@/lib/studio";
import type { StudioCity, StudioBuilding } from "@/lib/studio";
import { listR2Objects, getR2PublicUrl, R2_BUCKET } from "@/lib/r2";

export type ModelFile = {
  name: string;
  url: string;
  ext?: string;
  layer: string;
  isSubPart: boolean;
  partName?: string;
  partKey?: string;
  colorHint?: string | null;
  /** True for decimated preview GLBs served to view-only users.
   *  The viewer must apply the same Z-up→Y-up rotation as for raw STLs. */
  isPreview?: boolean;
};

/** Map Supabase bucket name → R2 bucket name */
function resolveR2Bucket(bucketName: string): string {
  if (bucketName === "buildings") return R2_BUCKET.buildings;
  return R2_BUCKET.cityModels; // default: city-models
}

const MODEL_EXTENSIONS = /\.(glb|stl)$/i;

/**
 * List every GLB or STL model file in a location folder and mint stream URLs.
 * Defaults to bucket 'city-models', but supports 'buildings' bucket for standalone buildings.
 *
 * Supports sub-part folders for multi-color layers (e.g. main-building/middle-red.stl).
 */
export async function getModelFiles(
  prefix: string,
  bucketName: string = "city-models"
): Promise<ModelFile[]> {
  if (!prefix) return [];

  // Auth check — still via Supabase
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Decide whether this user gets full-quality or preview-quality files.
  // has_access=true  → full STL/GLB under their normal R2 key
  // has_access=false → decimated preview GLBs under the "preview/" prefix
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access")
    .eq("id", user.id)
    .single();
  const hasAccess = Boolean(profile?.has_access);

  // Fetch file list from R2
  const r2Bucket = resolveR2Bucket(bucketName);
  console.log(`[R2] listR2Objects bucket="${r2Bucket}" prefix="${prefix}"`);

  // Trailing slash so "paris/tour-eiffel" doesn't also match "paris/tour-eiffel-2/…"
  const folder = prefix.replace(/\/+$/, "");

  let matchedPrefix = `${folder}/`;
  let objects: { key: string; size: number }[] = [];
  try {
    objects = await listR2Objects(r2Bucket, matchedPrefix);

    // Fallback: If 0 objects found, try with double-prefix (e.g. city/city/location) or single-prefix
    if (objects.length === 0 && folder.includes("/")) {
      const parts = folder.split("/");
      if (parts.length === 2 && parts[0] !== parts[1]) {
        const doublePrefix = `${parts[0]}/${parts[0]}/${parts[1]}/`;
        console.log(`[R2] Retrying with double prefix "${doublePrefix}"`);
        const doubleObjects = await listR2Objects(r2Bucket, doublePrefix);
        if (doubleObjects.length > 0) {
          objects = doubleObjects;
          matchedPrefix = doublePrefix;
        }
      }
    }
    console.log(`[R2] found ${objects.length} objects for "${prefix}"`);
  } catch (err) {
    console.error(`[R2] listR2Objects FAILED for bucket="${r2Bucket}" prefix="${prefix}":`, err);
    return [];
  }

  const validObjects = objects.filter((o) => MODEL_EXTENSIONS.test(o.key));
  if (!validObjects.length) {
    console.warn(`[R2] No GLB/STL files found under "${r2Bucket}/${prefix}"`);
    return [];
  }

  // Use /api/r2 stream endpoint so Three.js STLLoader/GLTFLoader bypasses CORS issues.
  // For view-only users, swap the key to its preview/ counterpart so they receive the
  // decimated GLB instead of the print-ready STL (the /api/r2 route enforces this too).
  const out: ModelFile[] = validObjects.map((obj) => {
    const originalKey = obj.key;
    const resolvedKey = hasAccess
      ? originalKey
      : `preview/${originalKey.replace(/\.(stl|glb)$/i, ".glb")}`;
    const isStl = !hasAccess ? false : originalKey.toLowerCase().endsWith(".stl");
    const streamUrl = `/api/r2/${r2Bucket}/${resolvedKey}`;
    const isPreview = !hasAccess;

    // Relative path inside the location folder
    let relPath = obj.key;
    if (obj.key.startsWith(matchedPrefix)) {
      relPath = obj.key.slice(matchedPrefix.length);
    } else if (obj.key.includes(folder)) {
      relPath = obj.key.slice(obj.key.indexOf(folder) + folder.length).replace(/^\/+/, "");
    }

    const pathSegments = relPath.split("/").filter(Boolean);
    let layer = "";
    let isSubPart = false;
    let partName = "";
    let partKey = "";
    let colorHint: string | null = null;

    if (pathSegments.length > 1) {
      // Sub-part inside a layer folder (e.g. main-building/middle-red.stl)
      layer = pathSegments[0].replace(/\.(glb|stl)$/i, "");
      const filename = pathSegments[pathSegments.length - 1];
      partName = filename.replace(/\.(glb|stl)$/i, "");
      isSubPart = true;
      partKey = `${layer}/${partName}`;
      colorHint = inferColorFromName(partName);
    } else {
      // Root layer file (e.g. main-building.stl or terrain.stl)
      const filename = pathSegments[0] || obj.key.split("/").pop() || "layer";
      layer = filename.replace(/\.(glb|stl)$/i, "");
      partName = layer;
      isSubPart = false;
      partKey = layer;
      colorHint = inferColorFromName(layer);
    }

    return {
      name: isSubPart ? partName : layer,
      url: streamUrl,
      ext: isStl ? "stl" : "glb",
      layer,
      isSubPart,
      partName,
      partKey,
      colorHint,
      isPreview,
    };
  });

  console.log(`[R2] returning ${out.length} model files (subparts: ${out.filter(f => f.isSubPart).length})`);
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
  // Validate the raw input before sanitizing so we catch a truly empty field.
  if (!username || !username.trim()) {
    return { ok: false, error: "Please enter your MakerWorld username." };
  }

  // Sanitize: remove leading @ and SQL/PostgREST wildcard characters (% and _)
  const cleanName = username.trim().replace(/^@/, "").replace(/[%_,]/g, "");

  // After sanitization the name may still be empty (e.g. input was just "@")
  if (!cleanName) {
    return { ok: false, error: "Please enter your MakerWorld username." };
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[verifyMakerWorldUsername] Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
      return { ok: false, error: "Server configuration error. Please contact support." };
    }

    // Query customers table for exact match on makerworld_username
    const res = await fetch(
      `${supabaseUrl}/rest/v1/customers?or=(makerworld_username.eq.${encodeURIComponent(
        cleanName
      )},makerworld_username.eq.${encodeURIComponent("@" + cleanName)})&select=id,makerworld_username,tier,reward_tier&limit=1`,
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
): Promise<{ ok: boolean; tier?: BackerTier; error?: string; errorCode?: string }> {
  const code = rawCode.trim().toUpperCase();
  const username = rawUsername.trim().replace(/^@/, "").replace(/[%_,]/g, "");

  // Check username first — it's the first field in the UI flow.
  if (!username) {
    return { ok: false, error: "Please enter your MakerWorld username." };
  }
  if (!code) {
    return { ok: false, error: "Please enter an access code." };
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: "Server database configuration error." };
  }

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
    const isInvalidCode = data?.error === "invalid_code" || data?.error === "code_already_used";
    return {
      ok: false,
      errorCode: isInvalidCode ? "invalid_code" : "redeem_failed",
      error: isInvalidCode
        ? "That code isn't valid or has already been used."
        : "Couldn't redeem the code — please try again.",
    };
  }

  // 6. Ensure profile has the exact tier and makerworld_name using service role for security
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        has_access: true,
        tier: customerTier,
        makerworld_name: verifiedUsername,
        redeemed_code: code,
        redeemed_at: new Date().toISOString(),
      }),
    });
  } catch (patchErr) {
    console.error("Error updating profile with service role:", patchErr);
  }

  return { ok: true, tier: customerTier };
}

/**
 * Upgrade tier for an existing logged-in user with full DB check on access_codes and backer customers.
 */
export async function upgradeUserTier(
  rawCode: string,
  optionalUsername?: string
): Promise<{ ok: boolean; tier?: BackerTier; error?: string }> {
  const code = rawCode.trim().toUpperCase();

  if (!code) {
    return { ok: false, error: "Please enter an access code." };
  }

  // 1. Verify user session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated. Please log in first." };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: "Server database configuration error." };
  }

  // 2. Fetch current profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access, tier, makerworld_name, redeemed_code")
    .eq("id", user.id)
    .single();

  const effectiveUsername =
    (optionalUsername || "").trim().replace(/^@/, "").replace(/[%_,]/g, "") ||
    profile?.makerworld_name?.trim().replace(/^@/, "");

  // 3. Query access_codes table in database using service role
  let newTier: BackerTier = "explorer";
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
      return { ok: false, error: "Error checking access code in database." };
    }

    const codeRecords = await codeRes.json();
    if (!codeRecords || codeRecords.length === 0) {
      return { ok: false, error: "This access code is invalid or does not exist." };
    }

    const codeRecord = codeRecords[0];
    if (!codeRecord.is_active) {
      return { ok: false, error: "This access code has been deactivated." };
    }
    if (codeRecord.uses >= codeRecord.max_uses) {
      return { ok: false, error: "This access code has already reached its maximum redemptions." };
    }

    newTier = normalizeRewardTier(codeRecord.tier || "explorer");

    // 4. Optional / Backer verification if username is present
    if (effectiveUsername) {
      const verifyRes = await verifyMakerWorldUsername(effectiveUsername);
      if (verifyRes.ok && verifyRes.tier) {
        // If customer exists in DB, ensure code tier matches or is valid for backer
        if (verifyRes.tier !== newTier) {
          const codeTierName = newTier.charAt(0).toUpperCase() + newTier.slice(1);
          const customerTierName = verifyRes.tier.charAt(0).toUpperCase() + verifyRes.tier.slice(1);
          return {
            ok: false,
            error: `Tier mismatch: Code is for ${codeTierName} tier, but MakerWorld backer reward is for ${customerTierName} tier.`,
          };
        }
      }
    }
  } catch (dbErr) {
    console.error("DB check error during tier upgrade:", dbErr);
    return { ok: false, error: "Failed to verify access code with database." };
  }

  // 5. Redeem via RPC or atomic database update
  let rpcRes = await supabase.rpc("redeem_access_code", {
    p_code: code,
    p_makerworld_name: effectiveUsername || null,
  });

  if (rpcRes.error) {
    rpcRes = await supabase.rpc("redeem_access_code", {
      p_code: code,
    });
  }

  const { data, error } = rpcRes;
  if (error || !data?.ok) {
    const errorMsg = data?.error || error?.message;
    if (errorMsg === "invalid_code" || errorMsg === "code_already_used") {
      return { ok: false, error: "This access code is invalid or already used." };
    }
    return { ok: false, error: errorMsg || "Failed to redeem upgrade code." };
  }

  // 6. Ensure profile is updated with the new tier
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        has_access: true,
        tier: newTier,
        redeemed_code: code,
        redeemed_at: new Date().toISOString(),
        ...(effectiveUsername ? { makerworld_name: effectiveUsername } : {}),
      }),
    });
  } catch (err) {
    console.error("Error updating profile on upgrade:", err);
  }

  return { ok: true, tier: newTier };
}
