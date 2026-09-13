"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  verifyMakerWorldUsername,
  redeemBackerAccessCode,
  type BackerTier,
} from "@/app/studio/actions";
import { Button } from "./ui/Button";

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

export function AccessGate({ email }: { email: string }) {
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
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
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
        setUsernameError(verifyRes.error || "MakerWorld username not found in backer list.");
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

    // Profile now has access — re-render the studio server component.
    router.refresh();
  }

  const tierMeta = verifiedTier ? TIER_CONFIG[verifiedTier] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[440px]"
    >
      <div
        className="mb-[18px] text-center font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
        style={{ color: "var(--accent)" }}
      >
        One last step
      </div>
      <h1 className="m-0 mb-3 text-center font-display text-[36px] font-normal leading-[1.05]">
        Enter your access code.
      </h1>
      <p className="m-0 mb-8 text-center text-[14.5px] leading-[1.7] text-cream/[0.62]">
        You&apos;ll find it with your MakerWorld reward — it unlocks the studio
        for <span className="text-cream">{email}</span>, once, forever.
      </p>

      <form
        onSubmit={redeem}
        className="flex flex-col gap-4 rounded-[14px] border border-cream/[0.14] bg-panel p-6"
      >
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cream/70">
              MakerWorld Username
            </label>
            {usernameStatus === "checking" && (
              <span className="font-mono text-[10px] text-amber-400 animate-pulse">
                Checking backer ...
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
          <div className="relative">
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
              className={`w-full rounded-full border bg-transparent px-5 py-[12px] font-mono text-[14px] text-cream outline-none transition-colors placeholder:text-cream/30 ${
                usernameStatus === "valid"
                  ? "border-emerald-500/60 focus:border-emerald-400"
                  : usernameStatus === "invalid"
                  ? "border-[#c96f5a]/60 focus:border-[#c96f5a]"
                  : "border-cream/[0.18] focus:border-[color:var(--accent)]"
              }`}
            />
          </div>

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
            className="w-full rounded-full border border-cream/[0.18] bg-transparent px-5 py-[12px] text-center font-mono text-[15px] uppercase tracking-[0.18em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-[color:var(--accent)]"
          />
        </div>

        <Button
          type="submit"
          disabled={
            status === "checking" ||
            usernameStatus === "checking" ||
            usernameStatus === "invalid" ||
            !code.trim() ||
            !makerworldName.trim()
          }
          className="mt-1 w-full rounded-full bg-cream px-6 py-[14px] text-[14.5px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.02] disabled:opacity-50"
        >
          {status === "checking" ? "Unlocking…" : "Unlock the studio"}
        </Button>
        {status === "error" && (
          <p className="m-0 text-center text-[13px] text-[#c96f5a] bg-[#c96f5a]/10 border border-[#c96f5a]/25 rounded-xl p-3 leading-relaxed">
            {message}
          </p>
        )}
        <Button
          type="button"
          onClick={() => router.push("/")}
          className="w-full rounded-full border border-cream/20 bg-transparent px-6 py-[12px] text-[14px] text-cream transition-colors hover:bg-cream/10 disabled:opacity-50"
        >
          Back to Home
        </Button>
      </form>

      <p className="m-0 mt-6 text-center text-[12.5px] leading-[1.7] text-cream/40">
        Don&apos;t have a code yet? Back the campaign on MakerWorld and one
        arrives with your reward.
      </p>
    </motion.div>
  );
}



