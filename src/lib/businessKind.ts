/**
 * "Something else" on "What kind of business is it?" (src/pages/AvaCreateJob.tsx).
 * The owner, building a real job on 2026-11-01: "when you click on something
 * else, you should be able to define what it is and Ava should be able to
 * pick a category from that ... so they know that it's smart. Now something
 * else doesn't do anything."
 *
 * The business says what it does in a few words ("a pet grooming salon", "we
 * fix air conditioners"), and this picks the closest scenario pack (the skills
 * check's five questions and the practice's six cases, src/content/scenarioPacks)
 * by its words alone: no AI call, the same answer every time. Nothing it knows
 * is the general pack, and the builder says so.
 *
 * How it reads, in order:
 *  - Only the business's own kind: what comes before "for", "serving" or "that
 *    helps" is read first ("software for dental clinics" is software, "an
 *    online store for pet supplies" a store), then the whole text.
 *  - Selling online is a store whatever it sells ("we sell dental supplies
 *    online"), then a dental office, a medical office, home services, a game
 *    company, software, and last a shop in plain words ("a flower shop").
 *  - Animals are never patients ("a vet clinic", "pet dental care" are the
 *    general pack: the medical and dental packs' rules are for people), a law
 *    clinic is no medical office, and betting, casinos and sweepstakes are
 *    never the game company (CLAUDE.md, "Positioning").
 *
 * Pure: no React, no Supabase (scripts/business_kind.test.mjs).
 */
import type { ScenarioPackId } from "@/content/scenarioPacks/packs";

export interface BusinessKindReading {
  /** The closest pack; "general" when nothing in the words names one. */
  pack: ScenarioPackId;
  /** The words that picked it, as the business wrote them; null for the general pack. */
  matched: string | null;
}

const ANIMALS = /\b(vets?|veterinar\w*|animals?|pets?|dogs?|cats?|horses?|equine|livestock)\b/i;
const NOT_A_CLINIC = /\b(legal|law|tax|business|career)\s+clinics?\b/i;
const BETTING = /\b(casinos?|gambl\w*|betting|bets|sportsbooks?|sweepstakes|lotter(y|ies)|slots?|poker|bingo|sabong|jueteng|raffles?)\b/i;

/** Each pack's words, in the order they are tried. `strong` store words come first: selling online is a store. */
const RULES: ReadonlyArray<{ pack: ScenarioPackId; words: RegExp; skip?: RegExp }> = [
  {
    pack: "store",
    words:
      /\b(online (stores?|shops?|boutiques?|retailers?|sellers?|business(es)? selling)|e-?commerce|web ?shops?|shopify|etsy|amazon (sellers?|stores?|fba)|ebay|shopee|lazada|tiktok shop|dropship\w*|sell(s|ing)?\s+(\S+\s+){0,4}online|online selling|subscription box(es)?|mail[- ]order)\b/i,
  },
  {
    pack: "dental",
    words: /\b(dental|dentists?|dentistry|orthodont\w*|endodont\w*|periodont\w*|oral surg\w*|teeth|tooth|invisalign)\b/i,
    skip: ANIMALS,
  },
  {
    pack: "medical",
    words:
      /\b(clinics?|medical|doctors?|physicians?|hospitals?|urgent care|health ?care|patients?|p(a)?ediatric\w*|dermatolog\w*|cardiolog\w*|physio\w*|physical therap\w*|chiropract\w*|optometr\w*|opticians?|eye (care|doctors?|clinics?)|pharmac\w*|(?<!massage )therap(y|ies|ists?)|mental health|psychiatr\w*|psycholog\w*|telehealth|telemedicine|nurs(e|es|ing)|med ?spas?|lab tests?|radiolog\w*|fertility|ob-?gyn|maternity|primary care|family practice|health (center|centre)s?)\b/i,
    skip: ANIMALS,
  },
  {
    pack: "home_services",
    words:
      /\b(plumb\w*|electricians?|electrical (repairs?|services?|contractors?|work)|hvac|air ?con\w*|aircon|heating|furnaces?|pest control|exterminat\w*|termites?|cleaning (company|companies|service|services|business)|cleaners|house ?cleaning|home cleaning|maids?|janitorial|carpet cleaning|window cleaning|handym[ae]n|repairs?|repairing|roof(ing|ers?|s)?|landscap\w*|lawns?|garden(ing|ers?)|tree (services?|removal|trimming)|movers|moving (company|service|services)|removals|locksmiths?|pool (service|cleaning|maintenance)|appliance (repairs?|installation|service)|painting (company|contractors?|services?)|house painters?|renovat\w*|remodel\w*|construction|solar (install\w*|panels?)|garage doors?|home services?|gutters?|pressure washing|power washing|septic|water heaters?|flooring|fenc(e|es|ing) (installation|install\w*|repairs?|company|contractors?))\b/i,
  },
  {
    pack: "gaming",
    words:
      /\b(video ?games?|mobile games?|online games?|pc games?|console games?|indie games?|game (studios?|compan(y|ies)|developers?|publishers?|apps?|servers?|platforms?)|gaming|esports|e-sports|mmo\w*|roblox|minecraft|(make|makes|making|build|builds|develop|develops|publish|publishes)\s+(\S+\s+){0,2}games)\b/i,
    skip: new RegExp(`${BETTING.source}|\\b(board|card|tabletop) games?\\b|\\bgame (cafe|café|bar|night)s?\\b`, "i"),
  },
  {
    pack: "software",
    words:
      /\b(software|saas|apps?|platforms?|tech (company|startup)|technology company|start-?ups?|website builders?|web hosting|it (services|support|company)|managed services|cloud (software|services?|hosting|platform|storage)|crm|api|fintech|internet (provider|service)|isp|telecom\w*|online (tools?|services?|courses?|learning|classes|school|tutoring)|edtech|e-?learning|digital products?)\b/i,
  },
  {
    pack: "store",
    words:
      /\b(shops?|stores?|boutiques?|retail\w*|products|apparel|clothing|fashion|cosmetics|skincare|supplements|furniture|electronics|gadgets|bakery|bakeries|florists?|flower (shop|delivery)|deliveries|delivery|orders|grocer(y|ies)|merch\w*|toys)\b/i,
    skip: /\b(barber|tattoo|nail|hair|beauty|massage|coffee) (shops?|salons?|parlou?rs?|bars?)\b/i,
  },
];

function readPart(text: string): BusinessKindReading | null {
  if (NOT_A_CLINIC.test(text) && !/\b(medical|doctors?|dental|dentists?)\b/i.test(text)) {
    // A legal or tax clinic is no medical office; anything else in the words can still decide.
    text = text.replace(NOT_A_CLINIC, " ");
  }
  for (const rule of RULES) {
    if (rule.skip && rule.skip.test(text)) continue;
    const hit = rule.words.exec(text);
    if (hit) return { pack: rule.pack, matched: hit[0].trim() };
  }
  return null;
}

/** The business's own kind, before "for", "serving", "that helps" and the like ("software for dentists" is "software"). */
function ownKindPart(text: string): string {
  return text.split(/\b(?:for|serving|that (?:helps?|serves?|sells? to|works? with)|who (?:help|serve|work with)|to help|helping)\b/i)[0] ?? text;
}

/** The closest pack for "Tell Ava what your business does", by its words alone. */
export function businessKindFromWords(words: string | null | undefined): BusinessKindReading {
  const text = (words ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!text) return { pack: "general", matched: null };
  if (BETTING.test(text)) {
    // Betting, a casino or a sweepstakes: never the game company, whatever else it says; a store's words still count.
    const store = readPart(text);
    return store && store.pack !== "gaming" && store.pack !== "software" ? store : { pack: "general", matched: null };
  }
  const head = ownKindPart(text);
  return (head !== text ? readPart(head) : null) ?? readPart(text) ?? { pack: "general", matched: null };
}

/** "Ava will use: Home services situations". */
export const PACK_SITUATIONS: Readonly<Record<ScenarioPackId, string>> = {
  medical: "Medical office situations",
  dental: "Dental office situations",
  store: "Online store situations",
  software: "Software or app situations",
  home_services: "Home services situations",
  gaming: "Game company situations",
  general: "Everyday situations for any business",
};

/** The packs to change to, in the chips' order (the general one last). */
export const PACK_CHOICES: ReadonlyArray<{ pack: ScenarioPackId; label: string }> = [
  { pack: "medical", label: "Medical office" },
  { pack: "dental", label: "Dental office" },
  { pack: "store", label: "Online store" },
  { pack: "software", label: "Software or app" },
  { pack: "home_services", label: "Home services" },
  { pack: "gaming", label: "Gaming" },
  { pack: "general", label: "Any kind of business" },
];

/**
 * The line under the business's words: which situations Ava will use, and
 * why. `picked` is the business's own choice from "Change", which wins.
 */
export function businessKindLine(words: string | null | undefined, picked?: ScenarioPackId | null): { pack: ScenarioPackId; text: string; tone: "found" | "plain" } | null {
  const t = (words ?? "").trim();
  if (!t && !picked) return null;
  if (picked) return { pack: picked, text: `Ava will use: ${PACK_SITUATIONS[picked]}. You picked this.`, tone: "found" };
  const read = businessKindFromWords(t);
  if (read.pack === "general") {
    return { pack: "general", text: `Ava will use: ${PACK_SITUATIONS.general}. Nothing in your words matched a kind she has situations for, so she keeps them general.`, tone: "plain" };
  }
  return { pack: read.pack, text: `Ava will use: ${PACK_SITUATIONS[read.pack]}, from “${read.matched}”.`, tone: "found" };
}
