import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle } from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import type { Profile } from "@/hooks/useProfile";

interface ProfileCompletenessProps {
  profile: Profile | null;
  compact?: boolean;
}

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

function getMessage(percentage: number): { text: string; type: "low" | "medium" | "high" | "complete" } {
  if (percentage === 100) {
    return { text: "Profile complete! You're ready to stand out.", type: "complete" };
  }
  if (percentage >= 76) {
    return { text: "Almost there! Just a few more details.", type: "high" };
  }
  if (percentage >= 51) {
    return { text: "Good progress! Keep adding details.", type: "medium" };
  }
  if (percentage >= 26) {
    return { text: "Good start! Complete your profile to improve visibility.", type: "medium" };
  }
  return { text: "Get started! A complete profile helps you stand out.", type: "low" };
}

export function ProfileCompleteness({ profile, compact = false }: ProfileCompletenessProps) {
  const { percentage, missingFields } = calculateProfileCompleteness(profile);
  const message = getMessage(percentage);
  
  const strokeWidth = compact ? 4 : 6;
  const size = compact ? 48 : 80;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage === 100) return "var(--primary)";
    if (percentage >= 75) return "var(--primary)";
    if (percentage >= 50) return "hsl(142.1 76.2% 36.3%)"; // green-600
    if (percentage >= 25) return "hsl(45.4 93.4% 47.5%)"; // yellow-500
    return "var(--destructive)";
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--muted)"
              strokeWidth={strokeWidth}
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={getColor()}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-foreground">{percentage}%</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Profile {percentage === 100 ? "complete" : `${percentage}% complete`}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 border border-border">
      {/* Progress Ring */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {percentage === 100 ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
            >
              <AvaGlyph className="h-6 w-6 text-primary" />
            </motion.div>
          ) : (
            <span className="text-xl font-bold text-foreground">{percentage}%</span>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          {percentage === 100 ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">{message.text}</span>
        </div>
        
        {/* Missing fields hint */}
        {missingFields.length > 0 && missingFields.length <= 3 && (
          <p className="text-xs text-muted-foreground">
            Add: {missingFields.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

export default ProfileCompleteness;
