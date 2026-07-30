import type { Metadata } from "next";
import { Cormorant_Garamond, Instrument_Sans, Space_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FrameCity — The world's skylines, framed",
  description:
    "We translate real cities into refined 3D models — soft monochrome, solid wood, made to sit quietly on a shelf or a wall for years.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${instrument.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          // Resolve theme before paint to avoid a flash of the wrong mode.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('fc-theme');if(!m){m=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',m);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
