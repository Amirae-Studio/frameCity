"use client";

import { useMemo, useState, useEffect } from "react";
import { Reveal } from "./Reveal";
import DriftWall, { DriftWallItem } from "./ui/DriftWall";

const showcaseSlides = [
  { src: "/london-preview.jpg", label: "London", sub: "City of London" },
  { src: "/f1.jpg", label: "New York City", sub: "Manhattan Skyline" },
  { src: "/f2.jpg", label: "Paris", sub: "Eiffel Tower District" },
  { src: "/paris-frame.jpg", label: "London", sub: "City of London" },
  { src: "/makerworld.jpg", label: "London", sub: "City of London" },
  { src: "/f3.jpg", label: "Paris", sub: "Up Close Detail" },
  { src: "/london-table.jpg", label: "London", sub: "City of London" },
  { src: "/f4.jpg", label: "London", sub: "City of London" },
  { src: "/f5.jpg", label: "London", sub: "City of London" },
  { src: "/london-preview.jpg", label: "London", sub: "Historic Hub" },
  { src: "/f1.jpg", label: "New York City", sub: "Downtown" },
  { src: "/f2.jpg", label: "Paris", sub: "Seine View" },
  { src: "/paris-frame.jpg", label: "London", sub: "Westminster" },
  { src: "/f3.jpg", label: "Paris", sub: "Architecture Detail" },
  { src: "/london-table.jpg", label: "London", sub: "Overview" },
  { src: "/f5.jpg", label: "London", sub: "Night View" },
];

export function ImageSlideshow() {
  // Screen size breakpoint manage panna state
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const updateColumns = () => {
      // Mobile screens (< 640px) la 1 column, Desktop la 4 columns
      if (window.innerWidth < 640) {
        setColumns(1);
      } else if (window.innerWidth < 1024) {
        setColumns(2);
      } else {
        setColumns(4);
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const driftItems = useMemo<DriftWallItem[]>(() => {
    return showcaseSlides.map((slide) => ({
      image: slide.src,
      title: `${slide.label} - ${slide.sub}`,
    }));
  }, []);

  return (
    <section
      id="gallery"
      className="border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <Reveal>
        <h2 className="m-0 mb-12 text-center font-display text-[34px] font-normal leading-[1.05] md:text-[46px]">
          Every city, captured.
        </h2>
      </Reveal>

      <Reveal variant="scale" className="overflow-hidden rounded-[14px] border border-cream/15">
        <div className="relative h-[480px] sm:h-[550px] md:h-[680px] w-full bg-cream/[0.02]">
          <DriftWall
            items={driftItems}
            columns={columns}         
            tileWidth={columns === 1 ? 280 : 240} 
            tileHeight={columns === 1 ? 180 : 150}
            gap={columns === 1 ? 12 : 18}
            speed={32}
            pauseOnHover={true}
            tilt={columns === 1 ? 0 : 8}         
            turn={columns === 1 ? 0 : -6}
            parallax={0.5}
            dim={0.95}
            fade={0.2}
          />
        </div>
      </Reveal>
    </section>
  );
}