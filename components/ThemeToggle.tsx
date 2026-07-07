"use client";

import { motion } from "framer-motion";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";

  return (
    <button
      onClick={toggleMode}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-cream/20 text-cream/80 transition-colors duration-300 hover:border-cream/45 hover:text-cream ${className}`}
    >
      <motion.span
        key={mode}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex"
      >
        {isDark ? (
          // Moon
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          // Sun
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
            <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
            </g>
          </svg>
        )}
      </motion.span>
    </button>
  );
}
