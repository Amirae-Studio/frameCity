import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Marquee } from "@/components/Marquee";
import { Film } from "@/components/Film";
import { Craft, ImageSlideshow } from "@/components/Craft";
import { ModelShowcase } from "@/components/ModelShowcase";
import { Milestones } from "@/components/Milestones";
import { Configurator } from "@/components/Configurator";
import { Support } from "@/components/Support";
import { FAQ } from "@/components/FAQ";
import { Footer } from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { toNavUser } from "@/lib/user";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative mx-auto max-w-[1440px]">
      <Nav initialUser={toNavUser(user)} />
      <main>
        <Hero />
        <Marquee />
        <Film />
        {/* <Collection /> */}
        <Craft />
        <ImageSlideshow />
        <ModelShowcase />
        <Milestones />
        <Configurator />
        <Support />
        <FAQ />
      </main>
      <Footer />
      {/* <AccentControl /> */}
    </div>
  );
}
