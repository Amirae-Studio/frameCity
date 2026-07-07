"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { accents } from "@/lib/data";
import { useTheme } from "@/lib/theme";

export function AccentControl() {
  const { accent, setAccent, showPrices, togglePrices } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-[220px] rounded-2xl border border-cream/[0.14] bg-[rgba(20,18,16,0.9)] p-4 backdrop-blur-xl"
          >
            <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-cream/45">
              Accent
            </div>
            <div className="mb-4 flex gap-2">
              {accents.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setAccent(a)}
                  aria-label={a.label}
                  title={a.label}
                  className="h-7 w-7 rounded-full transition-transform duration-200 hover:scale-110"
                  style={{
                    background: a.value,
                    outline:
                      a.value === accent.value
                        ? "2px solid var(--color-cream)"
                        : "1px solid rgba(242,239,233,0.2)",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
            <button
              onClick={togglePrices}
              className="flex w-full items-center justify-between rounded-lg border border-cream/[0.14] px-3 py-2 text-[12.5px] text-cream/75 transition-colors hover:border-cream/30"
            >
              Show prices
              <span
                className="relative inline-block h-[18px] w-[32px] rounded-full transition-colors duration-200"
                style={{
                  background: showPrices
                    ? "var(--accent)"
                    : "rgba(242,239,233,0.18)",
                }}
              >
                <motion.span
                  className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-cream"
                  animate={{ left: showPrices ? 16 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Customise theme"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-cream/[0.16] bg-[rgba(20,18,16,0.85)] backdrop-blur-xl"
      >
        <span
          className="h-5 w-5 rounded-full"
          style={{
            background: accent.value,
            boxShadow: "0 0 0 3px rgba(var(--accent-rgb), 0.28)",
          }}
        />
      </motion.button>
    </div>
  );
}
