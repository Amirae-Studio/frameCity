"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "./Reveal";

// Code-split the three.js scene so it never lands in the initial bundle.
const ModelScene = dynamic(() => import("./ModelScene"), { ssr: false });

export function ModelShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Only fetch the 26 MB model + mount the WebGL canvas once the section
  // approaches the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="model"
      className="border-t border-cream/[0.09] px-6 py-[90px] md:px-[52px] md:py-[110px]"
    >
      <div className="mx-auto mb-12 max-w-[640px] text-center">
        <Reveal>
          {/* <div
            className="mb-[18px] font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--accent)" }}
          >
            In three dimensions
          </div> */}
          <h2 className="m-0 mb-4 font-display text-[38px] font-normal leading-[1.02] md:text-[52px]">
            Turn it over in your hands.
          </h2>
          <p className="m-0 text-[15px] leading-[1.7] text-cream/[0.62]">
            This is the real London model — every hand-modelled block, exactly as
            it prints. Drag to rotate it, scroll to move closer, and see the
            detail from any angle.
          </p>
        </Reveal>
      </div>

      <Reveal as="div" className="mx-auto max-w-[1080px]">
        <div
          ref={ref}
          className="on-media relative aspect-[4/3] overflow-hidden rounded-[14px] border border-cream/[0.12] bg-[radial-gradient(120%_120%_at_50%_15%,#161310_0%,#0b0a09_70%)] md:aspect-[16/9]"
        >
          {active ? (
            <ModelScene />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cream/40">
                Preparing model…
              </span>
            </div>
          )}

          {/* Live badge */}
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-cream/[0.18] bg-[rgba(11,10,9,0.6)] px-[13px] py-[7px] backdrop-blur-[6px]">
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: "var(--accent)" }}
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-cream/85">
              London · The City · live model
            </span>
          </div>

          {/* Interaction hint */}
          <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-cream/[0.14] bg-[rgba(11,10,9,0.5)] px-[13px] py-[7px] font-mono text-[10px] uppercase tracking-[0.18em] text-cream/60 backdrop-blur-[6px]">
            Drag to explore · scroll to zoom
          </div>
        </div>
      </Reveal>
    </section>
  );
}
