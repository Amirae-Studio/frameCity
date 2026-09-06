"use client";

import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Logo } from "./Logo";
import { Reveal } from "./Reveal";
import { label } from "framer-motion/client";

const EASE = [0.22, 1, 0.36, 1] as const;

const navigationColumns = [
  {
    title: "Explore",
    links: [
      { label: "Gallery", href: "/gallery" },
      { label: "Custom Request", href: "#create" },
      { label: "Featured Cities", href: "#craft" },
      { label: "Crowdfunding", href: "https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames" },
      { label: "FAQ", href: "#faq" },
    ],
  },
];

const socialLinks = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/amirae__studio/",
    icon: (
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    label: "Discord",
    href: "https://discord.com/channels/1529705981926182953",
    icon: (
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.893.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    label: "MakerWorld",
    href: "https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames",
    icon: (
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    label: "Email Support",
    href: "mailto:framecities@gmail.com",
    icon: (
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
];

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ["start end", "end end"],
  });

  const wordmarkY = useTransform(scrollYProgress, [0, 1], ["20px", "-10px"]);
  const wordmarkOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.08, 0.12]);

  return (
    <footer
      ref={footerRef}
      id="about"
      className="relative overflow-hidden border-t border-cream/[0.12] bg-deep px-6 pt-16 pb-8 md:px-[52px] md:pt-20"
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Main Grid Section */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 pb-16 border-b border-cream/10">
          
          {/* Brand Info */}
          <Reveal variant="fade-up" className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div>
              <Logo className="theme-logo mb-4 h-8 w-auto" />
              <p className="max-w-[340px] text-sm leading-relaxed text-cream/70 m-0">
                Crafting 1:1000 scale architectural relief models into elegant, gallery-grade framed art. Preserving spatial memories for your space.
              </p>
            </div>

            {/* Direct Studio Email Badge */}
            <div className="inline-flex items-center gap-3 w-fit rounded-full border border-cream/15 bg-cream/[0.03] px-4 py-2 backdrop-blur-sm">
             
              <span className="font-mono text-xs text-cream/80">
                Studio Enquiries: <a href="mailto:framecities@gmail.com" className="text-cream underline underline-offset-4 hover:text-[var(--accent)] transition-colors">framecities@gmail.com</a>
              </span>
            </div>
          </Reveal>

          {/* Links Section */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-8">
            {navigationColumns.map((col, colIdx) => (
              <motion.div
                key={col.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.6, delay: 0.1 + colIdx * 0.1, ease: EASE }}
                className="flex flex-col gap-3"
              >
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cream/50 mb-1">
                  {col.title}
                </span>
                {col.links.map((l, li) => (
                  <motion.a
                    key={l.label}
                    href={l.href}
                    target={l.href.startsWith("http") ? "_blank" : "_self"}
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, x: -6 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.4,
                      delay: 0.2 + colIdx * 0.1 + li * 0.05,
                      ease: EASE,
                    }}
                    className="text-sm text-cream/70 no-underline transition-colors duration-200 hover:text-cream hover:translate-x-1 inline-block"
                  >
                    {l.label}
                  </motion.a>
                ))}
              </motion.div>
            ))}

            {/* Socials column with Icons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
              className="flex flex-col gap-3"
            >
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cream/50 mb-1">
                Socials
              </span>
              {socialLinks.map((s, si) => (
                <motion.a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -6 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: 0.3 + si * 0.05,
                    ease: EASE,
                  }}
                  className="flex items-center gap-2.5 text-sm text-cream/70 no-underline transition-colors duration-200 hover:text-cream group"
                >
                  <span className="text-cream/50 transition-colors group-hover:text-cream">
                    {s.icon}
                  </span>
                  <span>{s.label}</span>
                </motion.a>
              ))}
            </motion.div>
          </div>

          {/* Quick Note / Motto */}
          <Reveal variant="fade-up" className="lg:col-span-3 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-cream/10 pt-8 lg:pt-0 lg:pl-8 space-y-4">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cream/50 block mb-2">
                Crafted On Demand
              </span>
              <p className="text-xs leading-relaxed text-cream/60 m-0">
                Every frame is custom modeled, precision finished, and carefully packaged by Amiraé Studio.
              </p>
            </div>
            <div className="font-mono text-[11px] text-cream/40">
              Handcrafted Precision • 1:1000 Scale
            </div>
          </Reveal>

        </div>

        {/* Sub-Footer Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 font-mono text-xs text-cream/50">
          <div>© 2026 FrameCity Studio. All rights reserved.</div>
          <div className="flex items-center gap-6">
            <span>Designed by Amiraé Studio</span>
            <span className="hidden sm:inline">•</span>
            <span className="text-cream/70">Cities, kept calm.</span>
          </div>
        </div>
      </div>

      {/* Oversized background wordmark */}
      <motion.div
        aria-hidden
        style={{ y: wordmarkY, opacity: wordmarkOpacity }}
        className="pointer-events-none relative z-0 mt-8 -mb-12 select-none"
      >
        <Image
          src="/footerlogo.webp"
          alt=""
          width={1399}
          height={264}
          className="theme-logo h-auto w-full [mask-image:linear-gradient(to_bottom,#000_40%,transparent)]"
        />
      </motion.div>
    </footer>
  );
}