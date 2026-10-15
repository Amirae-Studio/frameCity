import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStudioCities, fetchStudioBuildings, checkPatronAccess } from "@/app/studio/actions";
import { toNavUser } from "@/lib/user";
import { StudioConfigurator } from "@/components/studio/StudioConfigurator";

export const metadata = {
  title: "Configure your tile — FrameCity",
};

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; city?: string; location?: string }>;
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
  const hasAccess = Boolean(profile?.has_access);

  const params = await searchParams;

  if (params.type === "patron") {
    const { isPatron, username } = await checkPatronAccess();
    if (!isPatron) redirect("/studio");

    return (
      <StudioConfigurator
        type="patron"
        city={{ slug: username, name: username }}
        location={{
          slug: username,
          name: "Custom Model",
          area: "Patron Exclusive",
          coords: "R2 Cloud Storage",
        }}
        user={toNavUser(user)}
        hasAccess={true}
        patronUsername={username}
      />
    );
  }

  if (params.type === "building") {
    const dbBuildings = await fetchStudioBuildings();
    const building = dbBuildings.find(
      (b) => b.slug === params.location && b.available
    );
    if (!building) redirect("/studio");

    return (
      <StudioConfigurator
        type="building"
        city={{ slug: building.city_slug, name: building.city_name }}
        location={{
          slug: building.slug,
          name: building.name,
          area: building.area || "",
          coords: building.coords || "",
        }}
        user={toNavUser(user)}
        hasAccess={hasAccess}
      />
    );
  }

  const dbCities = await fetchStudioCities();
  const city = dbCities.find((c) => c.slug === params.city && c.available);
  const location = city?.locations.find(
    (l) => l.slug === params.location && l.completed !== false
  );
  if (!city || !location) redirect("/studio");

  return (
    <StudioConfigurator
      type="city"
      city={{ slug: city.slug, name: city.name }}
      location={location}
      user={toNavUser(user)}
      hasAccess={hasAccess}
    />
  );
}
