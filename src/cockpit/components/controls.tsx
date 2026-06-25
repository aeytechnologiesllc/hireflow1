import { ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";

export function SearchInput({ placeholder = "Search…", className }: { placeholder?: string; className?: string }) {
  return (
    <div className={`ck-input flex items-center gap-2 px-3 ${className ?? ""}`} style={{ height: 42 }}>
      <Search className="h-4 w-4 shrink-0" style={{ color: "hsl(150 10% 55%)" }} />
      <input
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] outline-none"
        style={{ color: "hsl(150 28% 90%)" }}
      />
    </div>
  );
}

export function FilterSelect({ label, value, icon }: { label?: string; value: string; icon?: ReactNode }) {
  return (
    <button
      className="ck-input flex items-center gap-2 px-3 text-[13.5px]"
      style={{ height: 42, color: "hsl(150 20% 82%)" }}
    >
      {icon}
      <span>
        {label ? <span style={{ color: "hsl(150 10% 56%)" }}>{label} </span> : null}
        {value}
      </span>
      <ChevronDown className="h-3.5 w-3.5" style={{ color: "hsl(150 10% 55%)" }} />
    </button>
  );
}

export default FilterSelect;
