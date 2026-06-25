import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Big Fraunces page title + subtitle, optional right-aligned actions.
 * On mobile the title is rendered by the app's top bar, so here we only show
 * the subtitle + full-width actions to avoid a duplicate title.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={className}>
      {/* Desktop: title + subtitle + right-aligned actions */}
      <div className="hidden md:flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display leading-[1.05]" style={{ fontSize: "clamp(30px, 4vw, 44px)", color: "hsl(150 32% 95%)", fontWeight: 500 }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[14px]" style={{ color: "hsl(150 10% 60%)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {/* Mobile: subtitle sits under the top-bar title; actions go full width */}
      <div className="md:hidden">
        {subtitle && (
          <p className="text-[13.5px]" style={{ color: "hsl(150 10% 60%)" }}>
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
