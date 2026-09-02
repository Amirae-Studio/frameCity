"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { steps } from "@/lib/data";
import { Reveal } from "./Reveal";

const EASE = [0.22, 1, 0.36, 1] as const;

const showcaseSlides = [
  {
    src: "/london-preview.jpg",
    alt: "London architectural model detail",
    label: "London",
    sub: "City of London",
  },
  {
    src: "/f1.jpg",
    alt: "New York City skyline architectural model on a wooden desk",
    label: "New York City",
    sub: "Manhattan Skyline",
  },
  {
    src: "/f2.jpg",
    alt: "Paris Eiffel Tower architectural model on a wooden desk",
    label: "Paris",
    sub: "Eiffel Tower District",
  },
  {
    src: "/paris-frame.jpg",
    alt: "London architectural model detail",
    label: "London",
    sub: "City of London",
  },
  {
    src: "/makerworld.jpg",
    alt: "London architectural model detail",
    label: "London",
    sub: "City of London",
  },
  {
    src: "/f3.jpg",
    alt: "Close-up of Paris Eiffel Tower 3D printed model",
    label: "Paris",
    sub: "Up Close Detail",
  },
  {
    src: "/london-table.jpg",
    alt: "London architectural model detail",
    label: "London",
    sub: "City of London",
  },
  {
    src: "/f4.jpg",
    alt: "London architectural model detail",
    label: "London",
    sub: "City of London",
  },
  {
    src: "/f5.jpg",
    alt: "London architectural model detail",
    label: "London",
    sub: "City of London",
  },
];

export function Craft() {
  return (
    <section
      id="craft"
      className="mt-[70px] border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Image — cinematic clip (curtain) wipe */}
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

        {/* Text block */}
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

          {/* Steps — stagger fade-up */}
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
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % showcaseSlides.length);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  const goTo = (index: number) => {
    if (index === current) return;
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "6%" : "-6%",
      opacity: 0,
      scale: 1.03,
    }),
    center: {
      x: "0%",
      opacity: 1,
      scale: 1,
      transition: { duration: 0.75, ease: EASE },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-4%" : "4%",
      opacity: 0,
      scale: 0.98,
      transition: { duration: 0.55, ease: EASE },
    }),
  };

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

      <div className="relative mx-auto max-w-[860px]">
        {/* Image container with AnimatePresence cross-fade + slide */}
        <Reveal variant="scale" className="overflow-hidden rounded-[14px] border border-cream/10">
          <div className="relative w-full aspect-[3/2] bg-[#0b0a09]">
            <AnimatePresence custom={direction} mode="sync">
              <motion.div
                key={current}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0"
              >
                <Image
                  src={showcaseSlides[current].src}
                  alt={showcaseSlides[current].alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 860px"
                  className="object-contain"
                  priority
                />
              </motion.div>
            </AnimatePresence>

            {/* Bottom gradient */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent z-10" />

            {/* Slide label */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`label-${current}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="absolute bottom-5 left-6 z-20"
              >
                <p className="m-0 font-display text-[18px] font-medium text-cream">
                  {showcaseSlides[current].label}
                </p>
                <p className="m-0 font-mono text-[10px] uppercase tracking-widest text-cream/55">
                  {showcaseSlides[current].sub}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>

        
      </div>
    </section>
  );
}
