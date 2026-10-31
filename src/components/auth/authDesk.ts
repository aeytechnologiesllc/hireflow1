/**
 * The sign-in pages' look: the front page's desk (the run-through of
 * 2026-10-31: sign-up went from the light sage Desk to a near-black page with
 * a brass pill and a dots-and-lines network, "like another site" at the moment
 * of trust).
 *
 * By Day: the sage ground with the front page's warm wash from the window
 * side, a paper card for the form, Besley headings, the jade action colour,
 * ivory fields that light up jade when typed in. Brass is not used: it is
 * Ava's seal and money (CLAUDE.md, Branding). Every colour is a theme token, so
 * a saved Night choice shows the same page on warm ink.
 *
 * Used by the business sign-in (src/pages/Auth.tsx), the applicant sign-in
 * (src/pages/CandidateAuth.tsx) and the team invitation (src/pages/JoinTeam.tsx).
 * The two sign-in pages load Besley from the front page's own Google Fonts
 * address (a literal link in each page, so the stored-links guard reads it as
 * fixed); JoinTeam falls back to Georgia until it is cached.
 */

export const AUTH_DESK_CSS = `
  .auth-desk{
    --auth-wash: rgba(240, 225, 190, 0.55);
    --auth-shade: rgba(29, 51, 41, 0.06);
    --auth-field: color-mix(in srgb, var(--surface) 55%, #ffffff);
    --auth-field-edge: var(--hair);
    --auth-card-shadow: 0 1px 0 rgba(255, 255, 255, 0.55) inset, 0 2px 6px -2px rgba(22, 40, 31, 0.10), 0 22px 44px -24px rgba(22, 40, 31, 0.34);
    background:
      linear-gradient(242deg, var(--auth-wash) 0%, transparent 60%),
      linear-gradient(180deg, transparent 40%, var(--auth-shade) 100%),
      var(--ground);
    color: var(--ink);
  }
  .dark .auth-desk{
    --auth-wash: rgba(224, 185, 106, 0.05);
    --auth-shade: transparent;
    --auth-field: var(--ground);
    /* Night's --hair is brass; a field's edge is not Ava's or money's. */
    --auth-field-edge: rgba(244, 239, 227, 0.2);
    --auth-card-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.65);
  }
  .auth-desk h1,.auth-desk h2{font-family:"Besley",Georgia,serif;font-weight:600;letter-spacing:-0.012em;color:var(--ink);}
  .auth-desk .auth-card{background:var(--surface);border:1px solid var(--line);box-shadow:var(--auth-card-shadow);}
  .auth-desk .auth-kicker{font-size:12px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--action-soft-fg);}
  .auth-desk .auth-lede{color:var(--ink-2);}
  .auth-desk input:not([type="checkbox"]){
    background:var(--auth-field);
    border-color:var(--auth-field-edge);
    color:var(--ink);
    transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;
  }
  .auth-desk input:not([type="checkbox"]):focus,.auth-desk input:not([type="checkbox"]):focus-visible{
    outline:none;
    border-color:var(--action);
    box-shadow:0 0 0 3px color-mix(in srgb, var(--action) 18%, transparent);
    --tw-ring-color:transparent;
    --tw-ring-offset-width:0px;
    --tw-ring-shadow:0 0 #0000;
    --tw-ring-offset-shadow:0 0 #0000;
  }
`;
