"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Reveal } from "./Reveal";

type Milestone = {
  id: string;
  goal: string;
  amount: number;
  title: string;
  description: string;
  status: "Unlocked" | "In Progress" | "Locked";
  image: string;
  delivery: string;
  included: string;
};

const milestones: Milestone[] = [
  {
    id: "m1",
    goal: "USD 5,000",
    amount: 5000,
    title: "Community City Vote",
    description:
      "We open the floor. Backers vote on the next wave of cities to hand-model, and the winners get added to the library — free for everyone at Architect tier and above.",
    status: "Unlocked",
    image:
      "/sl1.webp",
    delivery: "2026/09/30 UTC",
    included: "· All Stretch Goals",
  },
  {
    id: "m2",
    goal: "USD 10,000",
    amount: 10000,
    title: "Print Individual Buildings",
    description:
      "Pull any single landmark out of its district and print it on its own. Want just the tower, just the cathedral, or your office block? Every building stands alone.",
    status: "Unlocked",
    image:
      "/sl2.webp",
    delivery: "2026/09/30 UTC",
    included: "· All Stretch Goals",
  },
  {
    id: "m3",
    goal: "USD 15,000",
    amount: 15000,
    title: "Full Color Control",
    description:
      "Color every layer independently — water, trees, grass, terrain, and the buildings themselves. Print in mono or bring your whole city to life, section by section.",
    status: "Unlocked",
    image:
      "/sl3.webp",
    delivery: "2026/09/30 UTC",
    included: "· All Stretch Goals",
  },
  {
    id: "m4",
    goal: "USD 20,000",
    amount: 20000,
    title: "Magnetic Skyline",
    description:
      "Integrates magnet sockets into the bases and backplates to easily mount, swap, and modularly display skylines on walls or boards.",
    status: "In Progress",
    image:
      "/sl4.webp",
    delivery: "2026/09/30 UTC",
    included: "· All Stretch Goals",
  },
  {
    id: "m5",
    goal: "USD 25,000",
    amount: 25000,
    title: "Snap-Together Districts",
    description:
      "Unlock modular printing: build one district, or snap multiple sections together into a sprawling cityscape. Print a single block or the whole skyline.",
    status: "Locked",
    image:
      "/sl5.webp",
    delivery: "2026/10/15 UTC",
    included: "· All Stretch Goals",
  },
  {
    id: "m6",
    goal: "USD 40,000",
    amount: 40000,
    title: "Time Machine: Skylines Through Eras",
    description:
      "We hand-model historical versions of iconic cities — Old New York, pre-war skylines, and more — so you can set your model to any era across decades.",
    status: "Locked",
    image:
      "/sl6.webp",
    delivery: "2026/10/30 UTC",
    included: "· All Stretch Goals",
  },
  {
    id: "m7",
    goal: "USD 60,000",
    amount: 60000,
    title: "The World Expansion",
    description:
      "A massive global expansion pack adding iconic landmarks and skylines from around the world.",
    status: "Locked",
    image:
      "/sl7.webp",
    delivery: "2026/11/15 UTC",
    included: "· All Stretch Goals",
  },
];

export function Milestones() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Maximum slide index before reaching the rightmost edge cleanly without empty center space
  // With 7 total cards and ~2.2 visible at once, index 4 (or 5) is the max before looping
  const maxSlideIndex = milestones.length - 2;

  const handleNext = () => {
    setActiveIndex((prev) => (prev >= maxSlideIndex ? 0 : prev + 1));
  };

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? maxSlideIndex : prev - 1));
  };

  // Auto-slide loop every 5 seconds
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      handleNext();
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused, maxSlideIndex]);

  return (
    <section
      id="milestones"
      className="warm-radial border-t border-cream/[0.09] py-20 md:py-28 w-full overflow-hidden px-4 md:px-12"
    >
      <div className="w-full max-w-[1440px] mx-auto">
        {/* Full-Width Section Header */}
        <Reveal className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            
            <h2 className="font-display text-3xl md:text-5xl font-normal text-cream m-0 leading-tight">
              Project Milestones
            </h2>
          </div>

          <p className="text-xs md:text-sm text-cream/60 font-mono max-w-md m-0">
            Hover over any goal image to inspect reward specs, unlocked features &amp; estimated delivery.
          </p>
        </Reveal>

        {/* Slider Track Wrapper with Generous Side Padding so Arrows NEVER Touch Images */}
        <Reveal className="relative w-full px-8 sm:px-14 md:px-20">
          {/* Theme-Aware Floating Left Arrow Button (Spaced Out & Accent Colored) */}
          <button
            onClick={handlePrev}
            aria-label="Previous Goal"
            className="absolute left-0 sm:left-1 md:left-2 top-[35%] -translate-y-1/2 z-40 w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/[#1a1714]/95 backdrop-blur-md border border-[var(--accent)]/40 text-[var(--accent)] flex items-center justify-center shadow-2xl hover:scale-110 hover:bg-[var(--accent)] hover:text-black transition-all cursor-pointer"
          >
            <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Theme-Aware Floating Right Arrow Button (Spaced Out & Accent Colored) */}
          <button
            onClick={handleNext}
            aria-label="Next Goal"
            className="absolute right-0 sm:right-1 md:right-2 top-[35%] -translate-y-1/2 z-40 w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/[#1a1714]/95 backdrop-blur-md border border-[var(--accent)]/40 text-[var(--accent)] flex items-center justify-center shadow-2xl hover:scale-110 hover:bg-[var(--accent)] hover:text-black transition-all cursor-pointer"
          >
            <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Animated Horizontal Cards Track */}
          <div
            ref={trackRef}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            className="relative overflow-hidden pt-4 pb-8 w-full"
          >
            <motion.div
              animate={{ x: `calc(-${activeIndex * 510}px)` }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="flex gap-8 items-stretch w-max"
            >
              {milestones.map((item, idx) => {
                const isActive = idx === activeIndex;
                const isHovered = item.id === hoveredId;
                const isUnlocked = item.status === "Unlocked";
                const isInProgress = item.status === "In Progress";

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setActiveIndex(Math.min(idx, maxSlideIndex))}
                    className="w-[360px] sm:w-[450px] md:w-[500px] flex-shrink-0 relative flex flex-col items-center group cursor-pointer"
                  >
                    {/* Image Card Frame with generous height so hover content is 100% visible */}
                    <div
                      className={`relative w-full min-h-[250px] md:min-h-[280px] overflow-hidden rounded-2xl border transition-all duration-500 shadow-2xl bg-black ${
                        isActive
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 scale-[1.01]"
                          : "border-cream/15 hover:border-cream/40"
                      }`}
                    >
                      {/* Full Stretch Goal Banner Artwork */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-fit transition-transform duration-700 group-hover:scale-105"
                      />

                      {/* Theme-Aware Hover Overlay Modal (Shows FULL contents on hover) */}
                      <AnimatePresence>
                        {isHovered && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 z-30 p-5 md:p-6 flex flex-col justify-between bg-panel/98 backdrop-blur-2xl border-2 border-[var(--accent)] rounded-2xl text-cream shadow-2xl overflow-y-auto"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span
                                  className="font-mono text-xs font-bold uppercase tracking-wider"
                                  style={{ color: "var(--accent)" }}
                                >
                                  {item.goal}
                                </span>
                                <span
                                  className={`text-[11px] font-mono font-bold px-3 py-0.5 rounded-full uppercase ${
                                    isUnlocked
                                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                      : isInProgress
                                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                      : "bg-cream/10 text-cream/60"
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>

                              <h3 className="font-display text-xl md:text-2xl font-medium text-cream mb-2 leading-snug">
                                {item.title}
                              </h3>

                              <p className="text-xs md:text-sm text-cream/90 leading-relaxed font-sans m-0">
                                {item.description}
                              </p>
                            </div>

                            <div className="pt-3 border-t border-cream/15 font-mono text-[11.5px] space-y-1.5 mt-3">
                              <div className="flex justify-between">
                                <span className="text-cream/60">Est. Delivery:</span>
                                <span className="font-bold text-cream">{item.delivery}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-cream/60">Includes:</span>
                                <span
                                  className="font-bold"
                                  style={{ color: "var(--accent)" }}
                                >
                                  {item.included}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Downward Pointer Triangle */}
                    <div
                      className={`w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-t-[9px] my-2 transition-colors duration-300 ${
                        isActive || isHovered
                          ? "border-t-[var(--accent)]"
                          : "border-t-cream/20"
                      }`}
                    />

                    {/* Continuous Horizontal Timeline Line above Tick Nodes */}
                    <div className="relative w-full flex items-center justify-center my-1">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-cream/15" />
                      <div
                        className={`absolute left-0 top-1/2 -translate-y-1/2 h-[3px] transition-all duration-500 ${
                          isUnlocked ? "bg-emerald-500 w-full" : isInProgress ? "bg-amber-500 w-1/2" : "bg-transparent w-0"
                        }`}
                      />
                    </div>

                    {/* Timeline Node Pin & Status Label */}
                    <div className="flex flex-col items-center mt-2">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center z-10 transition-all duration-300 shadow-xl ${
                          isUnlocked
                            ? "bg-emerald-500/20 text-emerald-400 border-2 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                            : isInProgress
                            ? "bg-amber-500/20 text-amber-400 border-2 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse"
                            : "bg-panel text-cream/40 border border-cream/20"
                        }`}
                      >
                        {isUnlocked && (
                          <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                        {isInProgress && (
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: "var(--accent)" }}
                          />
                        )}
                        {item.status === "Locked" && (
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                          </svg>
                        )}
                      </div>

                      <span
                        className={`mt-2 font-mono text-xs font-bold ${
                          isUnlocked
                            ? "text-emerald-400"
                            : isInProgress
                            ? "text-amber-400"
                            : "text-cream/40"
                        }`}
                      >
                        {item.goal} {item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
