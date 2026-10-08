import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { AccessGate } from "@/components/AccessGate";
import { SignOutButton } from "@/components/SignOutButton";
import { StudioPicker } from "@/components/studio/StudioPicker";

import { fetchStudioCities, fetchStudioBuildings } from "@/app/studio/actions";

export const metadata = {
  title: "The Studio — FrameCity",
};

export default async function StudioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio"); // middleware backstop

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access")
    .eq("id", user.id)
    .single();

  const email = user.email ?? "your account";
  const hasAccess = Boolean(profile?.has_access);
  const cities = await fetchStudioCities();
  const buildings = await fetchStudioBuildings();

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="flex items-center justify-between border-b border-cream/[0.09] px-6 py-[18px] md:px-[52px]">
        <Link href="/" className="inline-flex">
          <Logo className="theme-logo h-8" priority />
        </Link>
        <div className="flex items-center gap-5">
          <span className="hidden font-mono text-[11px] text-cream/40 sm:inline">
            {email}
          </span>
          <SignOutButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <StudioPicker
          initialCities={cities}
          initialBuildings={buildings}
          hasAccess={hasAccess}
          email={email}
        />
      </main>
    </div>
  );
}
