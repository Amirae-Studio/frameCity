"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { accents, type Accent } from "./data";

export type Mode = "dark" | "light";

type ThemeState = {
  accent: Accent;
  setAccent: (a: Accent) => void;
  showPrices: boolean;
  togglePrices: () => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(accents[0]);
  const [showPrices, setShowPrices] = useState(true);
  // Start at the SSR default so the first client render matches the server;
  // the real value (already applied to <html> by the no-flash script) is read
  // in an effect below. This avoids a hydration mismatch on the toggle icon.
  const [mode, setModeState] = useState<Mode>("dark");
  const [hydrated, setHydrated] = useState(false);

  const setAccent = useCallback((a: Accent) => setAccentState(a), []);
  const togglePrices = useCallback(() => setShowPrices((p) => !p), []);
  const setMode = useCallback((m: Mode) => setModeState(m), []);
  const toggleMode = useCallback(
    () => setModeState((m) => (m === "dark" ? "light" : "dark")),
    []
  );

  // Push the accent into CSS custom properties so plain CSS + arbitrary
  // Tailwind values (var(--accent)) react to the control.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accent.value);
    root.style.setProperty("--accent-rgb", accent.rgb);
  }, [accent]);

  // Adopt whatever the no-flash <head> script already resolved onto <html>.
  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme") as Mode;
    if (applied === "light" || applied === "dark") setModeState(applied);
    setHydrated(true);
  }, []);

  // Reflect user-driven changes onto <html data-theme> and persist them.
  // Guarded by `hydrated` so we don't clobber the head-script value on mount.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute("data-theme", mode);
    try {
      localStorage.setItem("fc-theme", mode);
    } catch {
      /* ignore */
    }
  }, [mode, hydrated]);

  const value = useMemo(
    () => ({
      accent,
      setAccent,
      showPrices,
      togglePrices,
      mode,
      setMode,
      toggleMode,
    }),
    [accent, setAccent, showPrices, togglePrices, mode, setMode, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
