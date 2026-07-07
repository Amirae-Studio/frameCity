"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "google" | "sending" | "sent" | "error";

export function LoginForm({
  next,
  hadError,
}: {
  next: string;
  hadError?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(hadError ? "error" : "idle");
  const [message, setMessage] = useState(
    hadError ? "That sign-in link didn't work — please try again." : ""
  );

  const callback = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    setStatus("google");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    }
    // On success the browser navigates away to Google.
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[14px] border border-cream/[0.14] bg-panel p-8 text-center"
      >
        <div
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "rgba(var(--accent-rgb), 0.14)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mb-2 font-display text-[22px] font-medium">
          Check your inbox
        </div>
        <p className="m-0 text-[13.5px] leading-[1.7] text-cream/60">
          We sent a sign-in link to <span className="text-cream">{email}</span>.
          Open it on this device to continue.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-5 text-[12.5px] text-cream/50 underline-offset-4 hover:text-cream hover:underline"
        >
          Use a different email
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={signInWithGoogle}
        disabled={status === "google"}
        className="flex w-full items-center justify-center gap-3 rounded-full bg-cream px-6 py-[15px] text-[14.5px] text-[var(--color-base)] transition-transform duration-300 hover:scale-[1.02] disabled:opacity-60"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#4285F4"
            d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.76c1.76 0 3.35.6 4.6 1.8l3.43-3.44A11.98 11.98 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76Z"
          />
        </svg>
        {status === "google" ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-cream/[0.12]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/40">
          or
        </span>
        <span className="h-px flex-1 bg-cream/[0.12]" />
      </div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-full border border-cream/[0.18] bg-transparent px-6 py-[14px] text-[14.5px] text-cream outline-none transition-colors placeholder:text-cream/35 focus:border-[color:var(--accent)]"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-full border border-cream/[0.25] px-6 py-[14px] text-[14.5px] text-cream transition-colors duration-300 hover:border-cream/50 disabled:opacity-60"
        >
          {status === "sending" ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </form>

      {status === "error" && (
        <p className="m-0 text-center text-[13px] text-[#c96f5a]">{message}</p>
      )}

      <p className="m-0 mt-2 text-center text-[12px] leading-[1.6] text-cream/40">
        No password needed — we use your Google account or a one-time email
        link.
      </p>
    </div>
  );
}
