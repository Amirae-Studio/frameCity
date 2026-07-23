import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { toNavUser } from "@/lib/user";
import { GalleryView, GalleryImage } from "@/components/GalleryView";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

async function fetchGalleryImagesFromBucket(): Promise<GalleryImage[]> {
  const supabaseAdmin = getAdminSupabase();
  const images: GalleryImage[] = [];

  async function listFolder(folderPath: string = "") {
    const { data: files, error } = await supabaseAdmin.storage
      .from("gallery")
      .list(folderPath, {
        limit: 100,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      console.error(`Error listing folder "${folderPath}" in gallery bucket:`, error);
      return;
    }

    if (!files) return;

    for (const file of files) {
      if (!file.name || file.name.startsWith(".")) continue;

      const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;

      // Check if it's a subfolder or file
      if (!file.id && (!file.metadata || Object.keys(file.metadata).length === 0)) {
        await listFolder(fullPath);
      } else {
        const { data } = supabaseAdmin.storage
          .from("gallery")
          .getPublicUrl(fullPath);

        images.push({
          name: file.name,
          url: data.publicUrl,
          created_at: file.created_at,
        });
      }
    }
  }

  await listFolder("");
  return images;
}

export default async function GalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const images = await fetchGalleryImagesFromBucket();

  return (
    <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col justify-between">
      <Nav initialUser={toNavUser(user)} />

      <main className="flex-1 px-6 py-10 md:px-[52px]">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-medium text-cream md:text-4xl">
            Gallery
          </h1>
          
        </div>

        <GalleryView images={images} />
      </main>

      <Footer />
    </div>
  );
}
