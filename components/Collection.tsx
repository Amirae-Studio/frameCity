"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cities } from "@/lib/data";
import { useTheme } from "@/lib/theme";
import { Reveal } from "./Reveal";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Collection() {
  const { showPrices } = useTheme();

  return (
    <section id="collection" className="px-6 pb-10 pt-[90px] md:px-[52px] md:pt-[110px]">
      {/* Section header — clip wipe + fade-right pair */}
      <div className="mb-[52px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <Reveal variant="fade-up">
            <div
              className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              The Collection · {cities.length} cities &amp; growing
            </div>
          </Reveal>
          <Reveal variant="fade-left" delay={0.5}>
            <h2 className="m-0 max-w-[600px] font-display text-[38px] font-normal leading-[1.02] md:text-[52px]">
              A living library of cities — and we add more every month.
            </h2>
          </Reveal>
        </div>
        <Reveal variant="fade-right" delay={1}>
          <p className="mb-[6px] max-w-[320px] text-[14.5px] leading-[1.7] text-cream/60">
            {cities.length} cities today, cast to the same scale and finish. New
            skylines join the library all the time — tell us which one should be
            next.
          </p>
        </Reveal>
      </div>

      {/* City card grid — scale+fade stagger */}
      <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3 lg:grid-cols-4">
        {cities.map((city, i) => (
          <motion.a
            key={city.name}
            href="#create"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{
              duration: 0.65,
              delay: (i % 4) * 0.07,
              ease: EASE,
            }}
            whileHover={{ y: -8, scale: 1.025, transition: { duration: 0.25, ease: EASE } }}
            className="group block overflow-hidden rounded-lg border border-cream/10 bg-panel no-underline"
          >
            <div className="relative aspect-square overflow-hidden bg-panel-2">
              {city.img ? (
                <Image
                  src={city.img}
                  alt={`${city.name} 3D city model`}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                />
              ) : (
                <div className="stripe-fill absolute inset-0 flex items-center justify-center">
                  <span className="rounded border border-cream/[0.16] px-[11px] py-[7px] font-mono text-[9.5px] font-bold uppercase tracking-[0.24em] text-cream/[0.32]">
                    {city.name} · model
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-baseline justify-between px-[18px] pb-[18px] pt-4">
              <span className="font-display text-[21px] font-medium">
                {city.name}
              </span>
            </div>
          </motion.a>
        ))}

        {/* "Your city next?" card */}
        <Reveal
          as="div"
          variant="scale"
          delay={cities.length % 4 * 0.7}
          className="flex flex-col items-center justify-center gap-[14px] rounded-lg border border-dashed border-cream/[0.28] p-7 text-center"
        >
          <a
            href="#create"
            className="flex min-h-[200px] flex-col items-center justify-center gap-[14px] no-underline"
          >
            <motion.span
              whileHover={{ rotate: 90, scale: 1.15 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cream/30 text-[22px] font-light leading-none"
              style={{ color: "var(--accent)" }}
            >
              +
            </motion.span>
            <span className="font-display text-[22px] font-medium">
              Your city next?
            </span>
            <span className="max-w-[180px] text-[12.5px] leading-[1.55] text-cream/55">
              Request a skyline and we&apos;ll model it into the library.
            </span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
