"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useScroll } from "framer-motion";
import { useTheme } from "@/lib/theme";

export function Hero() {
  const containerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const { mode } = useTheme();
  const isLight = mode === "light";

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback: video remains muted and plays
      });
    }
  }, []);

  // Reload video when theme changes so the correct source is used
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [mode]);

  // Scroll parallax
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const textParallaxY = useTransform(scrollYProgress, [0, 1], ["0%", "24%"]);
  const imageParallaxY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  // Smooth mouse tilt interaction
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 120 };
  const smoothRotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [6, -6]), springConfig);
  const smoothRotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), springConfig);
  const smoothTranslateX = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), springConfig);
  const smoothTranslateY = useSpring(useTransform(mouseY, [-0.5, 0.5], [-8, 8]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      // Used min-h-[100svh] for better mobile browser height calculation (ignoring URL bars)
      className={`relative min-h-[100svh] md:min-h-[96vh] w-full overflow-hidden flex flex-col justify-between px-5 py-7 sm:px-10 sm:py-9 md:px-14 md:py-10 select-none transition-colors duration-500 ${
        isLight
          ? "bg-[var(--color-base)] text-[var(--color-cream)] border-b border-black/[0.07]"
          : "force-dark bg-[black] text-[#f2efe9] border-b border-white/[0.07]"
      }`}
    >
      {/* Ambient background accent aura & subtle grain */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className={`absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[450px] w-[700px] max-w-full rounded-full blur-[90px] ${
          isLight
            ? "bg-[radial-gradient(ellipse_at_center,_rgba(var(--accent-rgb),0.14)_0%,_rgba(var(--accent-rgb),0.04)_45%,_transparent_75%)]"
            : "bg-[radial-gradient(ellipse_at_center,_rgba(var(--accent-rgb),0.1)_0%,_rgba(var(--accent-rgb),0.02)_45%,_transparent_75%)]"
        }`} />
        <div className={`absolute inset-0 [background-size:32px_32px] ${
          isLight
            ? "bg-[radial-gradient(#000000_1px,transparent_1px)] opacity-[0.03]"
            : "bg-[radial-gradient(#ffffff_1px,transparent_1px)] opacity-[0.02]"
        }`} />
      </div>

      {/* ── TOP HEADER / EYEBROW ROW ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 flex flex-col gap-5 sm:gap-4 md:flex-row md:items-start md:justify-between w-full"
      >
        {/* Top-Left Statement (Fixed max-w class for mobile) */}
        <div className="max-w-[280px] sm:max-w-[320px]">
          <p className="text-[10.5px] sm:text-[11.5px] leading-[1.5] text-cream/70 font-mono tracking-wide uppercase">
            An independent studio crafting precision 1:1000 architectural cityscapes in gallery-grade frames.
          </p>
        </div>

        {/* Top-Right Gothic Brand Wordmark */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <a
            href="/"
            aria-label="FrameCity Home"
            className="font-gothic text-[28px] sm:text-[32px] md:text-[36px] leading-none text-[var(--accent)] tracking-wider no-underline hover:opacity-90 transition-all drop-shadow-[0_2px_12px_rgba(var(--accent-rgb),0.28)]"
          >
            FrameCity
          </a>
        </div>
      </motion.div>

      {/* ── CENTER HERO STAGE ── */}
      <motion.div
        style={{ opacity: heroOpacity }}
        className="relative z-10 my-auto flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[520px] md:min-h-[580px] w-full py-8 md:py-12"
      >
        {/* Removed whitespace-nowrap, added leading-tight to support text wrapping gracefully */}
        <h1
          className="font-gothic text-[44px] xs:text-[52px] sm:text-[76px] md:text-[96px] lg:text-[102px] leading-[1.05] tracking-tight text-center gold-display-text select-none transition-all duration-500 py-3 px-2 inline-block max-w-[95vw] md:max-w-[1200px]"
        >
          High detailed cities in frames
        </h1>

        {/* 3D Architectural City Model with Interactive Parallax */}
        <motion.div
          style={{
            y: imageParallaxY,
            rotateX: smoothRotateX,
            rotateY: smoothRotateY,
            x: smoothTranslateX,
            translateY: smoothTranslateY,
            transformPerspective: 1200,
          }}
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          // Tamed negative margins scaling to prevent overlapping fully on wrapped text
          className="relative z-10 w-full max-w-full -mt-6 xs:-mt-10 sm:-mt-16 md:-mt-32 lg:-mt-54 pointer-events-none flex items-center justify-center"
        >
          {/* Ambient Glow immediately behind city model */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] md:w-[80%] h-[55%] bg-[var(--accent)]/10 blur-[70px] rounded-full pointer-events-none" />

          {/* City Model Video */}
          <div className={`relative w-full flex items-center justify-center filter ${
            isLight
              ? "drop-shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
              : "drop-shadow-[0_20px_60px_rgba(0,0,0,0.95)]"
          }`}>
            <video
              ref={videoRef}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              poster="/hero-city.jpg"
              // Added max-h-[50vh] md:max-h-[70vh] so tall phone screens don't stretch the video awkwardly 
              className="w-full max-w-6xl h-auto max-h-[45vh] sm:max-h-[55vh] md:max-h-[85vh] object-contain pointer-events-auto"
              style={{
                maskImage: "linear-gradient(to bottom, black 0%, black 84%, rgba(0,0,0,0.6) 92%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 84%, rgba(0,0,0,0.6) 92%, transparent 100%)",
              }}
            >
              <source
                src={
                  isLight
                    ? "https://joewkzjnrikotpgzyywh.supabase.co/storage/v1/object/public/gallery/videos/hero-animation-white.webm"
                    : "https://joewkzjnrikotpgzyywh.supabase.co/storage/v1/object/public/gallery/videos/hero-animation.webm"
                }
                type="video/webm"
              />
              <source src="/hero-animation.webm" type="video/webm" />
            </video>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}