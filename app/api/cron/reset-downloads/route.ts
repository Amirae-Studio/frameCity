import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron Job handler for FrameCity download quota & maintenance.
 * Quotas automatically reset 1 month / 30 days from each user's code redemption time (`redeemed_at`).
 * This endpoint can be scheduled (daily or monthly) to run maintenance or send cycle notification emails.
 * URL: /api/cron/reset-downloads
 */
export async function GET(request: Request) {
  // Authorization check using CRON_SECRET if configured
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();

    // Clean up old download logs older than 1 year for database optimization
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { count } = await supabase
      .from("user_downloads")
      .delete({ count: "exact" })
      .lt("downloaded_at", oneYearAgo.toISOString());

    console.log(
      `[FrameCity Cron] Maintenance completed at ${now.toISOString()}. Cleaned ${count || 0} old records.`
    );

    return NextResponse.json({
      ok: true,
      message: "Quota cycles calculated per user from redeemed_at. System maintenance complete.",
      cleanedRecords: count || 0,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[FrameCity Cron Error]:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to process cron job" },
      { status: 500 }
    );
  }
}
