/**
 * salesScenarios.ts — the sales practice's cases, as the server knows them
 * (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, found by the Pass C review).
 *
 * ai-sales-simulation records nothing and builds its prompt from the
 * request, so it accepts a turn only when the request's case is one of the
 * step's own: the cases the business configured on the step
 * (workflow_steps[].config.scenarios), or, when it configured none, the
 * built-in three the page falls back to. DEFAULT_SALES_SCENARIOS must stay
 * identical to `defaultScenarios` in src/pages/SalesSimulationPhase.tsx;
 * scripts/ai_endpoint_limits.test.mjs fails if they drift.
 *
 * Pure, no imports.
 */

export interface SalesScenario {
  id: string;
  prospectName: string;
  prospectCompany: string;
  prospectRole: string;
  scenario: string;
  productService: string;
}

export const DEFAULT_SALES_SCENARIOS: readonly SalesScenario[] = [
  {
    id: "scenario1",
    prospectName: "Michael Chen",
    prospectCompany: "TechFlow Solutions",
    prospectRole: "VP of Operations",
    scenario: "Mid-size tech company looking to streamline their operations. They've had issues with their current vendor and are open to alternatives, but skeptical after a bad experience.",
    productService: "Enterprise software solution",
  },
  {
    id: "scenario2",
    prospectName: "Sarah Williams",
    prospectCompany: "GrowthFirst Marketing",
    prospectRole: "Marketing Director",
    scenario: "Growing marketing agency struggling to scale. They need better tools but are cost-conscious and have a small team that's resistant to change.",
    productService: "Marketing automation platform",
  },
  {
    id: "scenario3",
    prospectName: "David Park",
    prospectCompany: "Metro Healthcare Group",
    prospectRole: "Chief Technology Officer",
    scenario: "Healthcare organization with strict compliance requirements. They need a solution but are concerned about security, implementation time, and disruption to existing workflows.",
    productService: "Healthcare management system",
  },
];

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The step's own cases, the way the page reads them (normalizeSalesScenarios). */
export function salesScenariosOf(config: unknown): readonly SalesScenario[] {
  const raw = config && typeof config === "object" ? (config as Record<string, unknown>).scenarios : null;
  if (!Array.isArray(raw)) return DEFAULT_SALES_SCENARIOS;
  const valid = raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .filter((c) => ["prospectName", "prospectCompany", "prospectRole", "scenario", "productService"].every((k) => text(c[k]).length > 0))
    .map((c, i) => ({
      id: text(c.id) || `scenario-${i + 1}`,
      prospectName: text(c.prospectName),
      prospectCompany: text(c.prospectCompany),
      prospectRole: text(c.prospectRole),
      scenario: text(c.scenario),
      productService: text(c.productService),
    }));
  return valid.length > 0 ? valid : DEFAULT_SALES_SCENARIOS;
}

/** Is the request's case one of these? Compared on what reaches the prompt. */
export function isKnownSalesCase(
  cases: readonly SalesScenario[],
  request: { scenario?: unknown; prospectName?: unknown; prospectCompany?: unknown; productService?: unknown },
): boolean {
  return cases.some(
    (c) =>
      c.scenario === text(request.scenario) &&
      c.prospectName === text(request.prospectName) &&
      c.prospectCompany === text(request.prospectCompany) &&
      c.productService === text(request.productService),
  );
}
