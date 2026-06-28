import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function SearchInput({
  placeholder = "Search…",
  className,
  value,
  onChange,
}: {
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className={`ck-input flex items-center gap-2 px-3 ${className ?? ""}`} style={{ height: 42 }}>
      <Search className="h-4 w-4 shrink-0" style={{ color: "hsl(150 10% 55%)" }} />
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full bg-transparent text-[14px] outline-none"
        style={{ color: "hsl(150 28% 90%)" }}
      />
    </div>
  );
}

export interface FilterOption {
  label: string;
  value: string;
}

/**
 * FilterSelect — a real dropdown. Provide `options` + `onChange` to make it interactive;
 * `value` is the selected option's value. Without `options` it renders as a static label button.
 */
export function FilterSelect({
  label,
  value,
  icon,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  icon?: ReactNode;
  options?: FilterOption[];
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = options?.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => options && setOpen((o) => !o)}
        className="ck-input flex items-center gap-2 px-3 text-[13.5px]"
        style={{ height: 42, color: "hsl(150 20% 82%)" }}
      >
        {icon}
        <span>
          {label ? <span style={{ color: "hsl(150 10% 56%)" }}>{label} </span> : null}
          {current}
        </span>
        <ChevronDown className="h-3.5 w-3.5" style={{ color: "hsl(150 10% 55%)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && options && (
        <div
          className="absolute left-0 z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl py-1"
          style={{ background: "hsl(156 16% 9%)", border: "1px solid hsl(150 12% 18%)", boxShadow: "0 16px 40px hsl(0 0% 0% / 0.5)" }}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange?.(o.value); setOpen(false); }}
                className="flex w-full items-center px-3.5 py-2 text-left text-[13px] transition-colors"
                style={{ color: active ? "hsl(152 50% 62%)" : "hsl(150 20% 80%)", background: active ? "hsl(152 30% 13%)" : "transparent" }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FilterSelect;
