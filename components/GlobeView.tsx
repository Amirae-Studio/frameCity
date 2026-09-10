"use client"

import { useTheme } from "@/lib/theme"
import { GlobeInteractive } from "./ui/Globe"
import { Reveal } from "./Reveal"

export default function GlobeView() {
  const { mode } = useTheme()

  return (
    <section
      id="model-library"
      className="border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[110px] overflow-hidden"
    >
      <div className="mx-auto max-w-[1180px]">
        {/* ── HEADER ── */}
        <div className="mx-auto max-w-[640px] text-center mb-12 md:mb-16">
          <Reveal>
            
            <h2 className="m-0 mb-4 font-display text-[34px] md:text-[52px] font-normal leading-[1.05]">
              Our City Model Library
            </h2>
            <p className="m-0 text-[15px] leading-[1.7] text-cream/[0.62] max-w-[520px] mx-auto">
              Each city launches with curated viewpoints centered on its most recognizable architecture.
              New cities and additional views will be added regularly; see our{" "}
              <a href="#milestones" className="underline underline-offset-4 decoration-cream/20 hover:decoration-cream/50 transition-colors" style={{ color: "var(--accent-text)" }}>
                Stretch Goals
              </a>{" "}
              for the full expansion roadmap.
            </p>
          </Reveal>
        </div>

        {/* ── GLOBE ── */}
        <Reveal variant="scale" className="relative">
          <div className="w-full max-w-[520px] mx-auto">
            <GlobeInteractive theme={mode} />
          </div>
          {/* Ambient glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(var(--accent-rgb), 0.06) 0%, transparent 70%)" }}
          />
        </Reveal>

        {/* ── FOOTER NOTE ── */}
        <Reveal>
          <p className="mt-10 text-center text-[13px] text-cream/40 max-w-[460px] mx-auto leading-relaxed">
            More cities and places are in works for Phase 2 based on community voting.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
