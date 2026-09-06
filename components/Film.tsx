"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { filmStages } from "@/lib/data";
import { Reveal } from "./Reveal";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Film() {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handlePlay = () => {
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  const handleClose = () => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play();
    }
  };

  return (
    <section id="film" className="border-t border-cream/[0.09] px-4 py-[60px] sm:px-6 md:px-[52px] md:py-[100px]">
      {/* Header */}
      <div className="mx-auto mb-8 max-w-[640px] text-center md:mb-[46px]">
        <Reveal>
          <h2 className="m-0 mb-3 font-display text-[28px] font-normal leading-[1.1] sm:text-[34px] md:text-[48px]">
            Every city is planned, modelled and tested — one part at a time.
          </h2>
          <p className="m-0 text-[13.5px] leading-[1.6] text-cream/[0.62] sm:text-[15px] sm:leading-[1.7]">
            Watch how a skyline goes from a blank sheet to a print-ready model:
            districts planned, buildings modelled by hand, then each part
            test-printed until it holds.
          </p>
        </Reveal>
      </div>

      {/* Video container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, ease: EASE }}
        className="on-media relative mx-auto aspect-[4/5] sm:aspect-[16/10] md:aspect-video max-w-[1080px] overflow-hidden rounded-xl border border-cream/[0.12] bg-[#0b0a09]"
      >
        {/* Background / Main Video */}
        <video
          ref={videoRef}
          autoPlay
          loop={!isPlaying}
          muted={!isPlaying}
          playsInline
          controls={isPlaying}
          onEnded={handleClose}
          poster="/london-table.jpg"
          src="/Framecity_video.mp4"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            isPlaying ? "opacity-100 z-10" : "opacity-50 z-0"
          }`}
        />

        {/* UI Overlay - visible when not playing */}
        <AnimatePresence>
          {!isPlaying && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-10 flex flex-col justify-between pointer-events-auto"
            >
              {/* Radial Gradient Overlay */}
              <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_50%,rgba(11,10,9,0.25),rgba(11,10,9,0.72))]" />

              {/* Center Play Button */}
              <div className="relative z-10 my-auto flex flex-col items-center justify-center gap-3 p-4 sm:gap-[22px]">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Play the film"
                  onClick={handlePlay}
                  className="relative flex h-[60px] w-[60px] sm:h-[78px] sm:w-[78px] cursor-pointer items-center justify-center rounded-full border border-cream/50 bg-cream/10 backdrop-blur-[6px] transition-colors hover:bg-cream/20"
                >
                  {/* Pulsing ring */}
                  <motion.span
                    animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                    className="absolute inset-0 rounded-full border border-cream/30"
                  />
                  <span className="ml-[4px] sm:ml-[5px] inline-block h-0 w-0 border-b-[8px] sm:border-b-[11px] border-l-[12px] sm:border-l-[16px] border-t-[8px] sm:border-t-[11px] border-b-transparent border-l-cream border-t-transparent" />
                </motion.button>
                <span className="font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.26em] text-cream/80">
                  Play the film · 0:30
                </span>
              </div>

              {/* Bottom Stages Bar — Responsive flex layout */}
              <div className="relative z-10 flex flex-col sm:flex-row border-t border-cream/[0.14] bg-[rgba(11,10,9,0.75)] sm:bg-[rgba(11,10,9,0.55)] backdrop-blur-[6px]">
                {filmStages.map((s, i) => (
                  <motion.div
                    key={s.no}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.55, delay: 0.2 + i * 0.08, ease: EASE }}
                    className={`flex-1 px-4 py-3 sm:px-[18px] md:px-[22px] sm:py-[18px] ${
                      i < filmStages.length - 1
                        ? "border-b border-cream/[0.1] sm:border-b-0 sm:border-r"
                        : ""
                    }`}
                  >
                    <span
                      className="font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em]"
                      style={{ color: "var(--accent)" }}
                    >
                      {s.no} · {s.label}
                    </span>
                    <div className="mt-[2px] sm:mt-[6px] text-[11px] text-cream/[0.72] line-clamp-2 sm:line-clamp-none md:text-[13px]">
                      {s.body}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Close Button when playing */}
        {isPlaying && (
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-[12px] text-cream/80 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-cream"
            aria-label="Close video"
          >
            ✕
          </button>
        )}
      </motion.div>
    </section>
  );
}