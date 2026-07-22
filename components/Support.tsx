"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Reveal } from "./Reveal";

// const stats = [
//   { value: "1,240", label: "backers" },
//   { value: "214%", label: "funded" },
//   { value: "18", label: "days left" },
// ];

export function Support() {
  return (
    <section
      id="support"
      className="border-t border-cream/[0.09] px-6 py-[90px] md:px-[52px] md:py-[110px]"
    >
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <Reveal>
            <div
              className="mb-[22px] inline-flex items-center gap-[9px] rounded-full px-[14px] py-[7px] font-mono text-[11px] font-bold uppercase tracking-[0.24em]"
              style={{
                color: "var(--accent)",
                border: "1px solid rgba(var(--accent-rgb), 0.35)",
              }}
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: "var(--accent)" }}
              />
              Now live on MakerWorld
            </div>
            <h2 className="m-0 mb-5 font-display text-[36px] font-normal leading-[1.03] md:text-[50px]">
              Back the campaign, grow the library.
            </h2>
            <p className="m-0 mb-[34px] max-w-[460px] text-[15.5px] leading-[1.7] text-cream/[0.66]">
              We&apos;re crowdfunding on MakerWorld to hand-model the next wave of
              cities and release the print files to backers. Every pledge puts
              another skyline on the workbench.
            </p>
          </Reveal>

          {/* <Reveal>
            <div className="mb-[14px] flex justify-between font-mono text-[12.5px] text-cream/60">
              <span>$42,180 pledged</span>
              <span>214% funded</span>
            </div>
            <div className="mb-8 h-2 overflow-hidden rounded-full bg-cream/[0.12]">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: "88%" }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{ background: "var(--accent)" }}
              />
            </div>
          </Reveal> */}

          {/* <Reveal className="mb-9 flex gap-11">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-display text-[34px] font-normal">
                  {s.value}
                </div>
                <div className="mt-[2px] font-mono text-[12px] text-cream/50">
                  {s.label}
                </div>
              </div>
            ))}
          </Reveal> */}

          <Reveal className="flex flex-wrap gap-[14px]">
            <a
              href="https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames"
              target="_blank"
              className="rounded-full bg-cream px-8 py-4 text-[14.5px] text-[var(--color-base)] no-underline transition-transform duration-300 hover:scale-[1.03]"
            >
              Back us on MakerWorld
            </a>
            <a
              href="https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames"
              target="_blank"
              className="inline-flex items-center rounded-full border border-cream/[0.28] bg-transparent px-7 py-4 text-[14.5px] text-cream no-underline transition-colors duration-300 hover:border-cream/60"
            >
              See the rewards
            </a>
          </Reveal>
        </div>

        <Reveal className="overflow-hidden rounded-xl border border-cream/10">
          <div className="relative h-[360px] w-full md:h-[520px]">
            <Image
              src="/makerworld.jpg"
              alt="FrameCity models on MakerWorld"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
