import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toNavUser } from "@/lib/user";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = {
  title: "Your account — FrameCity",
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
    .select("has_access, redeemed_code, redeemed_at")
    .eq("id", user.id)
    .single();

  const hasAccess = !!profile?.has_access;
  const redeemedOn = profile?.redeemed_at
    ? new Date(profile.redeemed_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

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

      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 py-16 md:py-20">
        <div
          className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--accent)" }}
        >
          Your account
        </div>

        {/* Identity */}
        <div className="mb-5 flex items-center gap-4">
          {nav.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nav.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-16 w-16 items-center justify-center rounded-full text-[24px] font-semibold text-[var(--color-base)]"
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

        {/* Access status */}
        <div className="rounded-[14px] border border-cream/[0.12] bg-panel p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-display text-[19px] font-medium">
                Studio access
              </div>
              <p className="m-0 mt-1 text-[13.5px] leading-[1.6] text-cream/55">
                {hasAccess
                  ? redeemedOn
                    ? `Unlocked with a MakerWorld code on ${redeemedOn}.`
                    : "Unlocked with a MakerWorld code."
                  : "Not unlocked yet — enter your MakerWorld access code to open the studio."}
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
              <span className="text-[12.5px] text-cream/45">Code</span>
              <span className="font-mono text-[12.5px] tracking-[0.14em] text-cream/75">
                {profile.redeemed_code}
              </span>
            </div>
          )}
        </div>

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
