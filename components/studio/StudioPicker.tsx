"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { StudioCity } from "@/lib/studio";
import { fetchStudioCities } from "@/app/studio/actions";

const ease = [0.22, 1, 0.36, 1] as const;

export function StudioPicker({ initialCities }: { initialCities?: StudioCity[] }) {
  const router = useRouter();
  const [cities, setCities] = useState<StudioCity[]>(initialCities || []);
  const [citySlug, setCitySlug] = useState<string | null>(null);

  useEffect(() => {
    if (!initialCities || initialCities.length === 0) {
      fetchStudioCities().then((res) => {
        setCities(res);
      });
    }
  }, [initialCities]);

  const city = cities.find((c) => c.slug === citySlug) ?? null;

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

            {cities.length === 0 ? (
              <div className="rounded-xl border border-cream/[0.12] bg-panel/60 p-10 text-center">
                <div className="font-display text-[26px] font-medium text-cream/90 mb-2">
                  Cities will be posted.
                </div>
                <p className="text-[14px] leading-[1.6] text-cream/50 max-w-[420px] mx-auto">
                  No city models are currently available in the database. Run the SQL schema script in your Supabase SQL Editor to populate cities!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-[14px] md:grid-cols-3 lg:grid-cols-4">
                {cities.map((c, i) => (
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
            )}
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
              {city.locations.map((loc, i) => {
                const isReady = loc.completed !== false;
                return (
                  <motion.button
                    key={loc.slug}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: i * 0.05, ease }}
                    disabled={!isReady}
                    onClick={() => {
                      if (isReady) {
                        router.push(
                          `/studio/configure?city=${city.slug}&location=${loc.slug}`
                        );
                      }
                    }}
                    whileHover={isReady ? { y: -3 } : undefined}
                    className={`group flex items-center justify-between gap-4 rounded-xl border px-6 py-5 text-left transition-colors duration-300 ${
                      isReady
                        ? "cursor-pointer border-cream/[0.14] bg-panel hover:border-[color:var(--accent)]"
                        : "stripe-fill cursor-not-allowed border-cream/[0.08] opacity-55"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`font-display text-[21px] font-medium ${
                            isReady ? "" : "text-cream/40"
                          }`}
                        >
                          {loc.name}
                        </span>
                        {isReady ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10"
                            title="Ready to print & configure"
                          >
                            <svg
                              className="w-3 h-3 text-emerald-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Completed
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider text-amber-300/80 border border-amber-500/25 bg-amber-500/10"
                            title="Model in progress — not printable yet"
                          >
                            <svg
                              className="w-2.5 h-2.5 text-amber-300/80"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                              />
                            </svg>
                            In Progress
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-cream/55">
                        {loc.area}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden font-mono text-[10px] text-cream/35 sm:inline">
                        {loc.coords}
                      </span>
                      {isReady ? (
                        <span
                          className="inline-block transition-transform duration-300 group-hover:translate-x-1"
                          style={{ color: "var(--accent)" }}
                          aria-hidden
                        >
                          →
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-cream/30" aria-hidden>
                          🚫
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
