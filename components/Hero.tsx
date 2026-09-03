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
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/40">
        Loading 3D Skyline…
      </span>
    </div>
  ),
});

const rise: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, delay: i, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section
      ref={sectionRef}
      className="force-dark relative flex flex-col justify-between overflow-hidden border-b border-cream/[0.09] bg-base md:block md:min-h-[580px]"
    >
      {/* Background LightRays Canvas */}
      <div className="absolute inset-0 z-[0] pointer-events-none flex items-center justify-center">
        <LightRays
          raysOrigin="top-right" 
          raysColor="#faf9f5"     
          raysSpeed={1.2}
          lightSpread={3.0}       
          rayLength={5.0}         
          pulsating={true}
          fadeDistance={3.0}      
          saturation={0.5}
          followMouse={true}
          mouseInfluence={0.2}
          distortion={0.1}
          noiseAmount={0.02}
        />
      </div>

      {/* Main Text Content Block */}
      <motion.div
        style={{ y: textY, opacity: contentOpacity }}
        className="relative z-[2] w-full max-w-[620px] px-5 pt-10 pb-4 sm:px-8 md:px-[52px] md:pt-[60px] md:pb-[60px] pointer-events-auto"
      >
        {/* Responsive Heading */}
        <motion.h1
          custom={0.05}
          variants={rise}
          initial="hidden"
          animate="show"
          className="m-0 font-serif text-[32px] sm:text-[48px] md:text-[64px] font-normal leading-[1.1] md:leading-[1.05] tracking-[-0.02em]"
        >
          <span className="inline bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Sculpting the city{" "}
          </span>
          <br className="hidden sm:inline" />
          <span className="inline font-serif italic bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            that shaped you.
          </span>
        </motion.h1>

        {/* Responsive Subtitle */}
        <motion.p
          custom={0.12}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-3 sm:mt-4 md:mt-6 max-w-[380px] text-[14px] sm:text-[15px] md:text-[16px] leading-[1.6] text-cream/80"
        >
          Detailed 3D cityscapes crafted into refined framed art for your space. We bring your favorite locations to life through precision 1:1000 scale architectural relief models that turn memory into lasting gallery-grade art.
        </motion.p>

        {/* Responsive Buttons */}
        <motion.div
          custom={0.18}
          variants={rise}
          initial="hidden"
          animate="show"
          className="mt-6 md:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-[14px]"
        >
          <Button
            variant="primary"
            href="https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto text-center justify-center"
          >
            Back now
          </Button>

          <Button 
            variant="secondary" 
            href="#film" 
            className="w-full sm:w-auto text-center justify-center gap-[10px]"
          >
            <span className="inline-block h-0 w-0 border-b-[4px] border-l-[6px] border-t-[4px] border-b-transparent border-l-cream border-t-transparent" />
            Watch the film
          </Button>
        </motion.div>
      </motion.div>

      {/* Responsive 3D Model Canvas */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[1] h-[260px] w-full flex items-center justify-center opacity-90 md:absolute md:right-0 md:top-1/3 md:-translate-y-1/2 md:h-[85%] md:w-[54%] md:opacity-100 md:right-6 lg:right-12"
      >
        <HeroModelScene />
      </motion.div>
    </section>
  );
}