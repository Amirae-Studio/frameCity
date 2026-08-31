"use client";

import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { CTA_LABEL } from "@/lib/data";

const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, delay: i, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  return (
    <section className="force-dark relative min-h-[620px] overflow-hidden border-b border-cream/[0.09] bg-base md:min-h-[790px]">
      {/* Backdrop image */}
      <motion.div
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute right-0 top-0 h-full w-full md:w-[62%]"
      >
        <Image
          src="/hero.jpg"
          alt="FrameCity framed city models on a gallery wall"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 62vw"
          className="object-cover object-center"
        />
      </motion.div>

      {/* Legibility gradient */}
      <div className="hero-scrim absolute inset-0" />

      <div className="relative z-[2] max-w-[620px] px-6 pb-20 pt-[92px] md:px-[52px] md:pb-20 md:pt-[118px]">
        <motion.div
          custom={0}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mb-6 font-mono text-[11px] font-bold uppercase tracking-[0.32em] md:mb-7"
          style={{ color: "var(--accent)" }}
        >
          {/* The world&apos;s skylines · framed */}
        </motion.div>

        <motion.h1
          custom={0.05}
          variants={rise}
          initial="hidden"
          animate="show"
          className="m-0 font-display text-[54px] font-normal leading-[0.98] tracking-[-0.01em] text-cream md:text-[82px]"
        >
          A quiet portrait
          <br />
          of the place
          <br />
          <span className="font-medium italic">that made you.</span>
        </motion.h1>

        <motion.p
          custom={0.12}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-[30px] max-w-[440px] text-[16px] leading-[1.7] text-cream/[0.68]"
        >
          We translate real cities into refined 3D models — soft monochrome,
          solid wood, made to sit quietly on a shelf or a wall for years.
        </motion.p>

        <motion.div
          custom={0.18}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-9 flex flex-wrap gap-[14px]"
        >
          <a
            href="/studio"
            className="rounded-full bg-cream px-[30px] py-[15px] text-[14px] text-[var(--color-base)] no-underline transition-transform duration-300 hover:scale-[1.03]"
          >
            {CTA_LABEL}
          </a>
          <a
            href="#film"
            className="inline-flex items-center gap-[10px] rounded-full border border-cream/[0.28] bg-transparent px-[26px] py-[15px] text-[14px] text-cream no-underline transition-colors duration-300 hover:border-cream/60"
          >
            <span className="inline-block h-0 w-0 border-b-[5px] border-l-[7px] border-t-[5px] border-b-transparent border-l-cream border-t-transparent" />
            Watch the film
          </a>
        </motion.div>
      </div>
    </section>
  );
}
