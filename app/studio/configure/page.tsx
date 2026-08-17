import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchStudioCities, fetchStudioBuildings } from "@/app/studio/actions";
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
  if (!profile?.has_access) redirect("/studio");

  const params = await searchParams;

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
    />
  );
}
