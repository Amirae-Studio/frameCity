"use client";
import { useRef, useState } from "react";
import { motion } from "framer-motion";

export function SpotlightCard({
  children,
  className = "",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.button
      ref={ref}
      disabled={disabled}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      whileHover={!disabled ? { y: -4, scale: 1.01 } : undefined}
      transition={{ duration: 0.3 }}
      className={`group relative overflow-hidden rounded-2xl border border-cream/[0.14] bg-panel text-left ${className}`}
    >
      {/* glow layer */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.button>
  );
}