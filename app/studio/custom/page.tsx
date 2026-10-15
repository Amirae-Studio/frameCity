import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPatronAccess } from "@/app/studio/actions";
import { toNavUser } from "@/lib/user";
import { StudioConfigurator } from "@/components/studio/StudioConfigurator";

export const metadata = {
  title: "Custom Model - FrameCity Studio",
};

export default async function PatronCustomPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio");

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