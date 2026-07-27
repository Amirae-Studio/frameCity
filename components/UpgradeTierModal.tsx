"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

export function UpgradeTierModal({ currentTier }: { currentTier: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error" | "success">("idle");
  const [message, setMessage] = useState("");

  async function handleUpgrade(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setStatus("checking");
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.rpc("redeem_access_code", {
      p_code: code.trim(),
    });

    if (error) {
      setStatus("error");
      setMessage("Something went wrong — please try again.");
      return;
    }

    if (!data?.ok) {
      setStatus("error");
      if (data?.error === "code_already_used") {
        setMessage("This access code is invalid or inactive");
      } else if (data?.error === "code_already_redeemed_by_you") {
        setMessage("You have already redeemed this access code.");
      } else if (data?.error === "invalid_code") {
        setMessage("This access code is invalid or inactive.");
      } else {
        setMessage("Could not redeem the code. Please try again.");
      }
      return;
    }

    setStatus("success");
    setMessage(`Successfully upgraded to ${String(data.tier).toUpperCase()} tier!`);
    setTimeout(() => {
      setOpen(false);
      setCode("");
      setStatus("idle");
      router.refresh();
    }, 1200);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-1.5 rounded-full border border-cream/20 bg-cream/10 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cream transition-all duration-200 hover:border-cream/40 hover:bg-cream/20 hover:scale-[1.02]"
      >
        <span className="text-[12px]">✨</span>
        <span>Upgrade Tier</span>
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-[440px] rounded-2xl border border-cream/[0.16] bg-panel p-6 shadow-2xl text-left"
            >
              <div
                className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em]"
                style={{ color: "var(--accent)" }}
              >
                Upgrade Membership
              </div>
              <h2 className="m-0 mb-2 font-display text-[26px] font-normal text-cream leading-tight">
                Upgrade your tier.
              </h2>
              <p className="m-0 mb-6 text-[13.5px] leading-[1.6] text-cream/65">
                Current plan: <strong className="text-cream uppercase">{currentTier}</strong>. Enter a new access code to upgrade your tier and overwrite your quota.
              </p>

              <form onSubmit={handleUpgrade} className="flex flex-col gap-3">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder="FC-XXXX-XXXX"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full rounded-full border border-cream/[0.18] bg-transparent px-6 py-[12px] text-center font-mono text-[14px] uppercase tracking-[0.18em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-[color:var(--accent)]"
                />

                <button
                  type="submit"
                  disabled={status === "checking" || !code.trim()}
                  className="w-full rounded-full bg-cream py-[12px] text-[14px] font-medium text-[var(--color-base)] transition-transform duration-200 hover:scale-[1.02] disabled:opacity-50"
                >
                  {status === "checking" ? "Checking Code…" : "Redeem & Upgrade Tier"}
                </button>

                {status === "error" && (
                  <p className="m-0 text-center text-[13px] text-[#e07a5f] font-medium">
                    {message}
                  </p>
                )}

                {status === "success" && (
                  <p className="m-0 text-center text-[13px] text-emerald-400 font-medium">
                    {message}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setStatus("idle");
                    setMessage("");
                  }}
                  className="w-full rounded-full border border-cream/20 py-2.5 text-[13px] text-cream/60 hover:bg-cream/5"
                >
                  Cancel
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
