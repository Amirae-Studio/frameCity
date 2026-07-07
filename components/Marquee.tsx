"use client";

import { marqueeNames } from "@/lib/data";

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
  return (
    <section className="overflow-hidden border-b border-cream/[0.09] bg-marquee py-[22px]">
      <div className="fc-marq">
        <Track />
        <Track />
      </div>
    </section>
  );
}
