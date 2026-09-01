import {
  GlyphLetter,
  GlyphCheckSeal,
} from "@/components/candidate/glyphs";
import {
  GlyphJobPost,
  GlyphScenarios,
  GlyphTyping,
  GlyphCallingCard,
  GlyphExchange,
  GlyphQuoted,
  GlyphForme,
  GlyphRosette,
} from "@/components/ava/employerGlyphs";

/**
 * The one place a step's kind becomes a brand mark.
 *
 * This lived inside the employer create-flow's shared.tsx, which also pulls in
 * framer-motion, GemRail and AvaGlyph — so the candidate side could not reach
 * it without dragging the whole create flow along, and instead carried its own
 * map of stock lucide icons (FileCheck, ClipboardList, Video, Keyboard,
 * MessageSquare, Briefcase, Mic, Eye). That map drew the candidate's own
 * journey — the most-looked-at surface on their side of the product — in
 * exactly the generic voice the brand kit exists to replace.
 *
 * Matching is on substrings so it accepts both the employer's human-readable
 * labels ("Video walkthrough") and the candidate's stored step types
 * ("video_intro"). Order matters: "chat_interview" must land on the chat mark,
 * not the interview one, so the chat test comes first.
 */
export function glyphForKind(kind: string) {
  const k = kind.toLowerCase();
  if (k.includes("job post") || k.includes("listing")) return GlyphJobPost;
  if (k.includes("application")) return GlyphLetter;
  if (k.includes("quiz") || k.includes("scenario")) return GlyphScenarios;
  if (k.includes("typing") || k.includes("skills")) return GlyphTyping;
  if (k.includes("video") || k.includes("walkthrough")) return GlyphCallingCard;
  if (k.includes("chat") || k.includes("simulation") || k.includes("sim")) return GlyphExchange;
  if (k.includes("voice") || k.includes("interview")) return GlyphQuoted;
  if (k.includes("cod") || k.includes("technical")) return GlyphForme;
  // A forme is the frame a printer locks finished work into — the closest
  // thing in this kit to a body of work presented for judgement.
  if (k.includes("portfolio")) return GlyphForme;
  if (k.includes("shortlist") || k.includes("rank")) return GlyphRosette;
  // The closing stage. It had been falling through to the letter, which says
  // "something is on its way" — the opposite of a decision having been made.
  if (k.includes("decision")) return GlyphRosette;
  if (k.includes("reliab") || k.includes("reference")) return GlyphCheckSeal;
  return GlyphLetter;
}
