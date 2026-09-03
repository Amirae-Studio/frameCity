"use client";
import { motion } from "framer-motion";

export function StepTimeline({
  steps,
  currentStep, // 1-indexed
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <div className="mb-10 flex items-center">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        const isLast = i === steps.length - 1;

        return (
          <div key={label} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex flex-col items-center gap-2">
              <motion.div
                initial={false}
                animate={{
                  scale: isActive ? 1.1 : 1,
                  borderColor: isDone || isActive ? "var(--accent)" : "rgba(244,241,234,0.16)",
                  backgroundColor: isDone ? "var(--accent)" : "transparent",
                }}
                transition={{ duration: 0.3 }}
                className="flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[11px] font-bold"
              >
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l2.5 2.5L10 3"
                      stroke="var(--bg, #0b0b0b)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span style={{ color: isActive ? "var(--accent)" : "rgba(244,241,234,0.4)" }}>
                    {stepNum}
                  </span>
                )}
              </motion.div>
              <span
                className={`font-mono text-[9.5px] uppercase tracking-[0.14em] whitespace-nowrap ${
                  isActive ? "" : "text-cream/35"
                }`}
                style={isActive ? { color: "var(--accent)" } : undefined}
              >
                {label}
              </span>
            </div>

            {!isLast && (
              <div className="mx-2 h-px flex-1 bg-cream/[0.12] relative -mt-5 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 h-px"
                  style={{ background: "var(--accent)" }}
                  initial={false}
                  animate={{ width: isDone ? "100%" : "0%" }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}