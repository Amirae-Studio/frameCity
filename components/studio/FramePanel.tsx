"use client";

import { useMemo, type ReactNode } from "react";
import { Check, Download, Loader2, TriangleAlert } from "lucide-react";
import Scrubber from "../ui/Scrubber";
import SegmentedToggle from "../ui/Switch";
import { fitScale, type Printer } from "@/lib/studio";
import {
  FONT_LABELS,
  FRAME_DEFAULTS,
  MIN_HANGER_BORDER,
  autoLabelSize,
  maxLabelSize,
  PROFILE_LABELS,
  TEXTURE_LABELS,
  textureHeight,
  type FrameOptions,
  type LabelFont,
  type FrameProfile,
  type FrameSize,
  type FrameTexture,
} from "@/lib/frame";

/** Filament colours that suit a frame, from the Bambu PLA Basic line. */
const FRAME_COLORS: [string, string][] = [
  ["Black", "#000000"],
  ["Jade White", "#FFFFFF"],
  ["Dark Gray", "#545454"],
  ["Silver", "#A6A9AA"],
  ["Beige", "#F7E6DE"],
  ["Gold", "#E4BD68"],
  ["Bronze", "#847D48"],
  ["Cocoa Brown", "#6F5034"],
  ["Brown", "#9D432C"],
  ["Maroon Red", "#9D2235"],
  ["Blue Gray", "#5B6579"],
  ["Mistletoe Green", "#3F8E43"],
];

const STYLES: { name: string; note: string; opts: Partial<FrameOptions> }[] = [
  { name: "Gallery", note: "Clean, flat, black", opts: { profile: "flat", texture: "smooth", radius: 0, border: 15, color: "#000000", labelColor: "#FFFFFF", labelFont: "sans" } },
  { name: "Oak", note: "Rounded, wood grain", opts: { profile: "rounded", texture: "wood", radius: 2, border: 20, textureDepth: 0.6, textureScale: 1, color: "#6F5034", labelColor: "#E4BD68", labelFont: "serif" } },
  { name: "Modern", note: "Chamfer, soft corners", opts: { profile: "chamfer", texture: "smooth", radius: 8, border: 15, color: "#FFFFFF", labelColor: "#000000", labelFont: "sans" } },
  { name: "Antique", note: "Stepped, crackle", opts: { profile: "stepped", texture: "crackle", radius: 0, border: 22, textureDepth: 0.5, textureScale: 1, color: "#E4BD68", labelColor: "#000000", labelFont: "serif" } },
];

export function FramePanel({
  enabled,
  onEnabled,
  opts,
  onOpts,
  size,
  busy,
  printer,
  defaultLabel,
  onShrinkToFit,
  onDownload,
  downloading,
}: {
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  opts: FrameOptions;
  onOpts: (patch: Partial<FrameOptions>) => void;
  size: FrameSize | null;
  busy: boolean;
  printer: Printer;
  defaultLabel: string;
  onShrinkToFit: () => void;
  onDownload: (format: "stl" | "3mf") => void;
  downloading: "stl" | "3mf" | null;
}) {
  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13px] leading-relaxed text-cream/65">
          Design a frame that fits this model exactly. Print it on its own, or download one 3MF with the model on
          plate 1 and the frame on plate 2.
        </p>
        <button
          type="button"
          onClick={() => onEnabled(true)}
          className="w-full rounded-full bg-cream py-3 text-[13.5px] font-medium text-[var(--color-base)] transition-transform hover:scale-[1.02]"
        >
          Add a frame
        </button>
      </div>
    );
  }

  const [bw, bd, bh] = printer.bed;
  const fits = size ? fitScale(printer, size.w, size.d, size.h) >= 0.999 : true;
  const hangerOk = opts.border >= MIN_HANGER_BORDER && opts.depth >= 10;
  const sameColor = opts.labelColor.toLowerCase() === opts.color.toLowerCase();
  // Two colours need a prime tower on the frame's plate. An open window has
  // room for it; a solid back leaves only the side margins.
  const towerCramped =
    !!opts.label.trim() &&
    !sameColor &&
    opts.back === "solid" &&
    !!size &&
    Math.max(bw - size.w, bd - size.d) / 2 < 30;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <SegmentedToggle label="Show frame" checked={enabled} onCheckedChange={onEnabled} />
        {busy && <Loader2 size={14} className="animate-spin text-cream/45" aria-label="Updating frame" />}
      </div>

      {/* Size + bed check */}
      <div
        className={`flex items-start gap-2.5 rounded-xl border p-3 text-[12px] leading-snug ${
          fits ? "border-cream/[0.12] bg-cream/[0.03] text-cream/75" : "border-[#e07a5f]/45 bg-[#e07a5f]/[0.08] text-cream"
        }`}
      >
        {fits ? (
          <Check size={14} className="mt-px shrink-0 text-[var(--accent)]" />
        ) : (
          <TriangleAlert size={14} className="mt-px shrink-0 text-[#e07a5f]" />
        )}
        <div className="min-w-0 flex-1">
          {size ? (
            <>
              Frame {Math.round(size.w)} × {Math.round(size.d)} × {Math.round(size.h)} mm
              <span className="block font-mono text-[10px] text-cream/45">
                Opening {size.opening.w.toFixed(1)} × {size.opening.d.toFixed(1)} mm ·{" "}
                {fits ? `fits the ${printer.name}` : `too big for the ${printer.name}`}
              </span>
            </>
          ) : (
            "Measuring the model…"
          )}
        </div>
        {!fits && (
          <button
            type="button"
            onClick={onShrinkToFit}
            className="shrink-0 rounded-full bg-cream px-3 py-1 text-[11.5px] font-medium text-[var(--color-base)]"
            title="Shrinks the model so model and frame both fit the bed"
          >
            Shrink to fit
          </button>
        )}
      </div>

      <Section label="Style">
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onOpts(s.opts)}
              className="rounded-xl border border-cream/[0.12] px-3 py-2 text-left transition-colors hover:border-cream/35 hover:bg-cream/[0.04]"
            >
              <span className="flex items-center gap-2 text-[12.5px]">
                <span className="h-3 w-3 rounded-full border border-black/30" style={{ background: s.opts.color }} />
                {s.name}
              </span>
              <span className="block font-mono text-[9.5px] text-cream/40">{s.note}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section label="Edge profile">
        <div className="grid grid-cols-5 gap-1">
          {(Object.keys(PROFILE_LABELS) as FrameProfile[]).map((p) => (
            <Chip key={p} on={opts.profile === p} onClick={() => onOpts({ profile: p })} title={PROFILE_LABELS[p]}>
              <ProfileIcon p={p} />
              <span className="text-[10px]">{PROFILE_LABELS[p]}</span>
            </Chip>
          ))}
        </div>
      </Section>

      <Section label="Texture">
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(TEXTURE_LABELS) as FrameTexture[]).map((t) => (
            <Chip key={t} on={opts.texture === t} onClick={() => onOpts({ texture: t })} title={TEXTURE_LABELS[t]}>
              <TextureSwatch t={t} />
              <span className="text-[10.5px]">{TEXTURE_LABELS[t]}</span>
            </Chip>
          ))}
        </div>
        {opts.texture !== "smooth" && (
          <div className="mt-1 flex flex-col gap-2">
            <Scrubber
              label="Texture depth (mm)"
              value={opts.textureDepth}
              min={0.2}
              max={1.2}
              step={0.1}
              decimals={1}
              onValueChange={(v) => onOpts({ textureDepth: v })}
            />
            <Scrubber
              label="Pattern size (%)"
              value={Math.round(opts.textureScale * 100)}
              min={50}
              max={250}
              step={10}
              decimals={0}
              onValueChange={(v) => onOpts({ textureScale: v / 100 })}
            />
          </div>
        )}
      </Section>

      <Section label="Shape">
        <Scrubber
          label="Border width (mm)"
          value={opts.border}
          min={8}
          max={40}
          step={1}
          decimals={0}
          onValueChange={(v) => onOpts({ border: v, radius: Math.min(opts.radius, v) })}
        />
        <Scrubber
          label="Depth (mm)"
          value={opts.depth}
          min={8}
          max={40}
          step={1}
          decimals={0}
          onValueChange={(v) => onOpts({ depth: v })}
        />
        <Scrubber
          label="Corner radius (mm)"
          value={opts.radius}
          min={0}
          max={opts.border}
          step={1}
          decimals={0}
          onValueChange={(v) => onOpts({ radius: v })}
        />
      </Section>

      <Section label="Back">
        <div className="grid grid-cols-2 gap-1 rounded-full border border-cream/[0.14] p-1">
          {(
            [
              ["open", "Open window"],
              ["solid", "Solid back"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => onOpts({ back: v })}
              className={`rounded-full py-[6px] text-[11.5px] transition-colors ${
                opts.back === v ? "bg-cream font-medium text-[var(--color-base)]" : "text-cream/55 hover:text-cream"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] text-cream/35">
          {opts.back === "open"
            ? `Model rests on a ${opts.lip} mm ledge · uses less filament`
            : "Model rests on a full back panel"}
        </p>
        <div className="flex items-center justify-between">
          <SegmentedToggle
            label="Keyhole hanger"
            checked={opts.hanger && hangerOk}
            disabled={!hangerOk}
            onCheckedChange={(v) => onOpts({ hanger: v })}
          />
        </div>
        {!hangerOk && (
          <p className="m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] text-cream/35">
            Needs a {MIN_HANGER_BORDER} mm border and 10 mm depth
          </p>
        )}
      </Section>

      <Section label="Nameplate">
        <SegmentedToggle
          label="Text on bottom rail"
          checked={!!opts.label}
          onCheckedChange={(v) => onOpts({ label: v ? defaultLabel : "" })}
        />
        {!!opts.label && (
          <>
            <input
              value={opts.label}
              maxLength={40}
              onChange={(e) => onOpts({ label: e.target.value || " " })}
              className="rounded-[10px] border border-cream/[0.14] bg-transparent px-3 py-2 text-[13px] text-cream outline-none focus:border-[var(--accent)]"
              placeholder="Paris · 2026"
            />
            <Scrubber
              label="Letter height (mm)"
              value={Math.round((opts.labelSize > 0 ? Math.min(opts.labelSize, maxLabelSize(opts)) : autoLabelSize(opts)) * 2) / 2}
              min={2}
              max={Math.floor(maxLabelSize(opts) * 2) / 2}
              step={0.5}
              decimals={1}
              onValueChange={(v) => onOpts({ labelSize: v })}
            />
            <div className="grid grid-cols-3 gap-1 rounded-full border border-cream/[0.14] p-1">
              {(Object.keys(FONT_LABELS) as LabelFont[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onOpts({ labelFont: f })}
                  className={`rounded-full py-[5px] text-[11.5px] transition-colors ${
                    opts.labelFont === f ? "bg-cream font-medium text-[var(--color-base)]" : "text-cream/55 hover:text-cream"
                  }`}
                  style={{ fontFamily: f === "serif" ? "Georgia, serif" : f === "mono" ? "Menlo, monospace" : undefined }}
                >
                  {FONT_LABELS[f]}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-cream/45">Text colour</span>
              <span className="font-mono text-[9.5px] text-cream/35">
                {sameColor ? "Same as frame — pick another to stand out" : "Prints as a 2nd colour"}
              </span>
            </div>
            <Swatches value={opts.labelColor} onPick={(hex) => onOpts({ labelColor: hex })} />
            {towerCramped && (
              <p className="m-0 rounded-lg border border-[#e07a5f]/40 bg-[#e07a5f]/[0.07] p-2.5 text-[11.5px] leading-snug text-cream/80">
                A solid back leaves no room on the {printer.name} bed for the prime tower a 2nd colour needs. Use{" "}
                <button type="button" onClick={() => onOpts({ back: "open" })} className="underline underline-offset-2">
                  Open window
                </button>
                , the frame colour for the text, or turn off the prime tower in Bambu Studio.
              </p>
            )}
          </>
        )}
      </Section>

      <Section label="Frame colour">
        <Swatches value={opts.color} onPick={(hex) => onOpts({ color: hex })} />
      </Section>

      <Section label="Fit">
        <Scrubber
          label="Gap around model (mm)"
          value={opts.clearance}
          min={0.1}
          max={1}
          step={0.05}
          decimals={2}
          onValueChange={(v) => onOpts({ clearance: v })}
        />
        <button
          type="button"
          onClick={() => onOpts({ ...FRAME_DEFAULTS, label: opts.label, labelColor: opts.labelColor })}
          className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-cream/40 hover:text-cream"
        >
          ↺ Reset frame
        </button>
      </Section>

      <Section label="Download frame">
        <div className="grid grid-cols-2 gap-2">
          {(["stl", "3mf"] as const).map((f) => (
            <button
              key={f}
              type="button"
              disabled={busy || !size || downloading !== null}
              onClick={() => onDownload(f)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-cream/25 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-cream/75 transition-colors hover:border-cream/45 hover:text-cream disabled:opacity-40"
            >
              <Download size={12} />
              {downloading === f ? "…" : `Frame ${f}`}
            </button>
          ))}
        </div>
        <p className="m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] text-cream/35">
          The main Download 3MF includes this frame on plate 2
        </p>
      </Section>
    </div>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {FRAME_COLORS.map(([name, hex]) => {
        const on = hex.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            title={name}
            aria-pressed={on}
            onClick={() => onPick(hex)}
            className={`relative aspect-square rounded-lg border border-black/25 transition-transform hover:scale-110 ${
              on ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--color-panel)]" : ""
            }`}
            style={{ background: hex }}
          />
        );
      })}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cream/45">{label}</div>
      {children}
    </section>
  );
}

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition-colors ${
        on
          ? "border-[var(--accent)] bg-[var(--accent)]/[0.08] text-cream"
          : "border-cream/[0.12] text-cream/60 hover:border-cream/30 hover:text-cream"
      }`}
    >
      {children}
    </button>
  );
}

/** Cross-section of each edge profile: outer edge on the left, opening on the right. */
function ProfileIcon({ p }: { p: FrameProfile }) {
  const d: Record<FrameProfile, string> = {
    flat: "M3 19V6h18v13",
    chamfer: "M3 19V10l4-4h14v13",
    rounded: "M3 19V11a5 5 0 0 1 5-5h13v13",
    stepped: "M3 19V6h9v4h9v9",
    cove: "M3 19V6h6c0 5 6 6 12 6v7",
  };
  return (
    <svg width="22" height="16" viewBox="0 0 24 22" fill="none" aria-hidden>
      <path d={d[p]} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

/** A small shaded preview of a texture, drawn from the same function the frame uses. */
function TextureSwatch({ t }: { t: FrameTexture }) {
  const url = useMemo(() => {
    if (typeof document === "undefined") return "";
    const N = 44;
    const span = 16; // mm shown
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    const img = ctx.createImageData(N, N);
    const h = (i: number, j: number) => {
      const x = (i / N) * span, y = (j / N) * span;
      return textureHeight(t, x, y, x, y, 1);
    };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        // Light from the top-left: shade by the slope.
        const s = (h(i + 1, j + 1) - h(i, j)) * -1.4;
        const v = Math.max(0, Math.min(255, 150 + 90 * (h(i, j) - 0.5) + 160 * s));
        const k = (j * N + i) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }, [t]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url || undefined} alt="" className="h-9 w-full rounded-md object-cover" />
  );
}
