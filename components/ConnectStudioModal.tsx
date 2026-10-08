"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  verifyMakerWorldUsername,
  redeemBackerAccessCode,
  type BackerTier,
} from "@/app/studio/actions";
import {
  MAKERWORLD_CROWDFUND_URL,
  KICKSTARTER_CAMPAIGN_URL,
} from "./BackerCrowdfundModal";

const TIER_CONFIG: Record<
  BackerTier,
  { label: string; bg: string; color: string; border: string; desc: string }
> = {
  merchant: {
    label: "Merchant Tier",
    bg: "rgba(245, 158, 11, 0.15)",
    color: "#fbbf24",
    border: "rgba(245, 158, 11, 0.4)",
    desc: "Commercial License · Unlimited Downloads",
  },
  architect: {
    label: "Architect Tier",
    bg: "rgba(59, 130, 246, 0.15)",
    color: "#60a5fa",
    border: "rgba(59, 130, 246, 0.4)",
    desc: "Lifetime Studio Access · Unlimited Downloads",
  },
  explorer: {
    label: "Explorer Tier",
    bg: "rgba(224, 122, 95, 0.15)",
    color: "#e07a5f",
    border: "rgba(224, 122, 95, 0.4)",
    desc: "Studio Access · Up to 25 Downloads / mo",
  },
};

interface ConnectStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onSuccess?: () => void;
}

export function ConnectStudioModal({
  isOpen,
  onClose,
  email,
  onSuccess,
}: ConnectStudioModalProps) {
  const router = useRouter();
  const [makerworldName, setMakerworldName] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [usernameError, setUsernameError] = useState("");
  const [verifiedCleanName, setVerifiedCleanName] = useState<string | null>(null);
  const [verifiedTier, setVerifiedTier] = useState<BackerTier | null>(null);
  const [rawRewardTier, setRawRewardTier] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error" | "success">("idle");
  const [message, setMessage] = useState("");

  // Live debounced check as the user types their MakerWorld username
  useEffect(() => {
    const trimmed = makerworldName.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      setUsernameError("");
      setVerifiedCleanName(null);
      setVerifiedTier(null);
      setRawRewardTier(null);
      return;
    }

    setUsernameStatus("checking");
    setUsernameError("");

    const timer = setTimeout(async () => {
      const verifyRes = await verifyMakerWorldUsername(trimmed);
      if (verifyRes.ok && verifyRes.cleanName && verifyRes.tier) {
        setUsernameStatus("valid");
        setVerifiedCleanName(verifyRes.cleanName);
        setVerifiedTier(verifyRes.tier);
        setRawRewardTier(verifyRes.rawTier || null);
        setUsernameError("");
      } else {
        setUsernameStatus("invalid");
        setVerifiedCleanName(null);
        setVerifiedTier(null);
        setRawRewardTier(null);
        setUsernameError(
          verifyRes.error || "MakerWorld username not found in backer list."
        );
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [makerworldName]);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    let targetUsername = verifiedCleanName;

    // If still typing or idle, trigger an immediate verification
    if (usernameStatus !== "valid" || !targetUsername) {
      if (!makerworldName.trim()) {
        setUsernameStatus("invalid");
        setUsernameError("Please enter your MakerWorld username.");
        return;
      }
      setUsernameStatus("checking");
      const verifyRes = await verifyMakerWorldUsername(makerworldName);
      if (!verifyRes.ok || !verifyRes.cleanName || !verifyRes.tier) {
        setUsernameStatus("invalid");
        setUsernameError(
          verifyRes.error || "MakerWorld username not found in backer database."
        );
        return;
      }
      targetUsername = verifyRes.cleanName;
      setUsernameStatus("valid");
      setVerifiedCleanName(targetUsername);
      setVerifiedTier(verifyRes.tier);
      setRawRewardTier(verifyRes.rawTier || null);
    }

    setStatus("checking");
    setMessage("");

    // Execute atomic server action linking username, code, and customer tier
    const res = await redeemBackerAccessCode(code.trim(), targetUsername);

    if (!res.ok) {
      setStatus("error");
      setMessage(res.error || "Couldn't redeem the code — please try again.");
      return;
    }

    setStatus("success");
    setMessage("Studio unlocked successfully! Reloading…");
    if (onSuccess) onSuccess();
    setTimeout(() => {
      onClose();
      router.refresh();
    }, 900);
  }

  const tierMeta = verifiedTier ? TIER_CONFIG[verifiedTier] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 14 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[480px] overflow-hidden rounded-2xl border border-cream/20 bg-panel p-6 shadow-2xl text-cream md:p-8"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-cream/15 text-cream/50 transition-colors hover:border-cream/40 hover:text-cream cursor-pointer"
              aria-label="Close modal"
            >
              ✕
            </button>

            {/* Header Badge */}
            <div
              className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "var(--accent)" }}
            >
              Studio Access
            </div>

            {/* Title */}
            <h2 className="m-0 mb-2 font-display text-[28px] md:text-[32px] font-normal leading-[1.1] text-cream">
              Connect your access code.
            </h2>
            <p className="m-0 mb-6 text-[14px] leading-[1.65] text-cream/70">
              Enter your MakerWorld backer username and access code to unlock full
              studio access and downloads for <span className="text-cream font-medium">{email}</span>.
            </p>

            <form onSubmit={redeem} className="flex flex-col gap-4">
              {/* MakerWorld Username Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cream/70">
                    MakerWorld Username
                  </label>
                  {usernameStatus === "checking" && (
                    <span className="font-mono text-[10px] text-amber-400 animate-pulse">
                      Checking backer…
                    </span>
                  )}
                  {usernameStatus === "valid" && tierMeta && (
                    <span
                      className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: tierMeta.bg,
                        color: tierMeta.color,
                        border: `1px solid ${tierMeta.border}`,
                      }}
                    >
                      ✓ {tierMeta.label}
                    </span>
                  )}
                  {usernameStatus === "invalid" && (
                    <span className="font-mono text-[10px] text-[#c96f5a] font-bold">
                      ✕ Not Found
                    </span>
                  )}
                </div>
                <input
                  value={makerworldName}
                  onChange={(e) => {
                    setMakerworldName(e.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder="e.g. user_2521122109 or @username"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className={`w-full rounded-full border bg-transparent px-5 py-[11px] font-mono text-[13.5px] text-cream outline-none transition-colors placeholder:text-cream/30 ${
                    usernameStatus === "valid"
                      ? "border-emerald-500/60 focus:border-emerald-400"
                      : usernameStatus === "invalid"
                      ? "border-[#c96f5a]/60 focus:border-[#c96f5a]"
                      : "border-cream/[0.18] focus:border-[color:var(--accent)]"
                  }`}
                />

                {usernameStatus === "valid" && verifiedCleanName && tierMeta && (
                  <div className="mt-2.5 rounded-xl border border-cream/[0.1] bg-cream/[0.03] p-3 text-left">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-cream/80">
                        Backer: <strong className="text-cream">@{verifiedCleanName}</strong>
                      </span>
                      <span
                        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: tierMeta.color }}
                      >
                        {rawRewardTier || tierMeta.label}
                      </span>
                    </div>
                    <p className="m-0 mt-1 font-mono text-[10.5px] text-cream/50">
                      {tierMeta.desc}
                    </p>
                  </div>
                )}

                {usernameStatus === "invalid" && usernameError && (
                  <p className="m-0 mt-1.5 text-left text-[12px] text-[#c96f5a]">
                    {usernameError}
                  </p>
                )}
              </div>

              {/* Access Code Field */}
              <div>
                <label className="mb-1.5 block text-left font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cream/70">
                  Studio Access Code
                </label>
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder="FC-XXXX-XXXX"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full rounded-full border border-cream/[0.18] bg-transparent px-5 py-[11px] text-center font-mono text-[14.5px] uppercase tracking-[0.18em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-[color:var(--accent)]"
                />
              </div>

              {/* Status Message */}
              {status === "error" && (
                <p className="m-0 text-center text-[12.5px] text-[#c96f5a] bg-[#c96f5a]/10 border border-[#c96f5a]/25 rounded-xl p-3 leading-relaxed">
                  {message}
                </p>
              )}
              {status === "success" && (
                <p className="m-0 text-center text-[13px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 leading-relaxed font-medium">
                  {message}
                </p>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  status === "checking" ||
                  usernameStatus === "checking" ||
                  usernameStatus === "invalid" ||
                  !code.trim() ||
                  !makerworldName.trim()
                }
                className="w-full rounded-full bg-cream px-6 py-[13px] text-[14px] font-semibold text-[var(--color-base)] transition-transform duration-200 hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
              >
                {status === "checking" ? "Unlocking…" : "Unlock Studio Access"}
              </button>

              {/* Explore in View Only Mode Button */}
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border border-cream/20 bg-cream/5 px-6 py-[12px] text-[13.5px] font-medium text-cream transition-all duration-200 hover:bg-cream/15 hover:border-cream/35 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Explore 3D Models (View Only)</span>
                <span className="font-mono text-cream/50">→</span>
              </button>
            </form>

            {/* Backer Links Footer */}
            <div className="mt-5 border-t border-cream/10 pt-4 text-center">
              <p className="m-0 mb-3 text-[12px] text-cream/50">
                Don&apos;t have an access code yet? Support our crowdfunding campaign:
              </p>
              <div className="flex items-center justify-center gap-4 text-[12.5px]">
                <a
                  href={MAKERWORLD_CROWDFUND_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-400 underline decoration-emerald-500/30 underline-offset-4 hover:decoration-emerald-400"
                >
                  MakerWorld Campaign →
                </a>
                <span className="text-cream/20">·</span>
                <a
                  href={KICKSTARTER_CAMPAIGN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#05ce78] underline decoration-[#05ce78]/30 underline-offset-4 hover:decoration-[#05ce78]"
                >
                  Kickstarter Campaign →
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
