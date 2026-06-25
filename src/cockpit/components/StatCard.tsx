import type { ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { CountUp, parseCountable } from "./CountUp";

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon: ReactNode;
  delta?: { text: string; trend: "up" | "down"; good?: boolean };
  className?: string;
  /** List position → staggers the entrance reveal so a row of KPIs cascades. */
  index?: number;
  /** Disable the count-up roll (e.g. for non-numeric values). Default on. */
  countUp?: boolean;
}

/** KPI / stat card — solid elevated panel, big Fraunces number, outlined circle icon. */
export function StatCard({ label, value, unit, icon, delta, className, index = 0, countUp = true }: StatCardProps) {
  const countable = countUp ? parseCountable(value) : null;
  return (
    <div
      className={`ck-card ck-lift ck-reveal p-5 ${className ?? ""}`}
      style={{ ["--ck-i" as string]: index }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium" style={{ color: "hsl(150 10% 62%)" }}>
            {label}
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="ck-num leading-none" style={{ fontSize: 40, color: "hsl(150 30% 94%)" }}>
              {countable ? (
                <CountUp
                  value={countable.num}
                  decimals={countable.decimals}
                  prefix={countable.prefix}
                  suffix={countable.suffix}
                  delay={index * 70}
                />
              ) : (
                value
              )}
            </span>
            {unit && (
              <span className="text-sm font-medium" style={{ color: "hsl(150 10% 60%)" }}>
                {unit}
              </span>
            )}
          </div>
          {delta && (
            <div
              className="mt-2 flex items-center gap-1 text-[12.5px]"
              style={{ color: delta.good ? "hsl(152 48% 58%)" : "hsl(8 64% 62%)" }}
            >
              {delta.trend === "up" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              <span style={{ color: "hsl(150 10% 60%)" }}>{delta.text}</span>
            </div>
          )}
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ border: "1px solid hsl(152 30% 30% / 0.5)", color: "hsl(152 46% 60%)", background: "hsl(152 40% 20% / 0.18)" }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default StatCard;
