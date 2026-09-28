import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { toNavUser } from "@/lib/user";
import { GalleryView, GalleryImage } from "@/components/GalleryView";
import { listR2Objects, getR2PublicUrl, R2_BUCKET } from "@/lib/r2";

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|avif|svg|bmp|tiff|heic)$/i;

async function fetchGalleryImagesFromR2(): Promise<GalleryImage[]> {
  const objects = await listR2Objects(R2_BUCKET.gallery);

  return objects
    .filter(
      (obj) =>
        IMAGE_EXTENSIONS.test(obj.key) &&
        !obj.key.startsWith(".") &&
        !obj.key.startsWith("amiraeimages/") &&
        !obj.key.startsWith("brand/") &&
        !obj.key.startsWith("videos/") &&
        !obj.key.includes("/") // Only root gallery images
    )
    .map((obj) => ({
      name: obj.key.split("/").pop() ?? obj.key,
      url: getR2PublicUrl(obj.key),
      created_at: undefined,
    }));
}


export default async function GalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const images = await fetchGalleryImagesFromR2();

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
