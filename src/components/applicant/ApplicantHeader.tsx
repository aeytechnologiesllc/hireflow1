import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ApplicantHeaderProps {
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  aiScore?: number | null;
  status: string;
  submittedDate?: string | null;
  onBack: () => void;
  onAvatarClick?: () => void;
  className?: string;
}

// Get score color based on AI score
function getScoreColor(score: number): string {
  if (score >= 80) return "text-primary border-primary/50 bg-primary/10";
  if (score >= 60) return "text-amber-500 border-amber-500/50 bg-amber-500/10";
  return "text-destructive border-destructive/50 bg-destructive/10";
}

// Get score ring gradient
function getScoreRingGradient(score: number): string {
  if (score >= 80) return "conic-gradient(hsl(var(--primary)) 0deg, hsl(var(--primary)) calc(var(--score) * 3.6deg), hsl(var(--muted)) calc(var(--score) * 3.6deg))";
  if (score >= 60) return "conic-gradient(hsl(45 93% 47%) 0deg, hsl(45 93% 47%) calc(var(--score) * 3.6deg), hsl(var(--muted)) calc(var(--score) * 3.6deg))";
  return "conic-gradient(hsl(var(--destructive)) 0deg, hsl(var(--destructive)) calc(var(--score) * 3.6deg), hsl(var(--muted)) calc(var(--score) * 3.6deg))";
}

export function ApplicantHeader({
  name,
  email,
  phone,
  avatarUrl,
  aiScore,
  status,
  submittedDate,
  onBack,
  onAvatarClick,
  className,
}: ApplicantHeaderProps) {
  const initials = name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

  return (
    <div className={cn("flex flex-col sm:flex-row items-start sm:items-center gap-4", className)}>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground -ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div className="flex items-center gap-4 flex-1">
        {/* Avatar with score ring */}
        <div className="relative">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className={cn("cursor-pointer", onAvatarClick && "cursor-zoom-in")}
            onClick={onAvatarClick}
          >
            {aiScore !== null && aiScore !== undefined && (
              <div 
                className="absolute -inset-1 rounded-full"
                style={{
                  background: getScoreRingGradient(aiScore),
                  "--score": aiScore,
                } as React.CSSProperties}
              />
            )}
            <Avatar className="h-16 w-16 relative border-2 border-background">
              <AvatarImage src={avatarUrl || undefined} alt={name} />
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          
          {/* AI Score Badge */}
          {aiScore !== null && aiScore !== undefined && (
            <Badge 
              className={cn(
                "absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold border",
                getScoreColor(aiScore)
              )}
            >
              {aiScore}
            </Badge>
          )}
        </div>

        {/* Name and contact info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            {name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              {email}
            </span>
            {phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                {phone}
              </span>
            )}
          </div>
          {submittedDate && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Submitted on {submittedDate}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApplicantHeader;
