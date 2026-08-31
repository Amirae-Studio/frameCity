"use client";

import Image from "next/image";
import { steps } from "@/lib/data";
import { Reveal } from "./Reveal";

export function Craft() {
  return (
    <section
      id="craft"
      className="mt-[70px] border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        <Reveal className="overflow-hidden rounded-[10px] border border-cream/10">
          <div className="relative h-[360px] w-full md:h-[520px]">
            <Image
              src="/london-table.jpg"
              alt="Close detail of the London model"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </Reveal>

        <div>
          <Reveal>
            {/* <div
              className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              How it&apos;s made
            </div> */}
            <h2 className="m-0 mb-5 font-display text-[34px] font-normal leading-[1.05] md:text-[46px]">
              Modelled by hand,
              <br />
              not machine-generated.
            </h2>
            <p className="m-0 mb-[30px] max-w-[440px] text-[15px] leading-[1.7] text-cream/[0.66]">
              Most city models are auto-generated straight from map data — and it
              shows. We use the data only as a reference, then rebuild most
              buildings by hand so every piece prints cleanly and actually looks
              good on your shelf.
            </p>
          </Reveal>

          <div className="flex flex-col">
            {steps.map((step, i) => (
              <Reveal
                key={step.no}
                delay={i}
                className="flex gap-[22px] border-t border-cream/[0.12] py-6"
              >
                <span
                  className="pt-[3px] font-mono text-[13px]"
                  style={{ color: "var(--accent)" }}
                >
                  {step.no}
                </span>
                <div>
                  <div className="mb-[7px] font-display text-[20px] font-medium">
                    {step.title}
                  </div>
                  <p className="m-0 text-[14.5px] leading-[1.65] text-cream/60">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
