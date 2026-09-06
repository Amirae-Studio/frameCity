// components/ui/Switch.tsx

export interface SegmentedToggleProps {
  label?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export default function SegmentedToggle({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  className = "",
}: SegmentedToggleProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      {label && <span className="text-[12.5px] text-cream/75">{label}</span>}
      <div className="flex items-center rounded-lg border border-cream/15 bg-cream/[0.05] p-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCheckedChange(true)}
          className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-md transition-all ${
            checked
              ? "bg-[var(--accent)] text-cream shadow-sm"
              : "text-cream/40 hover:text-cream"
          }`}
        >
          ON
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCheckedChange(false)}
          className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-md transition-all ${
            !checked
              ? "bg-cream/20 text-cream shadow-sm"
              : "text-cream/40 hover:text-cream"
          }`}
        >
          OFF
        </button>
      </div>
    </div>
  );
}