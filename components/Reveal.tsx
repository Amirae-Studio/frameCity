"use client";

import { motion, type Variants, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

const variantMap: Record<string, Variants> = {
  "fade-up": {
    hidden: { opacity: 0, y: 28 },
    show: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.75, delay: i * 0.07, ease: EASE },
    }),
  },
  "fade-down": {
    hidden: { opacity: 0, y: -28 },
    show: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.75, delay: i * 0.07, ease: EASE },
    }),
  },
  "fade-left": {
    hidden: { opacity: 0, x: -36 },
    show: (i: number = 0) => ({
      opacity: 1,
      x: 0,
      transition: { duration: 0.75, delay: i * 0.07, ease: EASE },
    }),
  },
  "fade-right": {
    hidden: { opacity: 0, x: 36 },
    show: (i: number = 0) => ({
      opacity: 1,
      x: 0,
      transition: { duration: 0.75, delay: i * 0.07, ease: EASE },
    }),
  },
  scale: {
    hidden: { opacity: 0, scale: 0.93 },
    show: (i: number = 0) => ({
      opacity: 1,
      scale: 1,
      transition: { duration: 0.7, delay: i * 0.07, ease: EASE },
    }),
  },
  clip: {
    hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
    show: (i: number = 0) => ({
      clipPath: "inset(0 0 0% 0)",
      opacity: 1,
      transition: { duration: 0.85, delay: i * 0.07, ease: EASE },
    }),
  },
  none: {
    hidden: { opacity: 0 },
    show: (i: number = 0) => ({
      opacity: 1,
      transition: { duration: 0.6, delay: i * 0.07, ease: EASE },
    }),
  },
};

export type RevealVariant =
  | "fade-up"
  | "fade-down"
  | "fade-left"
  | "fade-right"
  | "scale"
  | "clip"
  | "none";

export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
  variant = "fade-up",
  margin = "-80px",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "span" | "li" | "footer";
  variant?: RevealVariant;
  margin?: string;
}) {
  const prefersReduced = useReducedMotion();
  const MotionTag = motion[as];
  const variants = prefersReduced ? variantMap["none"] : variantMap[variant];

  return (
    <MotionTag
      className={className}
      custom={delay}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin }}
    >
      {children}
    </MotionTag>
  );
}
