"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lock, LockOpen, Maximize2, Move3d, RotateCw, Scaling, Undo2, Crosshair, Check, TriangleAlert } from "lucide-react";
import Scrubber from "../ui/Scrubber";
import { usableBed, type Printer } from "@/lib/studio";
import type { GizmoMode } from "./StudioScene";

export type Dims = { w: number; d: number; h: number };
export type SizeAxis = keyof Dims;

const PRESETS = [100, 150, 200];
/** Clearance kept free on each side of the bed when fitting. */
export const BED_MARGIN = 4;

/**
 * Size & printer panel: pick a printer, then size the model in real
 * millimetres. Position and rotation are one-click actions — free transform
 * stays available through the optional viewport handles.
 */
export function SizePanel({
  printer,
  printerSelect,
  dims,
  locked,
  onLocked,
  onSize,
  onFit,
  onCentre,
  onRotate,
  onReset,
  canReset,
  mode,
  onMode,
}: {
  printer: Printer;
  printerSelect: ReactNode;
  dims: Dims | null;
  locked: boolean;
  onLocked: (v: boolean) => void;
  onSize: (axis: SizeAxis, mm: number) => void;
  onFit: () => void;
  onCentre: () => void;
  onRotate: () => void;
  onReset: () => void;
  canReset: boolean;
  mode: GizmoMode | null;
  onMode: (m: GizmoMode | null) => void;
}) {
  const [bw, bd, bh] = printer.bed;
  const [aw, ad] = dims ? usableBed(printer, dims.w, dims.d) : [bw, bd];
  const over = dims
    ? {
        w: Math.max(0, dims.w - aw),
        d: Math.max(0, dims.d - ad),
        h: Math.max(0, dims.h - bh),
      }
    : null;
  const fits = over ? over.w < 0.5 && over.d < 0.5 && over.h < 0.5 : true;
  const widest = Math.min(bw, bd) - BED_MARGIN * 2;
  const sliderMax = Math.max(widest, Math.ceil(dims?.w ?? 0));

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <Label>Printer</Label>
        {printerSelect}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Print size</Label>
          <button
            type="button"
            onClick={() => onLocked(!locked)}
            title={locked ? "Proportions locked — click to size each side on its own" : "Keep proportions"}
            aria-pressed={locked}
            className={`flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] transition-colors ${
              locked ? "text-cream/55 hover:text-cream" : "bg-[var(--accent)]/15 text-[var(--accent)]"
            }`}
          >
            {locked ? <Lock size={11} /> : <LockOpen size={11} />}
            {locked ? "Proportional" : "Free"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MmField label="Width" value={dims?.w} onCommit={(v) => onSize("w", v)} />
          <MmField label="Depth" value={dims?.d} onCommit={(v) => onSize("d", v)} />
          <MmField label="Height" value={dims?.h} onCommit={(v) => onSize("h", v)} />
        </div>

        {dims && (
          <Scrubber
            label="Width (mm)"
            value={Math.round(dims.w)}
            min={40}
            max={sliderMax}
            step={1}
            decimals={0}
            onValueChange={(v) => onSize("w", v)}
          />
        )}

        <div className="flex gap-1.5">
          {PRESETS.map((mm) => {
            const on = dims ? Math.abs(Math.max(dims.w, dims.d) - mm) < 0.5 : false;
            return (
              <button
                key={mm}
                type="button"
                disabled={!dims || mm > Math.max(bw, bd)}
                onClick={() => dims && onSize(dims.w >= dims.d ? "w" : "d", mm)}
                className={`flex-1 rounded-full border py-1.5 font-mono text-[11px] transition-colors disabled:opacity-30 ${
                  on
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-cream/[0.14] text-cream/65 hover:border-cream/35 hover:text-cream"
                }`}
              >
                {mm} mm
              </button>
            );
          })}
          <button
            type="button"
            disabled={!dims}
            onClick={onFit}
            title={`Largest size that fits the ${printer.name} bed`}
            className="flex flex-1 items-center justify-center gap-1 rounded-full border border-cream/[0.14] py-1.5 font-mono text-[11px] text-cream/65 transition-colors hover:border-cream/35 hover:text-cream disabled:opacity-30"
          >
            <Maximize2 size={11} /> Max
          </button>
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-xl border p-3 text-[12px] leading-snug ${
            fits ? "border-cream/[0.12] bg-cream/[0.03] text-cream/70" : "border-[#e07a5f]/45 bg-[#e07a5f]/[0.08] text-cream"
          }`}
        >
          {fits ? (
            <Check size={14} className="mt-px shrink-0 text-[var(--accent)]" />
          ) : (
            <TriangleAlert size={14} className="mt-px shrink-0 text-[#e07a5f]" />
          )}
          <div className="min-w-0 flex-1">
            {fits ? (
              <>
                Fits the {printer.name} bed
                <span className="block font-mono text-[10px] text-cream/40">
                  {bw} × {bd} × {bh} mm{printer.exclude ? " · clear of its no-print corner" : ""}
                </span>
              </>
            ) : (
              <>
                Too big for the {printer.name}
                <span className="block font-mono text-[10px] text-cream/55">
                  {[
                    over!.w >= 0.5 && `${Math.ceil(over!.w)} mm too wide`,
                    over!.d >= 0.5 && `${Math.ceil(over!.d)} mm too deep`,
                    over!.h >= 0.5 && `${Math.ceil(over!.h)} mm too tall`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </>
            )}
          </div>
          {!fits && (
            <button
              type="button"
              onClick={onFit}
              className="shrink-0 rounded-full bg-cream px-3 py-1 text-[11.5px] font-medium text-[var(--color-base)]"
            >
              Fit to bed
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label>Placement</Label>
        <div className="grid grid-cols-3 gap-1.5">
          <Action icon={<Crosshair size={14} />} label="Centre" onClick={onCentre} />
          <Action icon={<RotateCw size={14} />} label="Turn 90°" onClick={onRotate} />
          <Action icon={<Undo2 size={14} />} label="Reset" onClick={onReset} disabled={!canReset} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label>Viewport handles</Label>
        <div className="grid grid-cols-4 gap-1 rounded-full border border-cream/[0.14] p-1">
          {(
            [
              [null, "Off", null],
              ["translate", "Move", <Move3d key="m" size={12} />],
              ["rotate", "Rotate", <RotateCw key="r" size={12} />],
              ["scale", "Scale", <Scaling key="s" size={12} />],
            ] as const
          ).map(([m, label, icon]) => {
            const on = mode === m;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onMode(m)}
                className={`flex items-center justify-center gap-1 rounded-full py-[6px] text-[11px] transition-colors ${
                  on ? "bg-cream font-medium text-[var(--color-base)]" : "text-cream/55 hover:text-cream"
                }`}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
        <p className="m-0 font-mono text-[9.5px] uppercase leading-[1.6] tracking-[0.14em] text-cream/35">
          Drag the model freely in the 3D view
        </p>
      </section>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cream/45">{children}</div>
  );
}

function Action({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-xl border border-cream/[0.12] py-2.5 text-[11.5px] text-cream/70 transition-colors hover:border-cream/30 hover:bg-cream/[0.04] hover:text-cream disabled:pointer-events-none disabled:opacity-35"
    >
      {icon}
      {label}
    </button>
  );
}

/** A millimetre field: shows the live size, applies a typed one on Enter or blur. */
function MmField({ label, value, onCommit }: { label: string; value?: number; onCommit: (mm: number) => void }) {
  const shown = value === undefined ? "" : String(Math.round(value));
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [shown]);

  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (Number.isFinite(v) && v >= 5 && v <= 1000 && v !== Number(shown)) onCommit(v);
  };

  return (
    <label className="flex flex-col gap-1 rounded-[10px] border border-cream/[0.14] px-2.5 py-2 focus-within:border-[var(--accent)]">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-cream/40">{label}</span>
      <span className="flex items-baseline gap-1">
        <input
          inputMode="numeric"
          disabled={value === undefined}
          value={draft ?? shown}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-full min-w-0 bg-transparent font-mono text-[15px] text-cream outline-none"
        />
        <span className="font-mono text-[10px] text-cream/40">mm</span>
      </span>
    </label>
  );
}
