import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Check } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";

interface Feature {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  title: string;
  description: string;
  titleColor: string;
  iconBg: string;
  detailedDescription: string;
  highlights: string[];
}

interface FeatureDetailDialogProps {
  feature: Feature | null;
  onClose: () => void;
}

// Matches the marketing landing's theme: dark surface (hsl 220) + emerald accents +
// Fraunces display. (NOT the Deep Jade app theme — the landing is intentionally dark.)
export default function FeatureDetailDialog({ feature, onClose }: FeatureDetailDialogProps) {
  if (!feature) return null;

  return (
    <Dialog open={!!feature} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0 bg-[hsl(220,16%,10%)] border border-[hsl(220,15%,16%)] text-white [&>button]:!bg-transparent [&>button]:!text-gray-400 hover:[&>button]:!text-white [&>button]:focus:!ring-emerald-500/40">
        {/* Header */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/[0.12] to-transparent" />
          <div className="relative p-7 pb-6 border-b border-[hsl(220,15%,14%)]">
            <span className="flex items-center justify-center w-[52px] h-[52px] rounded-[14px] bg-gradient-to-br from-emerald-500/20 to-emerald-500/[0.03] border border-emerald-500/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
              <feature.icon className="h-6 w-6 text-emerald-300" />
            </span>
            <DialogTitle className="font-serif font-medium text-[26px] leading-tight tracking-[-0.01em] text-white mt-[18px]">
              {feature.title}
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-[1.55] text-gray-400 mt-2">
              {feature.description}
            </DialogDescription>
          </div>
        </div>

        {/* Body */}
        <div className="p-7 pt-6">
          <p className="text-[15px] leading-[1.65] text-gray-300">{feature.detailedDescription}</p>

          <h4 className="text-[11px] font-semibold tracking-[0.18em] text-gray-500 mt-6">KEY FEATURES</h4>
          <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
            {feature.highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] border border-[hsl(220,15%,16%)] px-3 py-2.5"
              >
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                <span className="text-[13.5px] leading-[1.4] text-gray-200">{highlight}</span>
              </div>
            ))}
          </div>

          <Link to="/auth" onClick={onClose} className="block mt-7">
            <span className="flex items-center justify-center gap-2 w-full h-[50px] rounded-full font-semibold text-[15px] bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-[0_0_40px_-12px_hsla(160,60%,50%,0.9)] transition-transform duration-200 hover:scale-[1.02]">
              Get started free
              <ArrowRight className="h-[18px] w-[18px]" />
            </span>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
