import { useId, type ReactNode } from "react";

/**
 * One section of the profile on a desktop (docs/APPLICANT-PROFILE.md): a
 * heading in the display face, a quiet line beside it, an optional link at
 * its far end, and the content. No box: sections are separated by a hairline
 * (.ckp-sec in cockpit.css), so the page reads as one sheet, not a stack of
 * containers.
 */
export function ProfileSection({
  title,
  sub,
  more,
  children,
  className = "",
}: {
  title: string;
  sub?: ReactNode;
  /** A link or button at the heading's far end ("All 18 answers ›"). */
  more?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={`ckp-sec ${className}`} aria-labelledby={id}>
      <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="font-display text-[21px] leading-[1.2]" style={{ color: "var(--ink)", fontWeight: 500 }}>
          {title}
        </h2>
        {sub && (
          <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            {sub}
          </span>
        )}
        {more && <span className="ml-auto">{more}</span>}
      </div>
      {children}
    </section>
  );
}

/** A small all-caps heading for the right column's panels ("At a glance"). */
export function PanelLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-3 text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.12em]" style={{ color: "var(--ink-3)" }}>
      {children}
    </h3>
  );
}

export default ProfileSection;
