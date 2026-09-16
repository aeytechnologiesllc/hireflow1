import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvaSeal } from "@/components/ava/AvaSeal";
import type { ImprovementBlueprintData } from "@/hooks/useImprovementBlueprint";

interface ImprovementBlueprintViewProps {
  data: ImprovementBlueprintData;
  onDownloadPdf?: () => void;
  isDownloading?: boolean;
}

/**
 * The in-app read of the Improvement Blueprint — a clear letterhead
 * composition in Paper/Ink, readable at phone width. This is the "moment"
 * (see the PDF for the take-away artifact): a candidate who was turned down
 * should be able to read the whole thing right here, not just be handed a
 * file to open elsewhere.
 */
export function ImprovementBlueprintView({ data, onDownloadPdf, isDownloading }: ImprovementBlueprintViewProps) {
  const { summary, whatWentWell, gapsForThisRole, presentingYourExperience, practicePlan, rolesToConsiderNext, closing, metadata } = data;

  return (
    <div className="mx-auto w-full max-w-[640px]" style={{ color: "var(--ink)" }}>
      {/* Letterhead */}
      <div
        className="rounded-t-[14px] border px-5 py-5 sm:px-7 sm:py-6"
        style={{ background: "var(--surface)", borderColor: "var(--line)", borderBottom: "2px solid var(--brass-line)" }}
      >
        <div className="flex items-center gap-2.5">
          <AvaSeal size={22} />
          <span className="text-sm font-semibold tracking-wide" style={{ color: "var(--jade)" }}>
            HireFlow
          </span>
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            &middot; Improvement Blueprint
          </span>
        </div>
        <h1 className="font-display mt-3 text-2xl leading-tight sm:text-3xl" style={{ color: "var(--ink)" }}>
          {metadata.candidateName}
        </h1>
        <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--ink-2)" }}>
          {metadata.jobTitle}
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
          Prepared {new Date(metadata.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Body */}
      <div
        className="space-y-7 rounded-b-[14px] border border-t-0 px-5 py-6 sm:px-7"
        style={{ background: "var(--ground)", borderColor: "var(--line)" }}
      >
        {metadata.dataDepthMessage && (
          <p className="text-xs italic" style={{ color: "var(--ink-3)" }}>
            {metadata.dataDepthMessage}
          </p>
        )}

        {/* Summary */}
        <section className="space-y-3">
          <p className="text-sm leading-relaxed sm:text-[15px]" style={{ color: "var(--ink-2)" }}>
            {summary.whatHappened}
          </p>
          <div
            className="rounded-[10px] border-l-[3px] px-4 py-3"
            style={{ background: "var(--jade-soft)", borderColor: "var(--jade)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--jade-soft-fg)" }}>
              The one thing to remember
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink)" }}>
              {summary.keyTakeaway}
            </p>
          </div>
        </section>

        {/* What went well */}
        {whatWentWell.length > 0 && (
          <Section title="What went well">
            <div className="space-y-4">
              {whatWentWell.map((s, i) => (
                <div key={i} className="rounded-[10px] border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--jade)" }}>
                    {s.strength}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--ink-3)" }}>
                    {s.evidence}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    <span className="font-medium">Next time:</span> {s.howToUseItNextTime}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Gaps for this role */}
        {gapsForThisRole.length > 0 && (
          <Section title="Where this role needed more">
            <div className="space-y-5">
              {gapsForThisRole.map((g, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {g.area}
                  </p>
                  <p
                    className="rounded-[8px] px-3 py-2 text-xs italic"
                    style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }}
                  >
                    This role looked for: {g.requirement}
                  </p>
                  <p className="text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    {g.whatWeObserved}
                  </p>
                  <p className="text-[13px] leading-snug" style={{ color: "var(--ink-3)" }}>
                    <span className="font-medium">Why it matters:</span> {g.whyItMatters}
                  </p>
                  <div className="space-y-2 pt-1">
                    {g.practiceSteps.map((step, si) => (
                      <div key={si} className="rounded-[8px] border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
                        <p className="text-[13px] font-medium" style={{ color: "var(--jade)" }}>
                          {step.action}
                        </p>
                        <p className="mt-0.5 text-[12.5px] italic leading-snug" style={{ color: "var(--ink-3)" }}>
                          Try: {step.example}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Presenting your experience */}
        <Section title="Presenting your experience">
          <div className="space-y-2">
            <p className="text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
              {presentingYourExperience.observation}
            </p>
            <p className="text-[13px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
              {presentingYourExperience.suggestion}
            </p>
            <p
              className="rounded-[8px] border px-3 py-2 text-[13px] italic leading-snug"
              style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink-2)" }}
            >
              {presentingYourExperience.example}
            </p>
          </div>
        </Section>

        {/* Practice plan */}
        {(practicePlan.thisWeek.length > 0 || practicePlan.nextTwoWeeks.length > 0) && (
          <Section title="Your practice plan">
            <div className="grid gap-4 sm:grid-cols-2">
              {practicePlan.thisWeek.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--brass)" }}>
                    This week
                  </p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px]" style={{ color: "var(--ink-2)" }}>
                    {practicePlan.thisWeek.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                </div>
              )}
              {practicePlan.nextTwoWeeks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--brass)" }}>
                    Next two weeks
                  </p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px]" style={{ color: "var(--ink-2)" }}>
                    {practicePlan.nextTwoWeeks.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Roles to consider next */}
        {rolesToConsiderNext.length > 0 && (
          <Section title="Roles to consider next">
            <div className="space-y-2.5">
              {rolesToConsiderNext.map((r, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {r.roleType}
                  </p>
                  <p className="text-[13px] leading-snug" style={{ color: "var(--ink-3)" }}>
                    {r.why}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Closing */}
        <div className="space-y-3 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          <p className="text-[13px] italic leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {closing.note}
          </p>
          <p className="text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {closing.disclaimer}
          </p>
        </div>

        {onDownloadPdf && (
          <div className="flex justify-center pt-1">
            <Button
              onClick={onDownloadPdf}
              disabled={isDownloading}
              variant="outline"
              className="gap-2"
              style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
            >
              {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download as PDF
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-base sm:text-lg" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
