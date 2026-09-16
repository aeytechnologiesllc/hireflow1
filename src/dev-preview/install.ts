/**
 * Dev-preview-only. Called once, before the real app renders (see the DEV-only
 * branch in src/main.tsx), when the URL carries `?__preview=1`. Swaps the
 * app's `supabase` singleton for an offline fixture client and picks which
 * fixture user is "signed in", so every real page, hook and mapper in the app
 * runs completely unmodified against canned data — no network, no auth.
 */
import { __setPreviewSupabaseClient } from "@/integrations/supabase/client";
import { createFixtureSupabaseClient, type FixtureAuthUser } from "./fixtureClient";
import { buildFixtureTables, fixtureRpcHandlers } from "./fixtures";
import {
  CANDIDATE_USER_ID,
  EMPLOYER_USER_ID,
  REJECTED_CANDIDATE_USER_ID,
  TEAM_MEMBER_USER_ID,
} from "./ids";

export type PreviewRole = "employer" | "team_member" | "candidate" | "rejected_candidate";

const ROLE_USERS: Record<PreviewRole, FixtureAuthUser> = {
  employer: { id: EMPLOYER_USER_ID, email: "maria@mariascafe.example", user_metadata: { role: "employer", full_name: "Maria Alvarado" } },
  team_member: { id: TEAM_MEMBER_USER_ID, email: "diego@mariascafe.example", user_metadata: { role: "team_member", full_name: "Diego Ferreira" } },
  candidate: { id: CANDIDATE_USER_ID, email: "jordan.alvarez@example.com", user_metadata: { role: "candidate", full_name: "Jordan Alvarez" } },
  rejected_candidate: { id: REJECTED_CANDIDATE_USER_ID, email: "sam.rivera@example.com", user_metadata: { role: "candidate", full_name: "Sam Rivera" } },
};

function isPreviewRole(value: string | null): value is PreviewRole {
  return !!value && Object.prototype.hasOwnProperty.call(ROLE_USERS, value);
}

export function install(params: URLSearchParams): void {
  const roleParam = params.get("__previewRole");
  const role: PreviewRole = isPreviewRole(roleParam) ? roleParam : "employer";
  const theme = params.get("__previewTheme");

  if (theme === "light" || theme === "dark") {
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // Private-browsing / storage-blocked — theme just falls back to default.
    }
  }

  const client = createFixtureSupabaseClient({
    user: ROLE_USERS[role],
    tables: buildFixtureTables(),
    rpc: fixtureRpcHandlers,
  });

  __setPreviewSupabaseClient(client as never);

  // A visible, unmistakable marker so nobody mistakes this for the real
  // signed-in app — matches the banner rendered by DevPreviewPicker.
  try {
    document.documentElement.setAttribute("data-hireflow-preview", role);
  } catch {
    // no-op — cosmetic only
  }
}
