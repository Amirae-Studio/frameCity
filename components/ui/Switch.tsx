"use client";

import { motion } from "framer-motion";

export interface SwitchProps {
  label?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export default function Switch({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  className = "",
}: SwitchProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      {label && <span className="text-[12.5px] text-cream/75">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className="relative inline-block h-[18px] w-[32px] rounded-full transition-colors duration-200 disabled:opacity-50"
        style={{
          background: checked ? "var(--accent)" : "rgba(var(--ink-rgb), 0.18)",
        }}
      >
        <motion.span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-cream"
          animate={{ left: checked ? 16 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </button>
    </div>
  );
}