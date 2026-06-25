import { ChevronRight, Sparkles } from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";

interface AvaCardProps {
  /** "rail" = vertical card (Jobs right rail). "wide" = horizontal banner (mobile). "interview" = orb + list. */
  variant?: "rail" | "wide";
  title?: string;
  text: string;
  ctaLabel?: string;
  onCta?: () => void;
  orbSize?: number;
  className?: string;
}

/** Ava insight card — the orb is the brand. Solid surface, brass CTA. */
export function AvaCard({ variant = "rail", title = "Ava", text, ctaLabel = "View insight", onCta, orbSize, className }: AvaCardProps) {
  if (variant === "wide") {
    return (
      <div className={`ck-card flex items-center gap-3 p-3 ${className ?? ""}`}>
        <div className="shrink-0">
          <AvaOrb size={orbSize ?? 56} reflection={false} glow={false} amp={0.22} flow={0.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-display text-[15px]" style={{ color: "hsl(150 30% 92%)" }}>
            {title}
            <Sparkles className="h-3.5 w-3.5" style={{ color: "hsl(38 64% 66%)" }} />
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "hsl(150 10% 64%)" }}>
            {text}
          </p>
        </div>
        <button className="ck-btn ck-btn-outline shrink-0 !px-3 !py-2 !text-[12.5px]" onClick={onCta}>
          {ctaLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`ck-card flex flex-col p-5 ${className ?? ""}`}>
      <div className="flex justify-center py-1">
        <AvaOrb size={orbSize ?? 132} reflection={false} amp={0.22} flow={0.5} />
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-display text-[20px]" style={{ color: "hsl(150 30% 93%)" }}>
        {title}
        <Sparkles className="h-4 w-4" style={{ color: "hsl(38 64% 66%)" }} />
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "hsl(150 10% 64%)" }}>
        {text}
      </p>
      <button className="ck-btn ck-btn-outline mt-4 self-start" onClick={onCta}>
        {ctaLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default AvaCard;
