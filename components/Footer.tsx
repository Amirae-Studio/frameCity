import Image from "next/image";
import { Logo } from "./Logo";

const columns = [
  {
    title: "Shop",
    links: [
      { label: "Collection", href: "#collection" },
      { label: "Configurator", href: "#create" },
      { label: "The film", href: "#film" },
      { label: "Back us", href: "#support" },
    ],
  },
  {
    title: "Studio",
    links: [
      { label: "Our craft", href: "#craft" },
      { label: "Materials", href: "#" },
      { label: "Journal", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      id="about"
      className="relative overflow-hidden border-t border-cream/[0.12] bg-deep px-6 pb-[54px] pt-[70px] md:px-[52px]"
    >
      <div className="relative z-10 flex flex-wrap justify-between gap-12">
        <div className="max-w-[300px]">
          <Logo className="theme-logo mb-5 h-9" />
          <p className="m-0 text-[13.5px] leading-[1.7] text-cream/70">
            Refined 3D city models, modelled and framed by hand.
          </p>
        </div>
        <div className="flex flex-wrap gap-16">
          {columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-cream/70">
                {col.title}
              </div>
              {col.links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="text-[13.5px] text-cream/70 no-underline transition-colors duration-200 hover:text-cream"
                >
                  {l.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="relative z-10 mt-14 flex flex-wrap justify-between gap-[14px] border-t border-cream/10 pt-6 font-mono text-[12px] text-cream/70">
        <span>© 2026 FrameCity Studio</span>
        <span>Cities, kept calm.</span>
      </div>

      {/* Oversized wordmark — subtle design element anchoring the footer */}
      <div
        aria-hidden
        className="pointer-events-none relative z-0 mt-12 -mb-[30px] select-none md:mt-16 md:-mb-[42px]"
      >
        <Image
          src="/footerlogo.webp"
          alt=""
          width={1399}
          height={264}
          className="theme-logo h-auto w-full opacity-[0.07] [mask-image:linear-gradient(to_bottom,#000_35%,transparent)]"
        />
      </div>
    </footer>
  );
}
