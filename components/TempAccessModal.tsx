"use client";

import { motion, AnimatePresence } from "framer-motion";

interface TempAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TempAccessModal({ isOpen, onClose }: TempAccessModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 10 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-cream/20 bg-panel p-6 shadow-2xl md:p-7"
          >
            {/* Security Badge */}
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e07a5f]/20 text-[#e07a5f]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#e07a5f]">
                Security Policy Notice
              </span>
            </div>

            {/* Title */}
            <h2 className="m-0 mb-3 font-display text-[26px] font-normal leading-tight text-cream">
              View Only Access
            </h2>

            {/* Core Message */}
            <p className="m-0 mb-6 text-[14.5px] leading-[1.65] text-cream/80">
              Due to security policy, not able to download until campaign finish.
            </p>

            {/* Contact Box */}
            <div className="mb-6 rounded-xl border border-cream/10 bg-deep/60 p-4 backdrop-blur-sm">
              <p className="m-0 mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-cream/50">
                For immediate need of models contact:
              </p>
              <div className="flex flex-col gap-2.5">
                {/* Email link */}
                <a
                  href="mailto:framecities@gmail.com"
                  className="group flex items-center justify-between rounded-lg border border-cream/15 bg-cream/5 px-4 py-2.5 text-[13.5px] text-cream no-underline transition-colors hover:border-[color:var(--accent)] hover:bg-cream/10"
                >
                  <span className="flex items-center gap-2.5 font-mono text-[13px]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-cream/60 group-hover:text-cream">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    framecities@gmail.com
                  </span>
                  <span className="text-[11px] font-mono text-cream/40 group-hover:text-cream/80">Email →</span>
                </a>

                {/* Discord link */}
                <a
                  href="https://discord.gg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-lg border border-cream/15 bg-cream/5 px-4 py-2.5 text-[13.5px] text-cream no-underline transition-colors hover:border-[#5865F2] hover:bg-[#5865F2]/10"
                >
                  <span className="flex items-center gap-2.5 font-mono text-[13px]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-[#5865F2]">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
                    </svg>
                    Discord Support
                  </span>
                  <span className="text-[11px] font-mono text-cream/40 group-hover:text-cream/80">Join →</span>
                </a>
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={onClose}
              className="w-full rounded-full bg-cream py-3 text-center text-[13.5px] font-medium text-[var(--color-base)] transition-transform duration-200 hover:scale-[1.02]"
            >
              Understood
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
