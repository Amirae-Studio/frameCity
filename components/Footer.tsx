"use client";

import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Logo } from "./Logo";
import { Reveal } from "./Reveal";

const EASE = [0.22, 1, 0.36, 1] as const;

const columns = [
  {
    title: "Shop",
    links: [
      { label: "Collection", href: "#collection" },
      { label: "Configurator", href: "#create" },
      { label: "The film", href: "#film" },
      { label: "Back us", href: "#support" },
    ],
  },
  {
    title: "Studio",
    links: [
      { label: "Our craft", href: "#craft" },
      { label: "Materials", href: "#" },
      { label: "Journal", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);

  // Slow upward wordmark drift on scroll
  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ["start end", "end end"],
  });
  const wordmarkY = useTransform(scrollYProgress, [0, 1], ["12px", "-24px"]);
  const wordmarkOpacity = useTransform(scrollYProgress, [0, 0.4, 1], [0, 0.07, 0.07]);

  return (
    <footer
      ref={footerRef}
      id="about"
      className="relative overflow-hidden border-t border-cream/[0.12] bg-deep px-6 pb-[54px] pt-[70px] md:px-[52px]"
    >
      <div className="relative z-10 flex flex-wrap justify-between gap-12">
        {/* Brand blurb */}
        <Reveal variant="fade-up">
          <div className="max-w-[300px]">
            <Logo className="theme-logo mb-5 h-9" />
            <p className="m-0 text-[13.5px] leading-[1.7] text-cream/70">
              Refined 3D city models, modelled and framed by hand.
            </p>
          </div>
        </Reveal>

        {/* Link columns — staggered */}
        <div className="flex flex-wrap gap-16">
          {columns.map((col, colIdx) => (
            <motion.div
              key={col.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: 0.15 + colIdx * 0.1, ease: EASE }}
              className="flex flex-col gap-3"
            >
              <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-cream/70">
                {col.title}
              </div>
              {col.links.map((l, li) => (
                <motion.a
                  key={l.label}
                  href={l.href}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.45,
                    delay: 0.25 + colIdx * 0.1 + li * 0.06,
                    ease: EASE,
                  }}
                  className="text-[13.5px] text-cream/70 no-underline transition-colors duration-200 hover:text-cream"
                >
                  {l.label}
                </motion.a>
              ))}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <Reveal variant="fade-up" delay={3} className="relative z-10 mt-14 flex flex-wrap justify-between gap-[14px] border-t border-cream/10 pt-6 font-mono text-[12px] text-cream/70">
        <span>© 2026 FrameCity Studio</span>
        <span>Cities, kept calm.</span>
      </Reveal>

      {/* Oversized wordmark — parallax drift on scroll */}
      <motion.div
        aria-hidden
        style={{ y: wordmarkY, opacity: wordmarkOpacity }}
        className="pointer-events-none relative z-0 mt-12 -mb-[30px] select-none md:mt-16 md:-mb-[42px]"
      >
        <Image
          src="/footerlogo.webp"
          alt=""
          width={1399}
          height={264}
          className="theme-logo h-auto w-full [mask-image:linear-gradient(to_bottom,#000_35%,transparent)]"
        />
      </motion.div>
    </footer>
  );
}
