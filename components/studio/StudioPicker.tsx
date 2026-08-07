"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { StudioCity } from "@/lib/studio";
import { fetchStudioCities } from "@/app/studio/actions";

const ease = [0.22, 1, 0.36, 1] as const;

export function StudioPicker({ initialCities }: { initialCities?: StudioCity[] }) {
  const router = useRouter();
  const [cities, setCities] = useState<StudioCity[]>(initialCities || []);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [citySlug, setCitySlug] = useState<string | null>(null);

  useEffect(() => {
    if (!initialCities || initialCities.length === 0) {
      fetchStudioCities().then((res) => {
        setCities(res);
      });
    }
  }, [initialCities]);

  // Group cities by country
  const countries = useMemo(() => {
    const map = new Map<string, StudioCity[]>();
    cities.forEach((c) => {
      const name = c.country || "Other";
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(c);
    });
    return Array.from(map.entries()).map(([country, cityList]) => {
      const readyDistricts = cityList.reduce((sum, c) => {
        if (!c.available) return sum;
        return sum + c.locations.filter((l) => l.completed !== false).length;
      }, 0);
      const isAvailable = readyDistricts > 0;
      return {
        country,
        cities: cityList,
        readyDistricts,
        isAvailable,
      };
    });
  }, [cities]);

  // Filter cities for selected country
  const countryCities = useMemo(() => {
    if (!selectedCountry) return [];
    return cities.filter((c) => c.country === selectedCountry);
  }, [cities, selectedCountry]);

  // Selected city object
  const city = useMemo(() => {
    if (!citySlug) return null;
    return cities.find((c) => c.slug === citySlug) ?? null;
  }, [cities, citySlug]);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-6 py-14 md:py-20">
      <AnimatePresence mode="wait">
        {!selectedCountry ? (
          /* ---------------------------------------------- step 1 · country */
          <motion.div
            key="step-countries"
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
              Start with a country.
            </h1>
            <p className="m-0 mb-11 max-w-[480px] text-[15px] leading-[1.7] text-cream/[0.62]">
              Select a country to browse available 3D printable city tiles.
            </p>

            {countries.length === 0 ? (
              <div className="rounded-xl border border-cream/[0.12] bg-panel/60 p-10 text-center">
                <div className="font-display text-[26px] font-medium text-cream/90 mb-2">
                  Cities will be posted.
                </div>
                <p className="text-[14px] leading-[1.6] text-cream/50 max-w-[420px] mx-auto">
                  No city models are currently available in the database. Run the SQL schema script in your Supabase SQL Editor to populate cities!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {countries.map((c, i) => (
                  <motion.button
                    key={c.country}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: i * 0.04, ease }}
                    disabled={!c.isAvailable}
                    onClick={() => {
                      if (c.isAvailable) setSelectedCountry(c.country);
                    }}
                    whileHover={c.isAvailable ? { y: -4 } : undefined}
                    className={`group relative overflow-hidden rounded-xl border p-6 text-left transition-colors duration-300 ${
                      c.isAvailable
                        ? "cursor-pointer border-cream/[0.14] bg-panel hover:border-[color:var(--accent)]"
                        : "stripe-fill cursor-not-allowed border-cream/[0.08] opacity-60"
                    }`}
                  >
                    <div
                      className={`font-display text-[24px] font-medium ${
                        c.isAvailable ? "" : "text-cream/40"
                      }`}
                    >
                      {c.country}
                    </div>
                    {c.isAvailable ? (
                      <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-cream/45 flex items-center justify-between">
                        <span>
                          {c.readyDistricts} district{c.readyDistricts === 1 ? "" : "s"}
                        </span>
                        <span
                          className="inline-block transition-transform duration-300 group-hover:translate-x-1"
                          style={{ color: "var(--accent)" }}
                          aria-hidden
                        >
                          →
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-cream/30">
                        In modelling
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        ) : !city ? (
          /* ------------------------------------------------ step 2 · city */
          <motion.div
            key="step-cities"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4, ease }}
          >
            <button
              onClick={() => setSelectedCountry(null)}
              className="mb-7 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-cream/50 transition-colors hover:text-cream cursor-pointer"
            >
              <span aria-hidden>←</span> All countries
            </button>

            <div
              className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              The Studio · Step 02
            </div>
            <h1 className="m-0 mb-3 font-display text-[40px] font-normal leading-[1.03] md:text-[52px]">
              {selectedCountry}. <span className="italic">Select a city.</span>
            </h1>
            <p className="m-0 mb-11 max-w-[480px] text-[15px] leading-[1.7] text-cream/[0.62]">
              Choose a city in {selectedCountry} to view printable districts.
            </p>

            <div className="grid grid-cols-2 gap-[14px] md:grid-cols-3 lg:grid-cols-4">
              {countryCities.map((c, i) => {
                const hasReadyLocations = c.locations.some((loc) => loc.completed !== false);
                const isCityAvailable = c.available && hasReadyLocations;
                const readyCount = c.locations.filter((loc) => loc.completed !== false).length;

                return (
                  <motion.button
                    key={c.slug}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: i * 0.04, ease }}
                    disabled={!isCityAvailable}
                    onClick={() => {
                      if (isCityAvailable) setCitySlug(c.slug);
                    }}
                    whileHover={isCityAvailable ? { y: -4 } : undefined}
                    className={`group relative overflow-hidden rounded-xl border p-5 text-left transition-colors duration-300 ${
                      isCityAvailable
                        ? "cursor-pointer border-cream/[0.14] bg-panel hover:border-[color:var(--accent)]"
                        : "stripe-fill cursor-not-allowed border-cream/[0.08] opacity-60"
                    }`}
                  >
                    <div
                      className={`font-display text-[22px] font-medium ${
                        isCityAvailable ? "" : "text-cream/40"
                      }`}
                    >
                      {c.name}
                    </div>
                    {isCityAvailable ? (
                      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-cream/45">
                        {readyCount} district{readyCount === 1 ? "" : "s"}
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
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* ------------------------------------------ step 3 · location */
          <motion.div
            key="step-locations"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.4, ease }}
          >
            <button
              onClick={() => setCitySlug(null)}
              className="mb-7 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.2em] text-cream/50 transition-colors hover:text-cream cursor-pointer"
            >
              <span aria-hidden>←</span> Cities in {selectedCountry}
            </button>

            <div
              className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              The Studio · Step 03
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
