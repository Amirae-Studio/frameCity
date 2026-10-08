"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface BackerCrowdfundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenConnectModal?: () => void;
}

export const MAKERWORLD_CROWDFUND_URL =
  "https://makerworld.com/en/crowdfunding/313-framecity-high-detailed-cities-in-frames";

export const KICKSTARTER_CAMPAIGN_URL =
  "https://www.kickstarter.com/projects/amirae-studio/framecity-high-detailed-cities-in-frames?ref=discover_saved_projects&category_id=331";

export function BackerCrowdfundModal({
  isOpen,
  onClose,
  onOpenConnectModal,
}: BackerCrowdfundModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 14 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[500px] overflow-hidden rounded-2xl border border-cream/20 bg-panel p-6 shadow-2xl text-cream md:p-8"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-cream/15 text-cream/50 transition-colors hover:border-cream/40 hover:text-cream cursor-pointer"
              aria-label="Close modal"
            >
              ✕
            </button>

            {/* Badge */}
            {/* <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                Crowdfunding Exclusive
              </span>
            </div> */}

            {/* Title */}
            <h2 className="m-0 mb-2 font-display text-[26px] md:text-[28px] font-normal leading-tight text-cream">
              Unlock Model Downloads
            </h2>

            {/* Subtitle */}
            <p className="m-0 mb-6 text-[14px] leading-[1.65] text-cream/75">
              You are currently in <strong className="text-cream">3D View Only mode</strong>. You can freely explore, rotate, and customize city colors. To download high-precision <strong className="text-cream">.3MF</strong> and <strong className="text-cream">.STL</strong> print files, back our campaign on MakerWorld or Kickstarter.
            </p>

            {/* Platform Buttons */}
            <div className="flex flex-col gap-3 mb-6">
              {/* MakerWorld Button */}
              <a
                href={MAKERWORLD_CROWDFUND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 p-4 text-cream no-underline transition-all duration-300 hover:border-emerald-400 hover:shadow-[0_0_24px_rgba(34,197,94,0.25)] hover:scale-[1.01]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-md">
                    {/* Bambu / MakerWorld icon glyph */}
                    {/* <svg
                      className="h-5 w-5 fill-current"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg> */}
                    <img src="https://media.printables.com/media/prints/1109159/images/8380670_58562b00-5401-4df9-b05c-74902a99949e_3ddf513d-d81f-4f0e-a4a0-d52fc719dca6/thumbs/cover/320x240/jpeg/makerworldphotologo.webp"alt="makerworld"width={50}height={50}/>
                  </div>
                  <div className="text-left">
                    <div className="text-[14.5px] font-semibold text-cream group-hover:text-white flex items-center gap-1.5">
                      Back us on MakerWorld
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[9.5px] font-bold text-emerald-400">
                        Active
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-cream/60">
                      Late pledge rewards & instant access codes
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[12px] text-emerald-400 transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </a>

              {/* Kickstarter Button */}
              <a
                href={KICKSTARTER_CAMPAIGN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex items-center justify-between overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-r from-sky-950/30 to-blue-900/20 p-4 text-cream no-underline transition-all duration-300 hover:border-sky-400 hover:shadow-[0_0_24px_rgba(56,189,248,0.2)] hover:scale-[1.01]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ffff] text-black font-extrabold text-[17px] shadow-md">
                    <img src="https://1000logos.net/wp-content/uploads/2023/01/Kickstarter-logo.png"alt="kickstarter"width={50}height={50}/>
                  </div>
                  <div className="text-left">
                    <div className="text-[14.5px] font-semibold text-cream group-hover:text-white flex items-center gap-1.5">
                      Back us on Kickstarter
                    </div>
                    <div className="font-mono text-[11px] text-cream/60">
                      Support our global project on Kickstarter
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[12px] text-[#05ce78] transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </a>
            </div>

            {/* Footer helper */}
            <div className="border-t border-cream/10 pt-4 text-center">
              <p className="m-0 mb-3 text-[12.5px] text-cream/60">
                Already backed the campaign?{" "}
                {onOpenConnectModal ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenConnectModal();
                    }}
                    className="font-medium text-[var(--accent)] underline underline-offset-4 hover:brightness-125 cursor-pointer bg-transparent border-none p-0"
                  >
                    Enter your access code to unlock
                  </button>
                ) : (
                  <Link
                    href="/account"
                    className="font-medium text-cream underline decoration-cream/40 underline-offset-4 hover:decoration-cream"
                  >
                    Enter your access code in Account Settings
                  </Link>
                )}
              </p>
              <button
                onClick={onClose}
                className="w-full rounded-full border border-cream/15 bg-transparent py-2.5 font-mono text-[12px] text-cream/70 transition-colors hover:bg-cream/5 hover:text-cream cursor-pointer"
              >
                Continue Exploring in 3D Preview
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
