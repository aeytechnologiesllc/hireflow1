import { supabase } from "@/integrations/supabase/client";

/**
 * Does this session still owe the second step of two-step sign-in? (The
 * account has a verified authenticator and the session has not entered its
 * code yet.) src/components/auth/SecondStepForm.tsx asks for it;
 * docs/LAUNCH-PLAN.md, Phase 1, task 7.
 */
export async function needsSecondStep(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}
