"use server";

import { createClient } from "@/lib/supabase/server";

export type DownloadResult =
  | {
      ok: true;
      tier: "explorer" | "architect" | "studio";
      used?: number;
      limit?: number;
      remaining?: number;
      unlimited?: boolean;
    }
  | {
      ok: false;
      error: string;
      tier?: string;
      used?: number;
      limit?: number;
      remaining?: number;
    };

export type UserDownloadStats = {
  hasAccess: boolean;
  tier: "explorer" | "architect" | "studio";
  monthlyCount: number;
  monthlyLimit: number | null; // 25 for explorer, null for architect/studio
  remaining: number | null;
  resetDate: string; // formatted date of 1st of next month
  recentDownloads: Array<{
    id: string;
    citySlug: string;
    locationSlug: string;
    downloadedAt: string;
  }>;
};

export async function recordDownload(
  citySlug: string,
  locationSlug: string
): Promise<DownloadResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Call the atomic RPC in Supabase
  const { data, error } = await supabase.rpc("record_user_download", {
    p_city_slug: citySlug,
    p_location_slug: locationSlug,
  });

  if (error) {
    console.error("Download recording failed RPC error:", error);
    // Fallback logic if RPC fails or table is directly queried
    const { data: profile } = await supabase
      .from("profiles")
      .select("tier, has_access")
      .eq("id", user.id)
      .single();

    if (!profile?.has_access || !profile.tier) {
      return { ok: false, error: "You must unlock access with a valid code first." };
    }

    const tier = profile.tier as "explorer" | "architect" | "studio";

    if (tier === "explorer") {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from("user_downloads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("downloaded_at", firstOfMonth.toISOString());

      const used = count || 0;
      if (used >= 25) {
        return {
          ok: false,
          error: "Monthly limit of 25 downloads reached for Explorer tier.",
          tier,
          used,
          limit: 25,
          remaining: 0,
        };
      }
    }

    const { error: insertErr } = await supabase.from("user_downloads").insert({
      user_id: user.id,
      city_slug: citySlug,
      location_slug: locationSlug,
    });

    if (insertErr) {
      return { ok: false, error: "Failed to record download in database." };
    }

    return { ok: true, tier };
  }

  return data as DownloadResult;
}

export async function getUserDownloadStats(): Promise<UserDownloadStats | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access, tier, redeemed_code, redeemed_at")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.has_access) return null;

  let tier = profile.tier as "explorer" | "architect" | "studio" | null;

  // Dynamically fetch live tier from access_codes table to guarantee real-time sync
  if (profile.redeemed_code) {
    const { data: codeRow } = await supabase
      .from("access_codes")
      .select("tier")
      .eq("code", profile.redeemed_code)
      .single();
    if (codeRow?.tier) {
      tier = codeRow.tier as "explorer" | "architect" | "studio";
    }
  }

  if (!tier) return null;
  const hasAccess = true;

  // Calculate 1-month download cycle based on the exact time the access code was redeemed (redeemed_at)
  const now = new Date();
  const redeemedAt = profile.redeemed_at ? new Date(profile.redeemed_at) : now;

  let cycleStart = new Date(redeemedAt);
  while (
    new Date(
      cycleStart.getFullYear(),
      cycleStart.getMonth() + 1,
      cycleStart.getDate(),
      cycleStart.getHours(),
      cycleStart.getMinutes()
    ) <= now
  ) {
    cycleStart.setMonth(cycleStart.getMonth() + 1);
  }

  const nextResetDate = new Date(
    cycleStart.getFullYear(),
    cycleStart.getMonth() + 1,
    cycleStart.getDate(),
    cycleStart.getHours(),
    cycleStart.getMinutes()
  );

  // Query download count for the current cycle
  const { count } = await supabase
    .from("user_downloads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("downloaded_at", cycleStart.toISOString());

  const monthlyCount = count || 0;
  const monthlyLimit = tier === "explorer" ? 25 : null;
  const remaining = tier === "explorer" ? Math.max(0, 25 - monthlyCount) : null;

  // Fetch recent download history (last 10)
  const { data: history } = await supabase
    .from("user_downloads")
    .select("id, city_slug, location_slug, downloaded_at")
    .eq("user_id", user.id)
    .order("downloaded_at", { ascending: false })
    .limit(10);

  const recentDownloads = (history || []).map((h) => ({
    id: h.id,
    citySlug: h.city_slug,
    locationSlug: h.location_slug,
    downloadedAt: h.downloaded_at,
  }));

  return {
    hasAccess,
    tier,
    monthlyCount,
    monthlyLimit,
    remaining,
    resetDate: nextResetDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    recentDownloads,
  };
}
