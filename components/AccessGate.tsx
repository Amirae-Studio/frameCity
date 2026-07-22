"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

export function AccessGate({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [message, setMessage] = useState("");

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setStatus("checking");

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
      setMessage(
        data?.error === "invalid_code"
          ? "That code isn't valid or has already been used."
          : "Couldn't redeem the code — please try again."
      );
      return;
    }

    // Profile now has access — re-render the server component.
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[420px]"
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
        className="flex flex-col gap-3 rounded-[14px] border border-cream/[0.14] bg-panel p-6"
      >
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
          className="w-full rounded-full border border-cream/[0.18] bg-transparent px-6 py-[14px] text-center font-mono text-[15px] uppercase tracking-[0.18em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-[color:var(--accent)]"
        />
        <button
          type="submit"
          disabled={status === "checking" || !code.trim()}
          className="w-full rounded-full bg-cream px-6 py-[14px] text-[14.5px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.02] disabled:opacity-50"
        >
          {status === "checking" ? "Checking…" : "Unlock the studio"}
        </button>
        {status === "error" && (
          <p className="m-0 text-center text-[13px] text-[#c96f5a]">{message}</p>
        )}
        <button
          onClick={() => router.push("/")}
          className="w-full rounded-full bg-cream px-6 py-[14px] text-[14.5px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.02] disabled:opacity-50"
        >
          Back to Home
        </button>
      </form>

      <p className="m-0 mt-6 text-center text-[12.5px] leading-[1.7] text-cream/40">
        Don&apos;t have a code yet? Back the campaign on MakerWorld and one
        arrives with your reward.
      </p>
    </motion.div>
  );
}
