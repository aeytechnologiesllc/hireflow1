import { Fragment } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp } from "lucide-react";
import type { LegalBlock, LegalDocument } from "@/content/legal";
import { usePageHead } from "@/components/seo/usePageHead";
import { isStaffHost } from "@/lib/hosts";
import { Wordmark } from "@/cockpit/components/Wordmark";

/**
 * One legal page: the Privacy Policy or the Terms and Conditions
 * (src/content/legal.ts; docs/LEGAL-PAGES.md).
 *
 * Built to be read, on a phone as much as at a desk: the document on a sheet
 * of the app's paper, lines about 65 characters long, large plain text, a
 * list of sections to jump to, and the other document one press away.
 *
 * Since 2026-11-01 it wears the app's look: Sage paper by Day, warm ink by
 * Night (the theme tokens in src/index.css, so it follows the reader's own
 * choice; the app opens in Day), the display face for headings, and the green
 * seal wordmark at the top. The documents' words still name only the company
 * that runs the site (Southern Digital Technologies LLC); no address, no
 * other logo or picture. scripts/legal_pages.test.mjs holds the frame to the
 * tokens: no fixed colour.
 */

/** Stripe's own privacy policy, named in ours (pricing v9): the one address the documents link out to. */
const STRIPE_PRIVACY = "stripe.com/privacy";

const LINK =
  "font-medium text-[var(--action)] underline decoration-[var(--line)] decoration-1 underline-offset-[3px] transition-colors hover:decoration-[var(--action)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]";

/** A paragraph's words, with Stripe's privacy policy as a link where it is named. */
function Words({ text }: { text: string }) {
  const parts = text.split(STRIPE_PRIVACY);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className={LINK}>
              stripe.com/privacy
            </a>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string")
    return (
      <p className="mt-3 max-w-[33em] text-[16px] leading-[1.7] text-[var(--ink-2)]">
        <Words text={block} />
      </p>
    );
  if ("sub" in block) return <h3 className="mt-7 max-w-[33em] text-[15px] font-semibold leading-snug text-[var(--ink)]">{block.sub}</h3>;
  return (
    <ul className="mt-3 max-w-[33em] list-disc space-y-2 pl-5 text-[16px] leading-[1.65] text-[var(--ink-2)] marker:text-[var(--action)]">
      {block.list.map((item) => (
        <li key={item} className="pl-1">
          <Words text={item} />
        </li>
      ))}
    </ul>
  );
}

export function LegalPage({ document: doc, other }: { document: LegalDocument; other: { label: string; to: string } }) {
  // Listed under its own address ("/privacy", "/terms"), not folded into the
  // homepage. The title is the document's own: no name in the frame (above).
  const { pathname } = useLocation();
  usePageHead({ title: doc.title, path: pathname, description: doc.intro[0] });
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] bg-[var(--ground)] text-[var(--ink)]" data-legal-page>
      <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-5 sm:px-8 sm:pb-24 sm:pt-8">
        <header className="flex items-center justify-between gap-4">
          <Wordmark size={30} />
          <Link to={other.to} className={`text-[14px] ${LINK}`}>
            {other.label}
          </Link>
        </header>

        <button
          type="button"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md py-1 text-[14px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]"
          // A tab with no history (the sign-up opens the policy in a new
          // tab): the front page itself, by a full load (the server serves
          // it at "/"), never the app's "/", which forwards to the
          // platform's own open role (the Phase 7 product audit). The staff site's "/"
          // is its sign-in doorway.
          onClick={() => (window.history.length > 1 ? navigate(-1) : isStaffHost() ? navigate("/") : window.location.assign("/"))}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>

        <article className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 pb-10 pt-8 sm:px-12 sm:pb-14 sm:pt-12">
          <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-[-0.015em] text-[var(--ink)] sm:text-[44px]">{doc.title}</h1>
          <p className="mt-3 text-[14px] text-[var(--ink-3)]">Last updated: {doc.updated}</p>

          {doc.intro.map((paragraph) => (
            <p key={paragraph} className="mt-5 max-w-[33em] text-[17px] leading-[1.65] text-[var(--ink)]">
              {paragraph}
            </p>
          ))}

          <nav aria-label="Sections" className="mt-9 border-y border-[var(--line)] py-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">On this page</p>
            <ol className="mt-3 grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
              {doc.sections.map((section, i) => (
                <li key={section.id} className="flex gap-2">
                  <span className="w-6 shrink-0 text-right tabular-nums text-[var(--ink-3)]">{i + 1}.</span>
                  <a href={`#${section.id}`} className="text-[var(--ink)] underline decoration-[var(--line)] underline-offset-[3px] transition-colors hover:decoration-[var(--action)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((section, i) => (
            <section key={section.id} id={section.id} className="mt-11 scroll-mt-6" data-legal-section={section.id}>
              <h2 className="font-display text-[24px] font-semibold leading-[1.2] text-[var(--ink)] sm:text-[26px]">
                <span className="mr-2 tabular-nums text-[var(--ink-3)]">{i + 1}.</span>
                {section.title}
              </h2>
              {section.body.map((block, n) => (
                <Block key={n} block={block} />
              ))}
            </section>
          ))}
        </article>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1 text-[14px]">
          <a href="#top" className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--action)]">
            <ArrowUp className="h-4 w-4" aria-hidden />
            Back to the top
          </a>
          <Link to={other.to} className={LINK}>
            {other.label}
          </Link>
        </footer>
      </div>
    </div>
  );
}
