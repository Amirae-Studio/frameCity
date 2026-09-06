"use client";

import React from "react";

type ButtonBaseProps = {
  variant?: "primary" | "secondary" | "none";
  children: React.ReactNode;
  className?: string;
};

type AnchorProps = ButtonBaseProps &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

type NativeButtonProps = ButtonBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type ButtonProps = AnchorProps | NativeButtonProps;

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center rounded-full font-medium transition-all duration-300 text-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100";

  const variants = {
    primary:
      "bg-cream px-6 py-[14px] text-[14.5px] text-[var(--color-base)] hover:scale-[1.02]",
    secondary:
      "border border-cream/[0.28] bg-cream/[0.04] backdrop-blur-sm px-6 py-[14px] text-[14.5px] text-cream hover:border-cream/60 hover:bg-cream/[0.08]",
    none: "",
  };

  const combinedClasses = `${baseStyles} ${variants[variant]} ${className}`.trim();

  if ("href" in props && props.href) {
    const { href, ...anchorProps } = props as AnchorProps;
    return (
      <a href={href} className={combinedClasses} {...anchorProps}>
        {children}
      </a>
    );
  }

  return (
    <button className={combinedClasses} {...(props as NativeButtonProps)}>
      {children}
    </button>
  );
}