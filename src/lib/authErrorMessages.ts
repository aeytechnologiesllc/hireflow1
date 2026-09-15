/**
 * Turns a Supabase auth error (from signUp / updateUser) into one friendly,
 * plain-English message we can show under the password field without
 * clearing whatever the person already typed.
 *
 * Supabase's "block leaked passwords" setting makes signUp/updateUser
 * reject a password that's shown up in a known data breach. That comes
 * back as an AuthWeakPasswordError with error.code === "weak_password"
 * and error.reasons possibly including "pwned". Every screen that sets a
 * password should route its error through this helper so the message is
 * the same everywhere and stays friendly if Supabase's wording changes.
 */
export function getPasswordErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const err = error as { code?: string; reasons?: unknown; message?: string };

  const reasons = Array.isArray(err.reasons) ? err.reasons.map(String) : [];
  const isLeaked =
    reasons.includes("pwned") || /pwned|leak/i.test(err.message ?? "");

  if (err.code === "weak_password" && isLeaked) {
    return "That password has shown up in a data leak on another site, so it isn't safe to use. Please choose a different one.";
  }

  if (err.code === "weak_password") {
    return "That password is too weak. Please choose a stronger one.";
  }

  return null;
}
