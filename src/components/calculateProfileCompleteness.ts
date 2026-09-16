import type { Profile } from "@/hooks/useProfile";

/**
 * Split out of ProfileCompleteness.tsx (react-refresh/only-export-components:
 * that file should export only the ProfileCompleteness component), which
 * imports this back for its own use.
 */

interface FieldWeight {
  field: keyof Profile | string;
  weight: number;
  label: string;
}

const fieldWeights: FieldWeight[] = [
  { field: "full_name", weight: 15, label: "Full name" },
  { field: "phone", weight: 10, label: "Phone number" },
  { field: "location", weight: 10, label: "Location" },
  { field: "bio", weight: 15, label: "Bio" },
  { field: "skills", weight: 15, label: "Skills" },
  { field: "experience_years", weight: 10, label: "Experience" },
  { field: "linkedin_url", weight: 10, label: "LinkedIn" },
  { field: "portfolio_url", weight: 10, label: "Portfolio" },
  { field: "resume_url", weight: 5, label: "Resume" },
];

function getFieldValue(profile: Profile | null, field: string): boolean {
  if (!profile) return false;

  const value = (profile as Record<string, unknown>)[field];

  if (field === "skills") {
    return Array.isArray(value) && value.length > 0;
  }

  if (field === "experience_years") {
    return typeof value === "number" && value > 0;
  }

  return Boolean(value && String(value).trim());
}

export function calculateProfileCompleteness(profile: Profile | null): {
  percentage: number;
  filledFields: string[];
  missingFields: string[];
} {
  if (!profile) {
    return { percentage: 0, filledFields: [], missingFields: fieldWeights.map(f => f.label) };
  }

  let totalWeight = 0;
  let earnedWeight = 0;
  const filledFields: string[] = [];
  const missingFields: string[] = [];

  fieldWeights.forEach(({ field, weight, label }) => {
    totalWeight += weight;
    if (getFieldValue(profile, field)) {
      earnedWeight += weight;
      filledFields.push(label);
    } else {
      missingFields.push(label);
    }
  });

  const percentage = Math.round((earnedWeight / totalWeight) * 100);
  return { percentage, filledFields, missingFields };
}
