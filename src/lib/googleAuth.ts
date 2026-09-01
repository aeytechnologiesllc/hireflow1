/**
 * Whether to offer "Continue with Google" anywhere in the product.
 *
 * Google OAuth is NOT enabled on the Supabase project — /auth/v1/settings
 * reports `external.google: false` — so every Google button is inert until
 * someone turns the provider on. Auth.tsx and CandidateAuth.tsx each kept their
 * own copy of this flag and gated correctly; SaveProgressPrompt and JoinTeam
 * did not have it and shipped the button anyway, with two different failures:
 *
 *   SaveProgressPrompt  passes a RELATIVE redirect, so `new URL(...)` throws and
 *                       the candidate gets a red toast reading
 *                       "Failed to construct 'URL': Invalid URL".
 *   JoinTeam            passes an absolute one, so the browser actually leaves
 *                       and the invitee lands on raw Supabase JSON:
 *                       {"code":400,...,"msg":"Unsupported provider"}.
 *
 * One flag, imported everywhere, so a fifth button cannot be added without it.
 * Set VITE_GOOGLE_AUTH_ENABLED=true once the provider is live; no logic here
 * needs to change.
 */
export const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
