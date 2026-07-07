import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";

export const metadata = {
  title: "Sign in — FrameCity",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/studio";

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="flex items-center justify-between px-6 py-[18px] md:px-[52px]">
        <Link href="/" className="inline-flex">
          <Logo className="theme-logo h-8" priority />
        </Link>
        <Link
          href="/"
          className="text-[13px] text-cream/60 no-underline transition-colors hover:text-cream"
        >
          ← Back to site
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-[400px]">
          <div
            className="mb-[18px] text-center font-mono text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: "var(--accent)" }}
          >
            The Studio
          </div>
          <h1 className="m-0 mb-3 text-center font-display text-[38px] font-normal leading-[1.05]">
            Welcome back.
          </h1>
          <p className="m-0 mb-9 text-center text-[14.5px] leading-[1.7] text-cream/[0.62]">
            Sign in to open the configurator and your backer downloads.
          </p>

          <LoginForm next={next} hadError={params.error === "auth"} />
        </div>
      </main>
    </div>
  );
}
