"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Reveal } from "./Reveal";

const cityChips = ["London", "Paris", "New York", "Tokyo"];

type Format = { name: string; size: string; price: number };
const formats: Format[] = [
  { name: "Table Edition", size: "220 × 220 mm", price: 240 },
  { name: "Wall Edition", size: "300 × 300 mm", price: 300 },
];

// Rough lat/long anchor for the pin readout (London · The City).
const BASE_LAT = 51.5155;
const BASE_LNG = -0.0922;

export function Configurator() {
  const [city, setCity] = useState("London");
  const [format, setFormat] = useState(0);
  const [coords, setCoords] = useState({ lat: BASE_LAT, lng: BASE_LNG });
  const mapRef = useRef<HTMLDivElement>(null);

  const active = formats[format];

  function handleDrag() {
    // Translate the pin offset into a plausible coordinate readout.
    const el = document.getElementById("fc-pin");
    const map = mapRef.current;
    if (!el || !map) return;
    const p = el.getBoundingClientRect();
    const m = map.getBoundingClientRect();
    const nx = (p.left + p.width / 2 - m.left) / m.width - 0.5;
    const ny = (p.top + p.height / 2 - m.top) / m.height - 0.5;
    setCoords({
      lat: +(BASE_LAT - ny * 0.02).toFixed(4),
      lng: +(BASE_LNG + nx * 0.03).toFixed(4),
    });
  }

  return (
    <section
      id="create"
      className="warm-radial border-t border-cream/[0.09] px-6 py-[90px] md:px-[52px] md:py-[110px]"
    >
      <div className="mx-auto mb-14 max-w-[640px] text-center">
        <Reveal>
          <div
            className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--accent)" }}
          >
            The Configurator
          </div>
          <h2 className="m-0 mb-4 font-display text-[38px] font-normal leading-[1.02] md:text-[52px]">
            Browse, drop a pin, print &amp; frame.
          </h2>
          <p className="m-0 text-[15px] leading-[1.7] text-cream/[0.62]">
            Pick any city in the library, frame the exact block you love, choose
            a format — and we print and hand-frame it to order.
          </p>
        </Reveal>
      </div>

      <Reveal
        as="div"
        className="mx-auto grid max-w-[1180px] grid-cols-1 items-stretch gap-5 lg:grid-cols-[1.05fr_1fr]"
      >
        {/* Control panel */}
        <div className="flex flex-col gap-[30px] rounded-[14px] border border-cream/[0.12] bg-panel p-[26px] md:p-[34px]">
          {/* Step 1 */}
          <div>
            <StepHead no="01" label="Browse a city" />
            <div className="flex flex-wrap gap-[9px]">
              {cityChips.map((c) => {
                const activeChip = c === city;
                return (
                  <button
                    key={c}
                    onClick={() => setCity(c)}
                    className={`rounded-full px-4 py-[9px] text-[13px] transition-colors duration-200 ${
                      activeChip
                        ? "bg-cream text-[var(--color-base)]"
                        : "border border-cream/20 text-cream/75 hover:border-cream/40"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
              <span className="rounded-full border border-cream/20 px-4 py-[9px] text-[13px] text-cream/50">
                +6 more
              </span>
            </div>
          </div>

          {/* Step 2 */}
          <div>
            <StepHead no="02" label="Select a location" />
            <div
              ref={mapRef}
              className="map-grid relative h-[150px] overflow-hidden rounded-[10px] border border-cream/[0.14]"
            >
              <motion.div
                id="fc-pin"
                drag
                dragConstraints={mapRef}
                dragMomentum={false}
                onDrag={handleDrag}
                className="absolute left-[38%] top-[30%] z-10 cursor-grab active:cursor-grabbing"
              >
                <div className="relative h-[64px] w-[96px] rounded-[3px] border-[1.5px] border-cream shadow-[0_0_0_2000px_rgba(11,10,9,0.42)]">
                  <div
                    className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background: "var(--accent)",
                      boxShadow: "0 0 0 4px rgba(var(--accent-rgb), 0.3)",
                    }}
                  />
                </div>
              </motion.div>
              <span className="pointer-events-none absolute bottom-[10px] left-3 font-mono text-[11px] text-cream/60">
                {coords.lat}° N, {Math.abs(coords.lng)}°{" "}
                {coords.lng < 0 ? "W" : "E"} · The City
              </span>
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <StepHead no="03" label="Choose a format" />
            <div className="grid grid-cols-2 gap-[10px]">
              {formats.map((f, i) => {
                const on = i === format;
                return (
                  <button
                    key={f.name}
                    onClick={() => setFormat(i)}
                    className="rounded-[10px] p-4 text-left transition-colors duration-200"
                    style={{
                      border: on
                        ? "1.5px solid var(--accent)"
                        : "1px solid rgba(var(--ink-rgb), 0.16)",
                      background: on
                        ? "rgba(var(--accent-rgb), 0.06)"
                        : "transparent",
                    }}
                  >
                    <div className="font-display text-[16px] font-medium">
                      {f.name}
                    </div>
                    <div className="mt-1 font-mono text-[12px] text-cream/55">
                      {f.size}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <a
            href="/studio"
            className="group mt-[2px] flex items-center justify-center gap-[10px] rounded-full bg-cream p-4 text-[14.5px] text-[var(--color-base)] no-underline transition-transform duration-300 hover:scale-[1.02]"
          >
            Print &amp; frame — from ${active.price}
            <span className="inline-block h-[6px] w-[6px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-[var(--color-base)] transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Live preview */}
        <div className="on-media relative min-h-[300px] overflow-hidden rounded-[14px] border border-cream/[0.12] bg-[#0b0a09] lg:min-h-[440px]">
          <Image
            src="/london-preview.jpg"
            alt="Live preview of framed model"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-cream/[0.18] bg-[rgba(11,10,9,0.6)] px-[13px] py-[7px] backdrop-blur-[6px]">
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: "var(--accent)" }}
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cream/85">
              Live preview
            </span>
          </div>
          <div className="absolute bottom-4 left-4 font-display text-[22px] font-medium text-cream [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
            {city} · The City · {active.name}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function StepHead({ no, label }: { no: string; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        className="font-mono text-[10px] font-bold"
        style={{ color: "var(--accent)" }}
      >
        {no}
      </span>
      <span className="font-display text-[18px] font-medium">{label}</span>
    </div>
  );
}
