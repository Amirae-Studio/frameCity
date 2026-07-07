# FrameCity

Marketing/landing site for **FrameCity** — refined, hand-modelled 3D city models set into solid wood frames. Ported from a Claude Design (`FrameCity.dc.html`) mockup into a modern web stack.

## Stack

- **Next.js 15** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` tokens)
- **Framer Motion** for scroll reveals, the hero intro, the marquee, and micro-interactions

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Structure

```
app/
  layout.tsx      # fonts (Cormorant Garamond / Instrument Sans / Space Mono) + ThemeProvider
  page.tsx        # section composition
  globals.css     # Tailwind v4 @theme tokens, marquee keyframes, scrollbar
components/
  Nav, Hero, Marquee, Collection, Film, Craft, Configurator, Support, Footer
  AccentControl   # live theme control (accent color + show/hide prices)
  Reveal, Logo    # shared helpers
lib/
  data.ts         # cities, steps, formats, accent palette
  theme.tsx       # ThemeProvider — drives the --accent CSS variables at runtime
public/           # exported model photography (hero, paris, london, makerworld…)
```

## Design fidelity notes

- The two design "props" from the original mockup are implemented as a live control (bottom-right):
  **accent color** (Bronze / Slate / Sand / Terracotta) and **Show prices**.
- The configurator is interactive: city chips, a draggable location pin with a live
  coordinate readout, format selection that updates the price, and a live-preview caption.
- Colors, spacing and typography mirror the source mockup; the accent is exposed as a
  `--accent` CSS custom property so both Tailwind arbitrary values and inline `rgba()` react to it.
