"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface AccordionItem {
  id: number | string;
  title: string;
  content: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  className?: string;
}

export function Accordion({ items, allowMultiple = false, className = "" }: AccordionProps) {
  const [openIds, setOpenIds] = useState<(number | string)[]>([]);

  const toggleItem = (id: number | string) => {
    if (allowMultiple) {
      setOpenIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setOpenIds((prev) => (prev.includes(id) ? [] : [id]));
    }
  };

  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      {items.map((item) => {
        const isOpen = openIds.includes(item.id);
        const answerId = `accordion-content-${item.id}`;

        return (
          <div
            key={item.id}
            className={`group overflow-hidden rounded-2xl border transition-all duration-300 ${
              isOpen
                ? "border-cream/25 bg-panel shadow-lg shadow-black/40"
                : "border-cream/10 bg-panel/70 hover:border-cream/20 hover:bg-panel"
            }`}
          >
            <button
              onClick={() => toggleItem(item.id)}
              aria-expanded={isOpen}
              aria-controls={answerId}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left outline-none md:px-8 md:py-6"
            >
              <span className="font-sans text-base font-medium text-cream transition-colors duration-200 group-hover:text-cream/90 md:text-lg">
                {item.title}
              </span>

              {/* Plus / X Icon */}
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                  isOpen
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--color-base)] shadow-[0_0_12px_rgba(var(--accent-rgb),0.4)]"
                    : "border-cream/15 bg-cream/[0.05] text-cream/70 group-hover:border-cream/30 group-hover:text-cream"
                }`}
              >
                <motion.svg
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="h-4 w-4 stroke-current"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </motion.svg>
              </div>
            </button>

            {/* Expandable Content */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={answerId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-cream/[0.08] px-6 py-5 md:px-8 md:pb-6">
                    <div className="text-sm font-normal leading-relaxed text-cream/90">
                      {item.content}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}