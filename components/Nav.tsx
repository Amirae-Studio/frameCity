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
  const pathname = usePathname();
  const isHome = pathname === "/";

  const links = [
    { label: "Collection", href: isHome ? "#collection" : "/#collection" },
    { label: "Craft", href: isHome ? "#craft" : "/#craft" },
    { label: "Milestones", href: isHome ? "#milestones" : "/#milestones" },
    { label: "Create", href: isHome ? "#create" : "/#create" },
    { label: "Gallery", href: "/gallery" },
    { label: "Support", href: isHome ? "#support" : "/#support" },
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

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-50 flex items-center justify-between border-b border-cream/[0.09] bg-base/70 px-6 py-[18px] backdrop-blur-xl md:px-[52px] md:py-[22px]"
      >
        <a href="/" aria-label="FrameCity Home" className="no-underline flex items-center">
          <Logo className="theme-logo h-8 md:h-9" priority />
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden gap-9 text-[13.5px] text-cream/70 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative no-underline transition-colors duration-300 hover:text-cream"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* Desktop & Mobile Right Actions */}
        <div className="flex items-center gap-3 md:gap-4">
          {user ? (
            <a
              href="/account"
              title={`Signed in as ${user.email}`}
              className="group flex items-center gap-2 rounded-full border border-cream/[0.16] py-[5px] pl-[5px] pr-3 no-underline transition-colors duration-300 hover:border-cream/40"
            >
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-[var(--color-base)]"
                  style={{ background: "var(--accent)" }}
                >
                  {user.initial}
                </span>
              )}
              <span className="max-w-[90px] truncate text-[12.5px] text-cream/75 transition-colors group-hover:text-cream hidden sm:inline">
                {user.name}
              </span>
            </a>
          ) : (
            <a
              href="/login"
              className="hidden text-[13px] text-cream/70 no-underline transition-colors hover:text-cream sm:inline"
            >
              Sign in
            </a>
          )}

          <ThemeToggle />

          <a
            href="/studio"
            className="group hidden sm:inline-flex items-center gap-2 rounded-full bg-cream px-5 py-[11px] text-[13px] text-[var(--color-base)] no-underline transition-transform duration-300 hover:scale-[1.03]"
          >
            {user ? "Studio" : "Studio"}
            <span className="inline-block h-[5px] w-[5px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-[var(--color-base)] transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/[0.16] text-cream md:hidden"
          >
            <div className="relative h-3.5 w-4 flex flex-col justify-between">
              <span
                className={`h-[1.5px] w-full bg-current transition-transform duration-300 ${
                  isOpen ? "translate-y-[6px] rotate-45" : ""
                }`}
              />
              <span
                className={`h-[1.5px] w-full bg-current transition-opacity duration-300 ${
                  isOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`h-[1.5px] w-full bg-current transition-transform duration-300 ${
                  isOpen ? "-translate-y-[6px] -rotate-45" : ""
                }`}
              />
            </div>
          </button>
        </div>
      </motion.header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="sticky top-[69px] z-40 overflow-hidden border-b border-cream/[0.09] bg-base/95 backdrop-blur-2xl md:hidden"
          >
            <div className="flex flex-col gap-5 px-6 py-8">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setIsOpen(false)}
                  className="text-lg font-medium text-cream/80 no-underline transition-colors hover:text-cream"
                >
                  {l.label}
                </a>
              ))}

              <hr className="my-2 border-cream/[0.09]" />

              <div className="flex flex-col gap-4">
                {!user && (
                  <a
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="text-base text-cream/80 no-underline hover:text-cream"
                  >
                    Sign in
                  </a>
                )}

                <Button
                  href="/studio"
                  onClick={() => setIsOpen(false)}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-cream px-6 py-3 text-sm font-medium text-[var(--color-base)] no-underline"
                >
                  {user ? "Studio" :"Studio"}
                  <span className="inline-block h-[5px] w-[5px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-[var(--color-base)]" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}