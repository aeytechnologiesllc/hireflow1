/**
 * The plan button (2026-11-01): what the business is on, one click from
 * anywhere. The owner, after paying: "I don't get to see what package I'm
 * on, how do I see everything?" He pointed at an account dropdown with a plan
 * name and a meter that drains; HireFlow prices a job for 30 days, so the
 * meter is each live job's days left, drawn as a ring (DaysRing).
 *
 * At the top right of every page on a computer (the owner, 2026-11-02: "it
 * would have been nice if it was like Higgsfield on the top right ... On the
 * left side, you could have the settings instead"; it sat in the sidebar above
 * the account), in its own slim row so it never covers a page's own buttons,
 * and on a phone at the top of More. The dropdown: the plan, what it costs (brass:
 * money), each live job with its ring ("23 days left"), Unlimited's renewal,
 * and the ways to Billing and Payment history. Drawn only for the business
 * owner while billing is on, and never for the exempt account (planSummary
 * answers null): no price, ever, where none is due.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, ChevronsUpDown, CreditCard, History } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useBilling } from "@/hooks/useSubscription";
import { PLAN_WORDS as W, billingTabShown, planSummary, type BillingState, type PlanSummary } from "@/lib/billing";
import { DaysRing } from "./DaysRing";

/** The plan as the owner's pages see it, or null (no button). Reads the jobs only when there is a plan to show. */
function usePlanSummary(billing: BillingState): PlanSummary | null {
  const { data: jobs } = useEmployerJobs();
  return useMemo(() => {
    const live = (jobs ?? []).filter((j) => j.status === "published").map((j) => ({ id: j.id, title: j.title }));
    return planSummary(billing, live);
  }, [billing, jobs]);
}

/** Nothing (and no jobs read) unless this is the business owner and billing shows: on, never the exempt account. */
export function PlanButton({ variant = "top" }: { variant?: "top" | "card" }) {
  const { role, isTeamMember } = useAuth();
  const owner = role === "employer" && !isTeamMember;
  const { billing } = useBilling();
  if (!owner) return null;
  if (!billingTabShown(billing)) return null;
  return <PlanButtonShown billing={billing} variant={variant} />;
}

function PlanGlyph({ plan, size = 30 }: { plan: PlanSummary; size?: number }) {
  if (plan.ring) return <DaysRing left={plan.ring.left} total={plan.ring.total} size={size} />;
  // Unlimited: a full ring with its mark (no clock to drain). Nothing live: the empty track.
  const unlimited = plan.name === "Unlimited";
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, border: `3px solid ${unlimited ? "var(--action)" : "var(--line)"}`, color: "var(--action)" }}
    >
      {unlimited && <span className="text-[14px] font-bold leading-none">{"∞"}</span>}
    </span>
  );
}

function PlanButtonShown({ billing, variant }: { billing: BillingState; variant: "top" | "card" }) {
  const plan = usePlanSummary(billing);
  const navigate = useNavigate();
  if (!plan) return null;
  const card = variant === "card";

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${W.button}: ${plan.name}, ${plan.sub}`}
          data-plan-button={plan.name === "Unlimited" ? "unlimited" : "pay_per_job"}
          className={
            card
              ? "ck-card flex w-full items-center gap-3 p-4 text-left"
              : "flex min-w-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 transition-colors hover:bg-[var(--hf-surface-raised)] data-[state=open]:bg-[var(--hf-surface-raised)]"
          }
          style={card ? undefined : { border: "1px solid var(--line)", background: "var(--surface)", boxShadow: "var(--hf-shadow-soft)" }}
        >
          <PlanGlyph plan={plan} size={card ? 40 : 28} />
          <span className={card ? "min-w-0 flex-1" : "min-w-0 text-left"}>
            <span className="block truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--hf-text)" }}>
              {plan.name}
            </span>
            <span className="block truncate text-[12px] leading-tight" style={{ color: plan.warning ? "var(--under)" : "var(--ink-3)" }}>
              {plan.sub}
            </span>
          </span>
          {card ? (
            <ChevronsUpDown className="h-4 w-4 shrink-0" style={{ color: "var(--hf-text-muted)" }} />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--hf-text-muted)" }} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={card ? "start" : "end"}
        side="bottom"
        sideOffset={8}
        className={`${card ? "w-[var(--radix-dropdown-menu-trigger-width)]" : "w-[300px]"} max-w-[calc(100vw-32px)] p-1.5`}
        style={{ background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "var(--shadow-md)", color: "var(--hf-text)" }}
        data-plan-menu
      >
        <div className="px-2.5 pb-2 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
            {W.button}
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <span className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
              {plan.name}
            </span>
            {/* What it costs is money: brass, and only here. */}
            <span className="text-right text-[12px] font-medium" style={{ color: "var(--brass)" }}>
              {plan.priceLine}
            </span>
          </div>
          {plan.unlimitedLine && (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              {plan.unlimitedLine}
            </p>
          )}
          {plan.freeLine && (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              {plan.freeLine}
            </p>
          )}
          {plan.warning && (
            <p role="alert" className="mt-1.5 text-[12.5px]" style={{ color: "var(--under)" }}>
              {plan.warning}
            </p>
          )}
        </div>

        <DropdownMenuSeparator style={{ background: "var(--line)" }} />
        <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
          {W.liveJobs}
        </div>
        {plan.jobs.length === 0 ? (
          <p className="px-2.5 pb-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {W.noJobs}
          </p>
        ) : (
          <div className="max-h-[240px] overflow-y-auto">
            {plan.jobs.map((job) => (
              <DropdownMenuItem
                key={job.id}
                onSelect={() => navigate(`/jobs/${job.id}`)}
                className="cursor-pointer gap-3 rounded-lg px-2.5 py-2 focus:bg-[var(--surface-2)]"
                data-plan-job={job.id}
              >
                {job.daysLeft !== null ? (
                  <DaysRing left={job.daysLeft} total={job.total} size={30} />
                ) : (
                  <span aria-hidden className="flex h-[30px] w-[30px] shrink-0 items-center justify-center">
                    <span className="h-2 w-2 rounded-full" style={{ background: "var(--action)" }} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium" style={{ color: "var(--ink)" }}>
                    {job.title}
                  </span>
                  <span className="block truncate text-[12px]" style={{ color: job.daysLeft !== null && job.daysLeft <= 3 ? "var(--under)" : "var(--ink-3)" }}>
                    {job.line}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        <DropdownMenuSeparator style={{ background: "var(--line)" }} />
        <DropdownMenuItem
          onSelect={() => navigate("/settings?tab=billing")}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[var(--surface-2)]"
          data-plan-link="billing"
        >
          <CreditCard className="h-[18px] w-[18px]" style={{ color: "var(--hf-text-muted)" }} />
          <span className="flex-1">{W.billing}</span>
          <ChevronRight className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => navigate("/settings?tab=billing#payment-history")}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[var(--surface-2)]"
          data-plan-link="history"
        >
          <History className="h-[18px] w-[18px]" style={{ color: "var(--hf-text-muted)" }} />
          <span className="flex-1">{W.history}</span>
          <ChevronRight className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  if (card) return menu;
  // Its own slim row at the top right of the page area, on a computer only (a phone has it on More).
  return (
    <div className="pointer-events-none relative z-20 hidden justify-end px-[26px] pt-3 md:flex" data-plan-top>
      <div className="pointer-events-auto">{menu}</div>
    </div>
  );
}
