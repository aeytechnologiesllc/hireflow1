/**
 * Settings' tabs for the hiring side (2026-11-01; the owner: "billing should
 * have its own sub-tab, so it should be like general, billing, maybe account,
 * notifications"). A link opens one directly: /settings?tab=billing (or
 * #billing); Stripe's way back (?billing=…) opens Billing.
 *
 * No imports: scripts/billing_screens.test.mjs loads it in Node.
 */
export const SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "billing", label: "Billing" },
  { key: "account", label: "Account" },
  { key: "notifications", label: "Notifications" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

const isTab = (value: string | null | undefined): value is SettingsTab => SETTINGS_TABS.some((t) => t.key === value);

/** The tab a Settings address asks for (General when it names none). */
export function settingsTabFrom(search: string, hash: string): SettingsTab {
  const params = new URLSearchParams(search);
  const named = params.get("tab");
  if (isTab(named)) return named;
  const anchor = (hash ?? "").replace(/^#/, "");
  if (isTab(anchor)) return anchor;
  if (anchor === "payment-history") return "billing";
  if (params.get("billing")) return "billing";
  return "general";
}

/**
 * The tab shown: Billing only when the account has it (the owner, billing on,
 * not exempt); asked for while that is still loading, it waits on Billing
 * rather than jumping to General and back.
 */
export function shownSettingsTab(asked: SettingsTab, billingTab: boolean, billingLoading: boolean): SettingsTab | "loading" {
  if (asked !== "billing" || billingTab) return asked;
  return billingLoading ? "loading" : "general";
}
