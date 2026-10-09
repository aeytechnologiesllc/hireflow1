import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { LegalBlock, LegalDocument } from "@/content/legal";

/**
 * One legal page: the Privacy Policy or the Terms and Conditions
 * (src/content/legal.ts; docs/LEGAL-PAGES.md).
 *
 * Built to be read, on a phone as much as at a desk: one narrow column, large
 * plain text, a list of sections to jump to, and the other document one press
 * away. It carries no company name, no logo and no address on purpose (the
 * owner, 2026-10-09). Its colours are its own, not the app's theme, so it
 * reads the same from the careers site, the staff site, or a link in an email.
 */
function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") return <p className="mt-3 text-[16px] leading-[1.65] text-[#33413c]">{block}</p>;
  if ("sub" in block) return <h3 className="mt-6 text-[15px] font-semibold text-[#17231f]">{block.sub}</h3>;
  return (
    <ul className="mt-3 space-y-2 pl-5 text-[16px] leading-[1.6] text-[#33413c]" style={{ listStyleType: "disc" }}>
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalPage({ document: doc, other }: { document: LegalDocument; other: { label: string; to: string } }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#faf8f3] text-[#17231f]" data-legal-page>
      <div className="mx-auto w-full max-w-[720px] px-5 pb-20 pt-6 sm:px-8 sm:pt-10">
        <div className="flex items-center justify-between gap-3 text-[14px]">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md py-1 font-medium text-[#0f6b55] hover:underline"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          <Link to={other.to} className="font-medium text-[#0f6b55] hover:underline">
            {other.label}
          </Link>
        </div>

        <h1 className="mt-8 text-[34px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[42px]" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
          {doc.title}
        </h1>
        <p className="mt-2 text-[14px] text-[#5b6a64]">Last updated: {doc.updated}</p>

        {doc.intro.map((paragraph) => (
          <p key={paragraph} className="mt-4 text-[17px] leading-[1.6] text-[#33413c]">
            {paragraph}
          </p>
        ))}

        <nav aria-label="Sections" className="mt-8 rounded-[14px] border border-[#e4ded0] bg-[#fffdf8] px-5 py-4">
          <ol className="grid gap-x-6 gap-y-1.5 text-[14.5px] sm:grid-cols-2">
            {doc.sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-[#0f6b55] hover:underline">
                  {i + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((section, i) => (
          <section key={section.id} id={section.id} className="mt-10 scroll-mt-6" data-legal-section={section.id}>
            <h2 className="text-[23px] font-semibold leading-[1.2]" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
              {i + 1}. {section.title}
            </h2>
            {section.body.map((block, n) => (
              <Block key={n} block={block} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
