"use client";

import dynamic from "next/dynamic";
import { motion, useScroll, useTransform, type Variants } from "framer-motion";
import { useRef } from "react";
import LightRays from "./ui/LightRays";
import { Button } from "./ui/Button";

const HeroModelScene = dynamic(() => import("./HeroModelScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/40 animate-pulse">
        Loading 3D Skyline…
      </span>
    </div>
  ),
});

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, delay: i, ease: [0.16, 1, 0.3, 1] },
  }),
};

// Continuous floating loop for the 3D model block
const floatAnimation = {
  animate: {
    y: [0, -12, 0],
    rotateX: [0, 1.5, 0],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section
      ref={sectionRef}
      className="force-dark relative flex flex-col justify-between overflow-hidden border-b border-cream/[0.08] bg-base md:block md:min-h-[640px]"
    >
      {/* Background Ambient Glow */}
      <div className="absolute -left-[10%] top-[-10%] h-[350px] w-[350px] rounded-full bg-white/5 blur-[120px] pointer-events-none" />

      {/* Light Rays Background Canvas */}
      <div className="absolute inset-0 z-[0] pointer-events-none flex items-center justify-center opacity-80 transition-opacity duration-700 hover:opacity-100">
        <LightRays
          raysOrigin="top-right"
          raysColor="#faf9f5"
          raysSpeed={1.2}
          lightSpread={2.8}
          rayLength={4.5}
          pulsating={true}
          fadeDistance={3.5}
          saturation={0.4}
          followMouse={true}
          mouseInfluence={0.25}
          distortion={0.12}
          noiseAmount={0.015}
        />
      </div>

      {/* Main Content Area */}
      <motion.div
        style={{ y: textY, opacity: contentOpacity }}
        className="relative z-[2] w-full max-w-[640px] px-6 pt-12 pb-6 sm:px-10 md:px-[60px] md:pt-[72px] md:pb-[72px] pointer-events-auto"
      >
        

        {/* Heading */}
        <motion.h1
          custom={0.08}
          variants={rise}
          initial="hidden"
          animate="show"
          className="m-0 font-serif text-[36px] sm:text-[52px] md:text-[68px] font-normal leading-[1.08] tracking-[-0.025em]"
        >
          <span className="inline bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent drop-shadow-sm">
            Sculpting the city{" "}
          </span>
          <br className="hidden sm:inline" />
          <span className="inline font-serif italic bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            that shaped you.
          </span>
        </motion.h1>

        {/* Subtitle Paragraph */}
        <motion.p
          custom={0.14}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-4 sm:mt-5 max-w-[420px] text-[14px] sm:text-[15px] md:text-[16px] leading-[1.65] text-cream/75 font-light"
        >
          Detailed 3D cityscapes crafted into refined framed art for your space. We bring your favorite locations to life through precision 1:1000 scale architectural relief models that turn memory into lasting gallery-grade art.
        </motion.p>

        {/* Interactive CTA Buttons */}
        <motion.div
          custom={0.2}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-7 md:mt-9 flex flex-col sm:flex-row gap-3.5 sm:gap-4"
        >
          <Button
            variant="primary"
            href="https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto text-center justify-center shadow-lg shadow-white/5 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
          >
            Back now
          </Button>

          <Button
            variant="secondary"
            href="#film"
            className="w-full sm:w-auto text-center justify-center gap-2.5 backdrop-blur-md hover:bg-cream/10 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <span className="inline-block h-0 w-0 border-b-[4px] border-l-[6px] border-t-[4px] border-b-transparent border-l-cream border-t-transparent" />
            Watch the film
          </Button>
        </motion.div>
      </motion.div>

      {/* Floating 3D Model Scene Wrapper */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-[1] h-[300px] w-full flex items-center justify-center opacity-95 md:absolute md:right-4 md:top-1/2 md:-translate-y-1/2 md:h-[90%] md:w-[52%] lg:right-10"
      >
        <motion.div
          variants={floatAnimation}
          animate="animate"
          className="h-full w-full flex items-center justify-center"
        >
          <HeroModelScene />
        </motion.div>
      </motion.div>
    </section>
  );
}