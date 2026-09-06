"use client";

import { motion, useReducedMotion } from "framer-motion";
import { marqueeNames } from "@/lib/data";
import { Reveal } from "./Reveal";

function Track() {
  return (
    <div className="flex">
      {marqueeNames.map((name, i) => (
        <span
          key={i}
          className="inline-flex items-center whitespace-nowrap font-display text-[26px] italic text-cream/[0.55]"
        >
          {name}
          <span
            className="mx-[30px] not-italic"
            style={{ color: "var(--accent)" }}
          >
            ·
          </span>
        </span>
      ))}
    </div>
  );
}

export function Marquee() {
  const prefersReduced = useReducedMotion();

  return (
    <Reveal variant="none" margin="-20px">
      <section className="overflow-hidden border-b border-cream/[0.09] bg-marquee py-[22px]">
        <motion.div
          className="fc-marq"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <Track />
          <Track />
        </motion.div>
      </section>
    </Reveal>
  );
}
