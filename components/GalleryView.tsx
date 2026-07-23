"use client";

import { useState } from "react";

export interface GalleryImage {
  name: string;
  url: string;
  created_at?: string | null;
}

export function GalleryView({ images }: { images: GalleryImage[] }) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!images || images.length === 0) {
    return (
      <div className="py-20 text-center text-cream/60">
        <p className="text-lg">No images found in the gallery bucket.</p>
      </div>
    );
  }

  return (
    <>
      {/* Standard CSS Masonry Grid */}
      <div className="columns-1 gap-4 sm:columns-2 md:columns-3">
        {images.map((img, idx) => (
          <div
            key={img.url + idx}
            className="group relative mb-4 inline-block w-full break-inside-avoid cursor-pointer overflow-hidden rounded-xl border border-cream/10 bg-cream/5 transition-transform duration-300 hover:scale-[1.02]"
            onClick={() => setSelectedImage(img.url)}
          >
            <img
              src={img.url}
              alt={img.name}
              loading="lazy"
              className="h-auto w-full rounded-xl object-cover transition-opacity duration-300 group-hover:opacity-90"
            />
          </div>
        ))}
      </div>

      {/* Full Size Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-cream/20 bg-base p-2">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Full preview"
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
