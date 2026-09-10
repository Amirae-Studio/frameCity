"use client";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { steps } from "@/lib/data";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Craft() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        console.warn("Autoplay blocked or failed:", err);
      });
    }
  }, []);

  return (
    <section
      id="craft"
      className="mt-[70px] border-t border-cream/[0.09] px-6 py-[80px] md:px-[52px] md:py-[100px]"
    >
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Video Wrapper with Hardware-Accelerated Clipping */}
        <div className="relative h-[360px] w-full overflow-hidden rounded-[12px] border border-cream/10 md:h-[520px] isolate transform-gpu">
          <video
            ref={videoRef}
            src="https://joewkzjnrikotpgzyywh.supabase.co/storage/v1/object/public/gallery/videos/Making-Of-Framecity.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full rounded-2xl object-cover"
          />
        </div>

        <div>
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

          <div className="flex flex-col">
            {steps.map((step, i) => (
              <motion.div
                key={step.no}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: EASE }}
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
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}