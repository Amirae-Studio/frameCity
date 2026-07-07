"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { studioCities } from "@/lib/studio";

const ease = [0.22, 1, 0.36, 1] as const;

export function StudioPicker() {
  const router = useRouter();
  const [citySlug, setCitySlug] = useState<string | null>(null);
  const city = studioCities.find((c) => c.slug === citySlug) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-6 py-14 md:py-20">
      <AnimatePresence mode="wait">
        {!city ? (
          /* ---------------------------------------------- step 1 · city */
          <motion.div
            key="cities"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4, ease }}
          >
            <div
              className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              The Studio · Step 01
            </div>
            <h1 className="m-0 mb-3 font-display text-[40px] font-normal leading-[1.03] md:text-[52px]">
              Start with a city.
            </h1>
            <p className="m-0 mb-11 max-w-[480px] text-[15px] leading-[1.7] text-cream/[0.62]">
              Every tile begins somewhere. Four cities are print-ready today —
              the rest are on the workbench.
            </p>

            <div className="grid grid-cols-2 gap-[14px] md:grid-cols-3 lg:grid-cols-4">
              {studioCities.map((c, i) => (
                <motion.button
                  key={c.slug}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: i * 0.04, ease }}
                  disabled={!c.available}
                  onClick={() => setCitySlug(c.slug)}
                  whileHover={c.available ? { y: -4 } : undefined}
                  className={`group relative overflow-hidden rounded-xl border p-5 text-left transition-colors duration-300 ${
                    c.available
                      ? "border-cream/[0.14] bg-panel hover:border-[color:var(--accent)]"
                      : "stripe-fill cursor-not-allowed border-cream/[0.08]"
                  }`}
                >
                  <div
                    className={`font-display text-[22px] font-medium ${
                      c.available ? "" : "text-cream/40"
                    }`}
                  >
                    {c.name}
                  </div>
                  {c.available ? (
                    <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45">
                      {c.locations.length} districts
                      <span
                        className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-1"
                        style={{ color: "var(--accent)" }}
                        aria-hidden
                      >
                        →
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-cream/30">
                      In modelling
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          /* ------------------------------------------ step 2 · location */
          <motion.div
            key="locations"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4, ease }}
          >
            <button
              onClick={() => setCitySlug(null)}
              className="mb-7 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-cream/50 transition-colors hover:text-cream"
            >
              <span aria-hidden>←</span> All cities
            </button>

            <div
              className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              The Studio · Step 02
            </div>
            <h1 className="m-0 mb-3 font-display text-[40px] font-normal leading-[1.03] md:text-[52px]">
              {city.name}. <span className="italic">Now the block.</span>
            </h1>
            <p className="m-0 mb-11 max-w-[480px] text-[15px] leading-[1.7] text-cream/[0.62]">
              Pick the district you want framed — you&apos;ll fine-tune the
              exact tile in the configurator next.
            </p>

            <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
              {city.locations.map((loc, i) => (
                <motion.button
                  key={loc.slug}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: i * 0.05, ease }}
                  onClick={() =>
                    router.push(
                      `/studio/configure?city=${city.slug}&location=${loc.slug}`
                    )
                  }
                  whileHover={{ y: -3 }}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-cream/[0.14] bg-panel px-6 py-5 text-left transition-colors duration-300 hover:border-[color:var(--accent)]"
                >
                  <div>
                    <div className="font-display text-[21px] font-medium">
                      {loc.name}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-cream/55">
                      {loc.area}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden font-mono text-[10px] text-cream/35 sm:inline">
                      {loc.coords}
                    </span>
                    <span
                      className="inline-block transition-transform duration-300 group-hover:translate-x-1"
                      style={{ color: "var(--accent)" }}
                      aria-hidden
                    >
                      →
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
