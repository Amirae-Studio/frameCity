import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { studioCities } from "@/lib/studio";
import { toNavUser } from "@/lib/user";
import { StudioConfigurator } from "@/components/studio/StudioConfigurator";

export const metadata = {
  title: "Configure your tile — FrameCity",
};

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; location?: string }>;
}) {
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
  if (!profile?.has_access) redirect("/studio");

  const params = await searchParams;
  const city = studioCities.find((c) => c.slug === params.city && c.available);
  const location = city?.locations.find((l) => l.slug === params.location);
  if (!city || !location) redirect("/studio");

  return (
    <StudioConfigurator
      city={{ slug: city.slug, name: city.name }}
      location={location}
      user={toNavUser(user)}
    />
  );
}
