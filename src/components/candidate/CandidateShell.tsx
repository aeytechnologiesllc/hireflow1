import { type ReactNode } from "react";

interface CandidateShellProps {
  children: ReactNode;
  className?: string;
}

/** Mobile-first Deep Jade shell for candidate-facing routes. */
export function CandidateShell({ children, className = "" }: CandidateShellProps) {
  return (
    <div className={`cand-root overflow-x-hidden ${className}`}>
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in srgb, var(--hf-green-soft) 35%, transparent), transparent 60%), radial-gradient(ellipse 60% 40% at 100% 100%, color-mix(in srgb, var(--hf-gold-hover) 12%, transparent), transparent 50%)",
        }}
      />
      {children}
    </div>
  );
}

export default CandidateShell;
