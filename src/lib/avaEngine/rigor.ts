/** Rigor scaling — maps plan rigor to phase counts and score bars. */
import type { Rigor } from "./types";

export interface RigorSpec {
  app: number;
  quiz: number;
  simulation: number;
  voice: number;
  topN: number;
  minCompositeScore: number;
  quizMin: number;
  callMin: number;
}

export const RIGOR_SPEC: Record<Rigor, RigorSpec> = {
  easy: { app: 2, quiz: 5, simulation: 0, voice: 4, topN: 8, minCompositeScore: 55, quizMin: 6, callMin: 5 },
  standard: { app: 3, quiz: 8, simulation: 1, voice: 6, topN: 5, minCompositeScore: 68, quizMin: 8, callMin: 6 },
  high: { app: 4, quiz: 12, simulation: 2, voice: 8, topN: 3, minCompositeScore: 78, quizMin: 10, callMin: 8 },
};

/** Edge function / legacy web rigor keys. */
export function rigorToLegacy(rigor: Rigor): "easy" | "medium" | "hard" {
  if (rigor === "easy") return "easy";
  if (rigor === "high") return "hard";
  return "medium";
}

export function legacyToRigor(legacy: string): Rigor {
  if (legacy === "easy") return "easy";
  if (legacy === "hard" || legacy === "intense") return "high";
  return "standard";
}

/** DB column check constraint uses easy | medium | hard */
export function rigorToDb(rigor: Rigor): "easy" | "medium" | "hard" {
  return rigorToLegacy(rigor);
}

export const RIGOR_OPTIONS: { id: Rigor; label: string; blurb: string; steps: string }[] = [
  { id: "easy", label: "Easy", blurb: "Quick screen for high-volume, lower-stakes roles.", steps: "3 steps" },
  { id: "standard", label: "Standard", blurb: "Balanced screen for most roles.", steps: "4 steps" },
  { id: "high", label: "High", blurb: "Thorough screen for trust & responsibility.", steps: "5 steps" },
];
