import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * The cockpit's one page header: Fraunces title, subtitle and actions on a
 * single row (`.head` / `.h1` in design/preview/app.html). The title is a flat
 * 30px — the top of the type scale — so it never changes size between tabs or
 * as the window moves; the -0.025em tracking is what Fraunces needs at 30px.
 * On mobile the title is rendered by the app's top bar, so here we only show
 * the subtitle + full-width actions to avoid a duplicate title.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={className}>
      {/* Desktop: title, subtitle and actions share one 14px-gapped row */}
      <div className="hidden md:flex flex-wrap items-center gap-3.5">
        <h1
          className="min-w-0 font-display"
          style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15, color: "var(--hf-text)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <span className="min-w-0 text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
            {subtitle}
          </span>
        )}
        {/* ml-auto, not justify-between: the subtitle must sit beside the title,
            not get pushed to the far edge when there are no actions. */}
        {actions && <div className="ml-auto flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* Mobile: subtitle sits under the top-bar title; actions go full width */}
      <div className="md:hidden">
        {subtitle && (
          <p className="text-[13.5px]" style={{ color: "var(--hf-text-muted)" }}>
            {subtitle}
          </p>
        )}
        {actions && (
          <div className="mt-3 flex items-center gap-2 [&>button]:flex-1 [&>a]:flex-1">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
