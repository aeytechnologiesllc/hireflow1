import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { usePageHead } from "@/components/seo/usePageHead";
import { isStaffHost } from "@/lib/hosts";
import { openRolesPath } from "@/lib/openRoles";
import { Wordmark } from "@/cockpit/components/Wordmark";

/**
 * An address the app has no page for. Since 2026-11-01 it wears the app's
 * look, as the legal pages do: the theme's own ground and ink (Sage paper by
 * Day, warm ink by Night; it was a fixed dark slate), the green seal wordmark,
 * the display face, and one jade way on. The browser checks look for "Page not
 * found" and "404" (scripts/short_job_links_back_check.mjs,
 * scripts/computer_only_browser_check.mjs).
 */
const NotFound = () => {
  const location = useLocation();
  // The app answers every address with 200, so this page tells search engines
  // itself that there is nothing here to list.
  usePageHead({ title: "Page not found", noindex: true });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--ground)] px-4 pb-10 pt-5 text-[var(--ink)] sm:px-8 sm:pt-8">
      <header className="mx-auto w-full max-w-[760px]">
        <Wordmark size={30} />
      </header>
      <main className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-[440px] rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center sm:px-10 sm:py-12">
          <p className="text-[13px] font-semibold tabular-nums tracking-[0.14em] text-[var(--ink-3)]">404</p>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--ink)] sm:text-[36px]">Page not found</h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-[16px] leading-[1.6] text-[var(--ink-2)]">
            The link may be old, or the address may have a small mistake in it.
          </p>
          {/* An applicant who followed a broken link wants the open roles, not
              HireFlow's landing page; the hiring team wants home. */}
          <a
            href={isStaffHost() ? "/" : openRolesPath()}
            className="mt-7 inline-flex h-11 items-center justify-center rounded-[10px] bg-[var(--action)] px-5 text-[15px] font-semibold text-[var(--btn-fg)] transition-colors hover:bg-[var(--action-bright)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
          >
            {isStaffHost() ? "Return to Home" : "See open roles"}
          </a>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
