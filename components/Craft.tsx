"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { steps } from "@/lib/data";
import { Reveal } from "./Reveal";

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
  }
  ,];

export function Craft() {
  return (
    <section
      id="craft"
      className="mt-[70px] border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        <Reveal className="overflow-hidden rounded-[10px] border border-cream/10">
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
          <Reveal>
            {/* <div
              className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              How it&apos;s made
            </div> */}
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
              <Reveal
                key={step.no}
                delay={i}
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
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ImageSlideshow() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // fade out
      setVisible(false);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % showcaseSlides.length);
        // fade in
        setVisible(true);
      }, 650);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  const goTo = (index: number) => {
    if (index === current) return;
    setVisible(false);
    setTimeout(() => {
      setCurrent(index);
      setVisible(true);
    }, 650);
  };

  return (
    <section
      id="gallery"
      className="border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <Reveal>
        {/* <p
          className="mb-3 text-center font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
          style={{ color: "var(--accent)" }}
        >
          Our Models
        </p> */}
        <h2 className="m-0 mb-12 text-center font-display text-[34px] font-normal leading-[1.05] md:text-[46px]">
          Every city, captured.
        </h2>
      </Reveal>

      <div className="relative mx-auto max-w-[860px]">
        {/* Image container */}
        <Reveal className="overflow-hidden rounded-[14px] border border-cream/10">
          <div className="relative w-full aspect-[3/2]">
  <Image
    src={showcaseSlides[current].src}
    alt={showcaseSlides[current].alt}
    fill
    sizes="(max-width: 768px) 100vw, 860px"
    className="object-contain"
    style={{
      opacity: visible ? 1 : 0,
      transition: "opacity 650ms ease-in-out",
    }}
    priority
  />

  {/* Bottom gradient */}
  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
</div>
        </Reveal>

        {/* Dot navigation */}
        {/* <div className="mt-7 flex items-center justify-center gap-[10px]">
          {showcaseSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: i === current ? "28px" : "6px",
                height: "6px",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
                backgroundColor:
                  i === current ? "var(--accent)" : "rgba(255,255,255,0.18)",
                transition: "width 400ms ease, background-color 400ms ease",
                padding: 0,
              }}
            />
          ))}
        </div> */}
      </div>
    </section>
  );
}
