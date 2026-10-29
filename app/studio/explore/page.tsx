import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toNavUser } from "@/lib/user";
import { ExploreWorld } from "@/components/explore/ExploreWorld";

export const metadata = {
  title: "Explore World — FrameCity Studio",
};

export default async function ExplorePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio/explore");

  const { data: profile } = await supabase
    .from("profiles")
    .select("has_access")
    .eq("id", user.id)
    .single();

  return <ExploreWorld user={toNavUser(user)} hasAccess={Boolean(profile?.has_access)} />;
}
