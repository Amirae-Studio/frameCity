"use client";

import type { TerrainMode } from "@/lib/explore/elevation";

export type TerrainChoice = { mode: TerrainMode };

const TERRAIN_MODES: { mode: TerrainMode; label: string; hint: string }[] = [
  { mode: "smooth", label: "Smooth", hint: "Bumps gone, slopes kept" },
  { mode: "flat", label: "Flat", hint: "One level" },
];

/** Smooth / Flat — shared by the colours step and the Studio panel. */
export function TerrainModePicker({ value, onChange }: { value: TerrainChoice; onChange: (t: TerrainChoice) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-cream/[0.14] p-1">
      {TERRAIN_MODES.map(({ mode, label, hint }) => {
        const on = value.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            title={hint}
            onClick={() => onChange({ mode })}
            className={`flex flex-col items-center rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
              on ? "bg-cream font-medium text-[var(--color-base)]" : "text-cream/60 hover:text-cream"
            }`}
          >
            {label}
            <span className={`font-mono text-[8.5px] uppercase tracking-[0.08em] ${on ? "opacity-70" : "text-cream/35"}`}>
              {hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
