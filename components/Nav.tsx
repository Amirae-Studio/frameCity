"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { usePathname } from "next/navigation";
import { toNavUser, type NavUser } from "@/lib/user";
import { Button } from "./ui/Button";

export function Nav({ initialUser }: { initialUser: NavUser | null }) {
  const [user, setUser] = useState<NavUser | null>(initialUser);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const pathname = usePathname();
  const isHome = pathname === "/";

  const links = [
    { label: "Craft", href: isHome ? "#craft" : "/#craft" },
    { label: "Milestones", href: isHome ? "#milestones" : "/#milestones" },
    { label: "Create", href: isHome ? "#create" : "/#create" },
    { label: "Gallery", href: "/gallery" },
    { label: "Support", href: isHome ? "#support" : "/#support" },
    { label: "FAQ", href: isHome ? "#faq" : "/#faq" },
  ];

  // Close mobile menu when pathname changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Keep the nav in sync if the user signs in/out
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toNavUser(session?.user ?? null));
    });
    return () => subscription.unsubscribe();
  }, []);

  // Framer Motion variants for mobile menu
  const menuVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: {
      opacity: 1,
      height: "auto",
      transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.04 },
    },
    exit: { opacity: 0, height: 0, transition: { duration: 0.3, ease: "easeInOut" } },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: "easeOut" } },
  };

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 w-full  bg-base/50 backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,0,0,0.05)]"
    >
      <div className="flex w-full items-center justify-between px-6 py-4 md:px-12 md:py-5">
        <a href="/" aria-label="FrameCity Home" className="flex items-center z-10 no-underline">
          <Logo className="theme-logo h-8 md:h-10 transition-all duration-300 hover:scale-105 hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]" priority />
        </a>

        {/* Desktop Navigation Links with Volumetric Hover Pill */}
        <nav className="hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:flex items-center gap-1.5">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onMouseEnter={() => setHoveredLink(l.href)}
              onMouseLeave={() => setHoveredLink(null)}
              className="relative px-4 py-2 text-[13.5px] font-medium text-cream/90 no-underline transition-all duration-300 hover:text-cream hover:drop-shadow-md"
            >
              {hoveredLink === l.href && (
                <motion.div
                  layoutId="nav-hover-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-white/15 to-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] border border-white/10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{l.label}</span>
            </a>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3 md:gap-4 z-10">
          {user ? (
            <Button
              href="/account"
              variant="none"
              title={`Signed in as ${user.email}`}
              className="group flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 no-underline transition-all duration-300 hover:border-white/30 hover:bg-white/5 hover:shadow-[0_0_12px_rgba(255,255,255,0.05)]"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover shadow-inner"
                />
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-[var(--color-base)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                  style={{ background: "var(--accent)" }}
                >
                  {user.initial}
                </span>
              )}
              <span className="max-w-[80px] truncate text-[12.5px] font-medium text-cream/90 transition-colors group-hover:text-cream hidden sm:inline">
                {user.name}
              </span>
            </Button>
          ) : (
            <Button
              href="/login"
              className="hidden text-[13px] font-medium text-cream/90 no-underline transition-colors hover:text-cream hover:drop-shadow-md sm:inline px-2"
            >
              Sign in
            </Button>
          )}

          <div className="hidden sm:block h-4 w-[1px] bg-gradient-to-b from-transparent via-white/20 to-transparent mx-1" />

          <ThemeToggle />

          <Button
            href="/studio"
            variant="none"
            className="group hidden sm:inline-flex items-center gap-2 rounded-full bg-white px-5 py-[9px] text-[13px] font-bold text-black no-underline transition-all duration-300 hover:scale-105 hover:shadow-[0_0_24px_rgba(255,255,255,0.4)] active:scale-95"
          >
            Studio
            <span className="inline-block h-[5px] w-[5px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-black transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
          </Button>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-cream transition-all duration-300 hover:bg-white/10 hover:text-cream md:hidden"
          >
            <div className="relative h-[12px] w-3.5 flex flex-col justify-between">
              <span
                className={`h-[1.5px] w-full bg-current rounded-full transition-transform duration-300 origin-center ${
                  isOpen ? "translate-y-[5px] rotate-45 bg-white" : ""
                }`}
              />
              <span
                className={`h-[1.5px] w-full bg-current rounded-full transition-opacity duration-300 ${
                  isOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`h-[1.5px] w-full bg-current rounded-full transition-transform duration-300 origin-center ${
                  isOpen ? "-translate-y-[5.25px] -rotate-45 bg-white" : ""
                }`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Navigation - Alive Edge to Edge Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-0 right-0 top-full overflow-hidden border-b border-white/[0.05] bg-base/95 backdrop-blur-3xl md:hidden shadow-2xl"
          >
            <div className="flex flex-col gap-2 px-6 py-6">
              {links.map((l) => (
                <motion.a
                  variants={itemVariants}
                  key={l.href}
                  href={l.href}
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl py-3 text-[16px] font-medium text-cream/90 no-underline transition-all duration-300 hover:translate-x-1 hover:text-cream"
                >
                  {l.label}
                </motion.a>
              ))}

              <motion.div 
                variants={itemVariants} 
                className="my-4 h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" 
              />

              <motion.div variants={itemVariants} className="flex flex-col gap-4 pb-2">
                {!user && (
                  <a
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="py-2 text-[16px] font-medium text-cream/90 no-underline transition-all hover:translate-x-1 hover:text-cream"
                  >
                    Sign in
                  </a>
                )}

                <Button
                  href="/studio"
                  onClick={() => setIsOpen(false)}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-[15px] font-bold text-black no-underline active:scale-[0.98] transition-all hover:shadow-[0_0_24px_rgba(255,255,255,0.3)]"
                >
                  Studio
                  <span className="inline-block h-[5px] w-[5px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-black transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}