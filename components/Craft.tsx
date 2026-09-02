"use client";

import Image from "next/image";
import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { steps } from "@/lib/data";
import { Reveal } from "./Reveal";
import DriftWall, { DriftWallItem } from "./ui/DriftWall";

const EASE = [0.22, 1, 0.36, 1] as const;

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

export function Craft() {
  return (
    <section
      id="craft"
      className="mt-[70px] border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        <Reveal
          variant="clip"
          className="overflow-hidden rounded-[10px] border border-cream/10"
        >
          <div className="relative h-[360px] w-full md:h-[520px]">
            <Image
              src="/london-table.jpg"
              alt="Close detail of the London model"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>

        <div>
          <Reveal variant="fade-right">
            <h2 className="m-0 mb-5 font-display text-[34px] font-normal leading-[1.05] md:text-[46px]">
              Modelled by hand,
              <br />
              not machine-generated.
            </h2>
            <p className="m-0 mb-[30px] max-w-[440px] text-[15px] leading-[1.7] text-cream/[0.66]">
              Most city models are auto-generated straight from map data — and it
              shows. We use the data only as a reference, then rebuild most
              buildings by hand so every piece prints cleanly and actually looks
              good on your shelf.
            </p>
          </Reveal>

          <div className="flex flex-col">
            {steps.map((step, i) => (
              <motion.div
                key={step.no}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: EASE }}
                className="flex gap-[22px] border-t border-cream/[0.12] py-6"
              >
                <span
                  className="pt-[3px] font-mono text-[13px]"
                  style={{ color: "var(--accent)" }}
                >
                  {step.no}
                </span>
                <div>
                  <div className="mb-[7px] font-display text-[20px] font-medium">
                    {step.title}
                  </div>
                  <p className="m-0 text-[14.5px] leading-[1.65] text-cream/60">
                    {step.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

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