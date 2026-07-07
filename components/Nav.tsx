"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { CTA_LABEL } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { toNavUser, type NavUser } from "@/lib/user";

const links = [
  { label: "Collection", href: "#collection" },
  { label: "Craft", href: "#craft" },
  { label: "Create", href: "#create" },
  { label: "Support", href: "#support" },
];

export function Nav({ initialUser }: { initialUser: NavUser | null }) {
  const [user, setUser] = useState<NavUser | null>(initialUser);

  // Keep the nav in sync if the user signs in/out (e.g. in another tab).
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
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-50 flex items-center justify-between border-b border-cream/[0.09] bg-base/70 px-6 py-[18px] backdrop-blur-xl md:px-[52px] md:py-[22px]"
    >
      <Logo className="theme-logo h-8 md:h-9" priority />

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
            <span className="max-w-[90px] truncate text-[12.5px] text-cream/75 transition-colors group-hover:text-cream">
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
          className="group inline-flex items-center gap-2 rounded-full bg-cream px-5 py-[11px] text-[13px] text-[var(--color-base)] no-underline transition-transform duration-300 hover:scale-[1.03]"
        >
          {user ? "Studio" : CTA_LABEL}
          <span className="inline-block h-[5px] w-[5px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-[var(--color-base)] transition-transform duration-300 group-hover:translate-x-0.5" />
        </a>
      </div>
    </motion.header>
  );
}
