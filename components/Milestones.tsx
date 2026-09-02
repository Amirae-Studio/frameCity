"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Reveal } from "./Reveal";
import { createClient } from "@/lib/supabase/client";

type Milestone = {
  id: string;
  goal: string;
  amount: number;
  title: string;
  description: string;
  status: "Unlocked" | "In Progress" | "Locked";
  delivery: string;
  included: string;
};

// Hardcoded initial configuration, dynamic calculation will override status
const DEFAULT_MILESTONES: Milestone[] = [
  {
    id: "m1",
    goal: "USD 5,000",
    amount: 5000,
    title: "Community City Vote",
    description:
      "We open the floor. Backers vote on the next wave of cities to hand-model, and the winners get added to the library — free for everyone at Architect tier and above.",
    status: "Locked",
    delivery: "2026/09/30 UTC",
    included: "All Stretch Goals",
  },
  {
    id: "m2",
    goal: "USD 10,000",
    amount: 10000,
    title: "Print Individual Buildings",
    description:
      "Pull any single landmark out of its district and print it on its own. Want just the tower, just the cathedral, or your office block? Every building stands alone.",
    status: "Locked",
    delivery: "2026/09/30 UTC",
    included: "All Stretch Goals",
  },
  {
    id: "m3",
    goal: "USD 15,000",
    amount: 15000,
    title: "Full Color Control",
    description:
      "Color every layer independently — water, trees, grass, terrain, and the buildings themselves. Print in mono or bring your whole city to life, section by section.",
    status: "Locked",
    delivery: "2026/09/30 UTC",
    included: "All Stretch Goals",
  },
  {
    id: "m4",
    goal: "USD 20,000",
    amount: 20000,
    title: "Magnetic Skyline",
    description:
      "Integrates magnet sockets into the bases and backplates to easily mount, swap, and modularly display skylines on walls or boards.",
    status: "Locked",
    delivery: "2026/09/30 UTC",
    included: "All Stretch Goals",
  },
  {
    id: "m5",
    goal: "USD 25,000",
    amount: 25000,
    title: "Snap-Together Districts",
    description:
      "Unlock modular printing: build one district, or snap multiple sections together into a sprawling cityscape. Print a single block or the whole skyline.",
    status: "Locked",
    delivery: "2026/10/15 UTC",
    included: "All Stretch Goals",
  },
  {
    id: "m6",
    goal: "USD 40,000",
    amount: 40000,
    title: "Time Machine: Skylines Through Eras",
    description:
      "We hand-model historical versions of iconic cities — Old New York, pre-war skylines, and more — so you can set your model to any era across decades.",
    status: "Locked",
    delivery: "2026/10/30 UTC",
    included: "All Stretch Goals",
  },
  {
    id: "m7",
    goal: "USD 60,000",
    amount: 60000,
    title: "The World Expansion",
    description:
      "A massive global expansion pack adding iconic landmarks and skylines from around the world.",
    status: "Locked",
    delivery: "2026/11/15 UTC",
    included: "All Stretch Goals",
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function Milestones() {
  const [activeId, setActiveId] = useState("m1");
  const [isPaused, setIsPaused] = useState(false);
  const [fundRaised, setFundRaised] = useState<number>(15692); // Default fallback

  const resumeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Supabase dynamic data fetching
  useEffect(() => {
    async function fetchFundRaised() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("campaign_stats")
          .select("fund_raised")
          .eq("slug", "framecity-main")
          .single();

        if (data && !error && data.fund_raised !== undefined) {
          setFundRaised(Number(data.fund_raised));
        }
      } catch {
        // Dynamic fetch fail aana automatic fallback execute aagum
      }
    }

    fetchFundRaised();
  }, []);

  // 2. Fund Raised Base Panni Status Update Function
  const updatedMilestones = DEFAULT_MILESTONES.map((m, index) => {
    const prevAmount = index > 0 ? DEFAULT_MILESTONES[index - 1].amount : 0;
    
    let status: "Unlocked" | "In Progress" | "Locked" = "Locked";
    if (fundRaised >= m.amount) {
      status = "Unlocked";
    } else if (fundRaised > prevAmount && fundRaised < m.amount) {
      status = "In Progress";
    }

    return { ...m, status };
  });

  const active = updatedMilestones.find((m) => m.id === activeId) || updatedMilestones[0];
  const activeIdx = updatedMilestones.findIndex((m) => m.id === active.id);

  // Unlocked Milestones Count
  const unlockedCount = updatedMilestones.filter((m) => m.status === "Unlocked").length;

  // 3. Dynamic Timeline Progress Line Percentage Calculation
  const getLineProgressPercentage = () => {
    if (updatedMilestones.length <= 1) return 0;
    
    // Unlocked milestones count exact point index
    const completedIndex = unlockedCount - 1;
    if (completedIndex < 0) return 0;
    if (unlockedCount >= updatedMilestones.length) return 100;

    // Segment calculation (Next targeted goal towards smooth step fill)
    const basePercent = (completedIndex / (updatedMilestones.length - 1)) * 100;
    const currentGoal = updatedMilestones[unlockedCount].amount;
    const prevGoal = updatedMilestones[completedIndex].amount;
    
    const segmentProgress = (fundRaised - prevGoal) / (currentGoal - prevGoal);
    const stepSize = 100 / (updatedMilestones.length - 1);

    return Math.min(100, basePercent + segmentProgress * stepSize);
  };

  // Auto-advance
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveId((prev) => {
        const idx = updatedMilestones.findIndex((m) => m.id === prev);
        const nextIdx = idx >= updatedMilestones.length - 1 ? 0 : idx + 1;
        return updatedMilestones[nextIdx].id;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused, updatedMilestones]);

  const handleSelect = (id: string) => {
    setActiveId(id);
    setIsPaused(true);
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    resumeTimeout.current = setTimeout(() => setIsPaused(false), 8000);
  };

  useEffect(() => {
    return () => {
      if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    };
  }, []);

  // Ref for the timeline section to trigger progress bar entry animation
  const timelineRef = useRef<HTMLDivElement>(null);
  const isTimelineInView = useInView(timelineRef, { once: true, margin: "-100px" });

  return (
    <section
      id="milestones"
      className="border-t border-cream/[0.08] py-20 md:py-28 w-full px-4 md:px-12 bg-[var(--bg)] overflow-hidden"
    >
      <div className="w-full max-w-[1180px] mx-auto">
        {/* Header */}
        <div className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <Reveal variant="fade-right">
            <h2 className="font-display text-3xl md:text-[2.6rem] font-light text-cream m-0 leading-[1.15]">
              Every goal we unlock together.
            </h2>
          </Reveal>
          <Reveal variant="fade-left" delay={1}>
            <p className="text-[13px] text-cream/50 max-w-[300px] m-0 leading-relaxed">
              {unlockedCount} of {updatedMilestones.length} goals unlocked. Click any point on the line for the full brief.
            </p>
          </Reveal>
        </div>

        {/* Timeline Line Rail & Points */}
        <div ref={timelineRef} className="relative w-full overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          <div
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            className="relative min-w-[880px] md:min-w-0 pt-4 pb-10"
          >
            <div className="relative flex justify-between items-start pt-12">
              {/* Rail base border */}
              <div className="absolute left-0 right-0 top-[136px] h-px bg-cream/12" />
              
              {/* Dynamic Progress Fill Bar — animates on viewport entry */}
              <motion.div
                className="absolute left-0 top-[136px] h-px bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70"
                initial={{ width: "0%" }}
                animate={isTimelineInView ? { width: `${getLineProgressPercentage()}%` } : { width: "0%" }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
              />
              
              {/* Glow Accent */}
              <motion.div
                className="absolute left-0 top-[135px] h-[3px] bg-[var(--accent)]/25 blur-[3px]"
                initial={{ width: "0%" }}
                animate={isTimelineInView ? { width: `${getLineProgressPercentage()}%` } : { width: "0%" }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
              />

              {updatedMilestones.map((item, idx) => {
                const isUnlocked = item.status === "Unlocked";
                const isInProgress = item.status === "In Progress";
                const isActive = item.id === activeId;

                return (
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={isTimelineInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.55, delay: 0.2 + idx * 0.09, ease: [0.22, 1, 0.36, 1] }}
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className="relative flex flex-col items-center group cursor-pointer flex-1 px-1"
                    aria-label={item.title}
                  >
                    <div
                      className={`mb-4 h-[64px] flex flex-col justify-end text-center transition-all duration-300 ${
                        isActive ? "opacity-100" : "opacity-55 group-hover:opacity-85"
                      }`}
                    >
                      {/* <p className="font-mono text-[10px] tracking-widest text-cream/40 mb-1.5 whitespace-nowrap">
                        {item.goal}
                      </p> */}
                      <p
                        className={`font-display text-[13.5px] leading-tight max-w-[112px] mx-auto line-clamp-2 transition-colors duration-300 ${
                          isActive ? "text-[var(--accent-text)]" : "text-cream/85"
                        }`}
                      >
                        {item.title}
                      </p>
                    </div>

                    <div className="relative flex flex-col items-center">
                      <span
                        className={`relative z-10 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                          isUnlocked
                            ? "bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_0_4px_rgba(0,0,0,0)]"
                            : isInProgress
                            ? "border-[var(--accent)] bg-[var(--bg)]"
                            : "border-cream/25 bg-[var(--bg)] group-hover:border-cream/45"
                        } ${isActive ? "scale-[1.35]" : "group-hover:scale-110"}`}
                      >
                        {/* {isActive && (
                          <motion.span
                            layoutId="active-ring"
                            transition={{ duration: 0.4, ease: EASE }}
                            className="absolute -inset-[7px] rounded-full border border-[var(--accent)]/50"
                          />
                        )} */}
                        {isUnlocked && (
                          <svg className="w-2.5 h-2.5 fill-[var(--bg)]" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                        {isInProgress && (
                          <motion.span
                            className="w-1.5 h-1.5"
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                          />
                        )}
                      </span>

                      <span
                        className={`mt-3 font-mono text-[10px] transition-colors duration-300 ${
                          isActive ? "text-cream/70" : "text-cream/30"
                        }`}
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dynamic Detail Card View */}
        <div className="relative mt-10 border-t border-cream/10 pt-10 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="grid md:grid-cols-[auto_1fr_220px] gap-6 md:gap-10 items-start"
            >
              {/* <span className="font-display text-sm text-cream/70">
                {String(activeIdx + 1).padStart(2, "0")} / {String(updatedMilestones.length).padStart(2, "0")}
              </span> */}

              <div>
                {/* <span
                  className={`inline-block font-mono text-[10px] tracking-widest uppercase mb-3 ${
                    active.status === "Unlocked"
                      ? "text-[var(--accent-text)]"
                      : active.status === "In Progress"
                      ? "text-cream/70"
                      : "text-cream/75"
                  }`}
                >
                  {active.status} · {active.goal}
                </span> */}
                <h3 className="font-display text-2xl md:text-3xl font-light text-cream mb-3 leading-snug">
                  {active.title}
                </h3>
                <p className="text-[14px] md:text-[15px] text-cream/65 leading-relaxed max-w-[540px] m-0">
                  {active.description}
                </p>
              </div>

              {/* <div className="flex md:flex-col gap-6 md:gap-4 font-mono text-[11px] md:pt-1">
                <div>
                  <p className="text-cream/70 m-0 mb-1">Est. delivery</p>
                  <p className="text-cream/85 m-0">{active.delivery}</p>
                </div>
                <div>
                  <p className="text-cream/70 m-0 mb-1">Includes</p>
                  <p className="text-[var(--accent-text)] m-0">{active.included}</p>
                </div>
              </div> */}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}