"use client";

import React from "react";

interface BaseInputProps {
  label: string;
  error?: string;
}

type InputProps = BaseInputProps & React.InputHTMLAttributes<HTMLInputElement>;
type TextAreaProps = BaseInputProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const baseStyle =
  "w-full rounded-xl border border-cream/20 bg-panel px-4 py-3 text-sm text-cream placeholder-cream/40 outline-none focus:border-[var(--accent)] transition-colors";

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      <label className="block font-mono text-[11px] text-cream/60 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input className={`${baseStyle} ${className}`} {...props} />
    </div>
  );
}

export function Textarea({ label, className = "", ...props }: TextAreaProps) {
  return (
    <div>
      <label className="block font-mono text-[11px] text-cream/60 uppercase tracking-wider mb-1">
        {label}
      </label>
      <textarea className={`${baseStyle} resize-none ${className}`} {...props} />
    </div>
  );
}