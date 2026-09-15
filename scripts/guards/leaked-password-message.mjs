/**
 * When Supabase's "block leaked passwords" setting is on, signUp/updateUser
 * return an AuthWeakPasswordError (error.code === "weak_password", possibly
 * with reasons including "pwned"). Every call site that sets a password
 * must route that error through src/lib/authErrorMessages.ts so the person
 * sees one friendly, plain-English message instead of Supabase's raw text.
 */
export default [
  {
    id: "leaked-password-message",
    why: "A signUp/updateUser call site that doesn't route its error through getPasswordErrorMessage will show Supabase's raw weak_password/pwned error text instead of a friendly message.",
    run: async ({ read, sources }) => {
      const detail = [];

      const helper = await read("src/lib/authErrorMessages.ts");
      if (helper == null) {
        return {
          ok: false,
          detail: ["src/lib/authErrorMessages.ts is missing"],
        };
      }
      if (!/getPasswordErrorMessage/.test(helper)) {
        detail.push(
          "src/lib/authErrorMessages.ts no longer exports getPasswordErrorMessage",
        );
      }

      const files = await sources([".ts", ".tsx"]);
      for (const { rel, text } of files) {
        if (!text) continue;
        // Skip the helper's own file and the auth hook's use of supabase.auth.signUp
        // (that's the one place the raw call is allowed — it wraps the error).
        if (rel === "src/lib/authErrorMessages.ts") continue;

        const setsPassword = /supabase\.auth\.(signUp|updateUser)\s*\(/.test(text);
        if (!setsPassword) continue;

        // updateUser is also used for things unrelated to passwords (e.g. email
        // changes) — only flag call sites that actually pass a password.
        const updateUserCalls = [...text.matchAll(/supabase\.auth\.updateUser\s*\(\{([^}]*)\}/gs)];
        const updateUserSetsPassword = updateUserCalls.some((m) => /password\s*:/.test(m[1]));
        const isSignUp = /supabase\.auth\.signUp\s*\(/.test(text);

        if (!isSignUp && !updateUserSetsPassword) continue;

        if (!/getPasswordErrorMessage/.test(text)) {
          detail.push(
            `${rel} calls supabase.auth.${isSignUp ? "signUp" : "updateUser"} with a password but never imports/uses getPasswordErrorMessage`,
          );
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
