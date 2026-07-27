import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserDownloadStats } from "@/app/actions/downloads";
import { toNavUser } from "@/lib/user";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { UpgradeTierModal } from "@/components/UpgradeTierModal";

export const metadata = {
  title: "Your account — FrameCity",
};

const TIER_LABELS: Record<string, { title: string; subtitle: string; bg: string; color: string }> = {
  explorer: {
    title: "Explorer",
    subtitle: "Up to 25 city models per month",
    bg: "rgba(224, 122, 95, 0.15)",
    color: "#e07a5f",
  },
  architect: {
    title: "Architect",
    subtitle: "Lifetime access · Unlimited downloads",
    bg: "rgba(59, 130, 246, 0.15)",
    color: "#60a5fa",
  },
  studio: {
    title: "Studio",
    subtitle: "Commercial license · Unlimited downloads",
    bg: "rgba(245, 158, 11, 0.15)",
    color: "#fbbf24",
  },
};

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account"); // middleware backstop

  const nav = toNavUser(user)!;

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access, tier, redeemed_code, redeemed_at")
    .eq("id", user.id)
    .single();

  const hasAccess = !!profile?.has_access;
  let tierKey = profile?.tier as "explorer" | "architect" | "studio" | null;

  // Real-time lookup from access_codes table to guarantee tier sync
  if (hasAccess && profile?.redeemed_code) {
    const { data: codeRow } = await supabase
      .from("access_codes")
      .select("tier")
      .eq("code", profile.redeemed_code)
      .single();
    if (codeRow?.tier) {
      tierKey = codeRow.tier as "explorer" | "architect" | "studio";
    }
  }

  const tierInfo = tierKey ? TIER_LABELS[tierKey] : null;

  const redeemedOn = profile?.redeemed_at
    ? new Date(profile.redeemed_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const stats = hasAccess ? await getUserDownloadStats() : null;

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="flex items-center justify-between border-b border-cream/[0.09] px-6 py-[18px] md:px-[52px]">
        <Link href="/" className="inline-flex">
          <Logo className="theme-logo h-8" priority />
        </Link>
        <Link
          href="/"
          className="text-[13px] text-cream/60 no-underline transition-colors hover:text-cream"
        >
          ← Back to site
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[620px] flex-1 px-6 py-12 md:py-16">
        <div
          className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--accent)" }}
        >
          Your account
        </div>

        {/* Identity */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {nav.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nav.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full object-cover shrink-0"
              />
            ) : (
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[24px] font-semibold text-[var(--color-base)]"
                style={{ background: "var(--accent)" }}
              >
                {nav.initial}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="m-0 truncate font-display text-[32px] font-normal leading-tight">
                {nav.name}
              </h1>
              <p className="m-0 truncate font-mono text-[12.5px] text-cream/50">
                {nav.email}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {hasAccess && tierInfo && (
              <span
                className="shrink-0 rounded-full px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{
                  backgroundColor: tierInfo.bg,
                  color: tierInfo.color,
                  border: `1px solid ${tierInfo.color}40`,
                }}
              >
                {tierInfo.title} Tier
              </span>
            )}
            {hasAccess && tierKey && tierKey !== "studio" && (
              <UpgradeTierModal currentTier={tierInfo?.title || tierKey} />
            )}
          </div>
        </div>

        {/* Access status & Tier info */}
        <div className="rounded-[14px] border border-cream/[0.12] bg-panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-display text-[19px] font-medium">
                Studio access
              </div>
              <p className="m-0 mt-1 text-[13.5px] leading-[1.6] text-cream/55">
                {hasAccess && tierInfo
                  ? redeemedOn
                    ? `Unlocked as ${tierInfo.title} tier with code on ${redeemedOn}.`
                    : `Unlocked as ${tierInfo.title} tier.`
                  : "Not unlocked yet — enter your access code to open the studio."}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-3 py-[6px] font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{
                color: hasAccess ? "var(--accent)" : "rgba(var(--ink-rgb),0.6)",
                border: hasAccess
                  ? "1px solid rgba(var(--accent-rgb),0.4)"
                  : "1px solid rgba(var(--ink-rgb),0.2)",
              }}
            >
              {hasAccess ? "Unlocked" : "Locked"}
            </span>
          </div>

          {hasAccess && profile?.redeemed_code && (
            <div className="mt-4 flex items-center justify-between border-t border-cream/[0.1] pt-4">
              <span className="text-[12.5px] text-cream/45">Redeemed Code</span>
              <span className="font-mono text-[12.5px] tracking-[0.14em] text-cream/75">
                {profile.redeemed_code}
              </span>
            </div>
          )}
        </div>

        {/* Monthly Downloads Quota Section */}
        {hasAccess && stats && (
          <div className="mt-6 rounded-[14px] border border-cream/[0.12] bg-panel p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="font-display text-[19px] font-medium">
                  Monthly Download Quota
                </div>
                <p className="m-0 mt-1 text-[13.5px] text-cream/55">
                  {stats.tier === "explorer"
                    ? `Explorer tier includes up to 25 downloads every month.`
                    : `${tierInfo?.title ?? "Your"} tier has unlimited model downloads.`}
                </p>
              </div>

              {stats.tier === "explorer" ? (
                <div className="text-right">
                  <span className="font-mono text-[22px] font-bold text-cream">
                    {stats.remaining}
                  </span>
                  <span className="font-mono text-[12px] text-cream/50"> / 25 left</span>
                </div>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">
                  Unlimited
                </span>
              )}
            </div>

            {/* Explorer Progress Bar */}
            {stats.tier === "explorer" && (
              <div className="mt-3">
                <div className="h-2.5 w-full rounded-full bg-cream/[0.08] overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (stats.monthlyCount / 25) * 100)}%`,
                      backgroundColor: stats.remaining! > 5 ? "var(--accent)" : "#e07a5f",
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-cream/45">
                  <span>{stats.monthlyCount} downloads used this month</span>
                  <span>Resets on {stats.resetDate}</span>
                </div>
              </div>
            )}

            {/* Recent Download History */}
            {stats.recentDownloads.length > 0 && (
              <div className="mt-6 border-t border-cream/[0.1] pt-4">
                <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cream/40">
                  Recent Downloads History
                </div>
                <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                  {stats.recentDownloads.map((dl) => (
                    <div
                      key={dl.id}
                      className="flex items-center justify-between rounded-lg bg-cream/[0.04] px-3.5 py-2 text-[12.5px]"
                    >
                      <span className="font-medium text-cream/80 capitalize">
                        {dl.citySlug.replace(/-/g, " ")} — {dl.locationSlug.replace(/-/g, " ")}
                      </span>
                      <span className="font-mono text-[10.5px] text-cream/40">
                        {new Date(dl.downloadedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-[14px]">
          <Link
            href="/studio"
            className="rounded-full bg-cream px-7 py-[13px] text-[14px] text-[var(--color-base)] no-underline transition-transform duration-300 hover:scale-[1.03]"
          >
            {hasAccess ? "Open the studio" : "Enter access code"}
          </Link>
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}

