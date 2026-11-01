/**
 * How every email from send-notification-email looks (2026-11-01): the brand's
 * green seal over a paper card on sage, the app's jade for the button and the
 * links, the system's own fonts. Presentation only: who may send which email,
 * to whom, signed by whom and saying what are decided in index.ts and
 * notificationAccess.ts, never here. docs/NOTIFICATION-EMAILS.md, "How the
 * emails look".
 *
 * The colours are the app's Day tokens (src/index.css): sage ground #DEE3D5,
 * paper card #F5F1E6, green ink #1D3329 / #304238 / #4B5D53, hairlines
 * #C4CCBB / #D8DDCF, the jade #0F6B4F with its ivory button text #F3EFE4. A
 * mail app in dark mode that honours prefers-color-scheme (Apple Mail, iOS
 * Mail, Outlook for Mac; Outlook.com through [data-ogsc]) gets the Night tokens
 * instead: warm ink #14120E / #221D17, ivory text #F4EFE3, the bright jade
 * #4FBF95. One that recolours by itself (the Gmail apps) still has dark text on
 * mid-light paper or light text on dark, never the same on the same.
 *
 * The seal is a hosted PNG, the app's own home-screen icon (the seal on a
 * paper square, rounded): mail apps drop SVG and inline images bloat every
 * email. Its link carries the icon links' version (?v=9, index.html).
 *
 * Every rule in the <style> block sits inside an HTML comment with no ">" in
 * it: old clients that print a <style> they cannot read print nothing, and the
 * email's words start with its heading and end with its signature
 * (scripts/notification_access.test.mjs reads them so).
 *
 * No imports: plain strings, safe to load in Node and Deno alike.
 */

/** The seal at the top: hireflownow.com's own 192 px icon. */
export const EMAIL_SEAL_URL = "https://hireflownow.com/icon-192.png?v=9";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

/** The Day colours, by name. */
export const EMAIL_COLOURS = {
  ground: "#DEE3D5",
  card: "#F5F1E6",
  well: "#E9E5D7",
  line: "#C4CCBB",
  lineSoft: "#D8DDCF",
  hair: "#AEB8A4",
  ink: "#1D3329",
  ink2: "#304238",
  ink3: "#4B5D53",
  action: "#0F6B4F",
  actionText: "#F3EFE4",
  crit: "#A8352A",
} as const;
const C = EMAIL_COLOURS;

/**
 * The attributes of the pieces a template uses, so every email says a quiet
 * line, a list or a quote the same way (and dark mode can find them by class).
 * A template writes `<p ${EMAIL_ATTR.muted}>`.
 */
export const EMAIL_ATTR = {
  /** A quieter line: what to do next, where to look. */
  muted: `class="hf-muted" style="margin:0 0 14px;color:${C.ink3};"`,
  /** The small print (who can see what they send). */
  small: `class="hf-muted" style="margin:0 0 14px;color:${C.ink3};font-size:13px;line-height:1.5;"`,
  /** Someone's own words, quoted (a message's first lines). */
  quote: `class="hf-quote" style="margin:0 0 14px;padding:2px 0 2px 12px;border-left:3px solid ${C.hair};color:${C.ink2};font-style:italic;"`,
  /** A list's box (ul or ol). */
  list: `style="margin:0 0 14px;padding-left:22px;color:${C.ink};"`,
  /** One item in it. */
  item: `style="margin:0 0 6px;"`,
  /** Something gone wrong on the business's side. */
  alert: `class="hf-alert" style="margin:0 0 14px;color:${C.crit};"`,
  /** The 6-digit code, set apart and large. */
  code: `class="hf-code" style="margin:22px 0;font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;font-size:30px;font-weight:700;letter-spacing:6px;color:${C.ink};"`,
  /** A link in the words: the jade, underlined. */
  link: `class="hf-link" style="color:${C.action};font-weight:600;text-decoration:underline;"`,
} as const;

/** The <head>'s rules: spacing, and the Night colours for a mail app in dark mode. No ">" anywhere (see above). */
const STYLE = `
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
  .hf-card p { margin: 0 0 14px; }
  .hf-card a { color: ${C.action}; }
  @media (max-width: 480px) {
    .hf-card { padding: 22px 18px 18px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .hf-bg { background: #14120E !important; }
    .hf-card { background: #221D17 !important; border-color: #3A3329 !important; color: #F4EFE3 !important; }
    .hf-card h1, .hf-card p, .hf-card li, .hf-card strong, .hf-card ol, .hf-card ul { color: #F4EFE3 !important; }
    .hf-card .hf-muted, .hf-card .hf-sign { color: #C3BBA9 !important; }
    .hf-card .hf-quote { color: #C3BBA9 !important; border-color: #5A5246 !important; }
    .hf-card .hf-alert { color: #F0A093 !important; }
    .hf-card .hf-note { background: #2C2620 !important; color: #C3BBA9 !important; }
    .hf-card .hf-note strong { color: #F4EFE3 !important; }
    .hf-card a, .hf-card .hf-link { color: #6ADCAA !important; }
    .hf-card .hf-btn { background: #4FBF95 !important; color: #17140F !important; }
    .hf-card .hf-sign { border-color: #3A3329 !important; }
  }
  [data-ogsc] .hf-bg { background: #14120E !important; }
  [data-ogsc] .hf-card { background: #221D17 !important; border-color: #3A3329 !important; }
  [data-ogsc] .hf-card h1, [data-ogsc] .hf-card p, [data-ogsc] .hf-card li, [data-ogsc] .hf-card strong { color: #F4EFE3 !important; }
  [data-ogsc] .hf-card .hf-muted, [data-ogsc] .hf-card .hf-sign, [data-ogsc] .hf-card .hf-note { color: #C3BBA9 !important; }
  [data-ogsc] .hf-card a { color: #6ADCAA !important; }
  [data-ogsc] .hf-card .hf-btn { background: #4FBF95 !important; color: #17140F !important; }
`;

/** The one button: a table cell, so Outlook draws its colour too. */
export function emailButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px;border-collapse:separate;">
          <tr>
            <td class="hf-btn" style="border-radius:10px;background:${C.action};">
              <a href="${url}" class="hf-btn" style="display:inline-block;padding:12px 22px;border-radius:10px;background:${C.action};color:${C.actionText};font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;text-decoration:none;">${text}</a>
            </td>
          </tr>
        </table>`;
}

/**
 * The box under an applicant's email that says where to write instead of
 * replying. `html` is the template's own trusted markup.
 */
export function emailNote(html: string): string {
  return `<p class="hf-note" style="margin:26px 0 0;padding:12px 14px;border-radius:10px;background:${C.well};color:${C.ink2};font-size:14px;line-height:1.5;">${html}</p>`;
}

/**
 * The whole email around a template's words. `title`, `content`, `button`,
 * `note` and `signature` are already escaped or trusted markup (index.ts
 * escapes every value it puts in them); this only places them.
 */
export function emailShell({ title, content, button, note, signature }: { title: string; content: string; button?: string; note?: string; signature: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style type="text/css"><!--${STYLE}--></style>
  </head>
  <body class="hf-bg" style="margin:0;padding:0;background:${C.ground};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="hf-bg" style="background:${C.ground};">
      <tr>
        <td align="center" style="padding:28px 12px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 2px 14px;">
                <img src="${EMAIL_SEAL_URL}" width="44" height="44" alt="HireFlow" style="display:block;width:44px;height:44px;border:0;border-radius:10px;">
              </td>
            </tr>
            <tr>
              <td class="hf-card" style="padding:28px 28px 22px;border:1px solid ${C.line};border-radius:14px;background:${C.card};color:${C.ink};font-family:${FONT};font-size:15px;line-height:1.6;text-align:left;">
                <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:24px;font-weight:normal;line-height:1.25;color:${C.ink};">${title}</h1>
                ${content}
                ${button ?? ""}
                ${note ?? ""}
                <p class="hf-sign" style="margin:28px 0 0;padding-top:16px;border-top:1px solid ${C.lineSoft};color:${C.ink3};font-size:13px;">${signature}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
