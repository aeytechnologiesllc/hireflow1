import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Rocket,
  X,
  CheckCircle2,
  Circle,
  Briefcase,
  Users,
  Calendar,
  ChevronRight,
} from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";

interface GettingStartedChecklistProps {
  hasJobs: boolean;
  hasApplicants: boolean;
  hasInterviews: boolean;
  onDismiss: () => void;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  link: string;
  linkLabel: string;
  icon: React.ElementType;
}

export function GettingStartedChecklist({
  hasJobs,
  hasApplicants,
  hasInterviews,
  onDismiss,
}: GettingStartedChecklistProps) {
  const [isHovered, setIsHovered] = useState<string | null>(null);

  const items: ChecklistItem[] = useMemo(
    () => [
      {
        id: "job",
        label: "Create your first job",
        description: "Post a job and let Ava generate the perfect workflow",
        completed: hasJobs,
        link: "/jobs/create",
        linkLabel: "Create Job",
        icon: Briefcase,
      },
      {
        id: "applicant",
        label: "Review an applicant",
        description: "See Ava's AI analysis and candidate scores",
        completed: hasApplicants,
        link: "/applicants",
        linkLabel: "View Applicants",
        icon: Users,
      },
      {
        id: "interview",
        label: "Schedule an interview",
        description: "Connect with your top candidates",
        completed: hasInterviews,
        link: "/interviews",
        linkLabel: "Interviews",
        icon: Calendar,
      },
    ],
    [hasJobs, hasApplicants, hasInterviews]
  );

  const completedCount = items.filter((item) => item.completed).length;
  const progress = (completedCount / items.length) * 100;
  const allComplete = completedCount === items.length;

  // Auto-dismiss when all complete
  if (allComplete) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="bg-gradient-to-br from-primary/5 via-card to-accent/5 border-primary/20 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <p className="text-sm text-muted-foreground">
                Complete these steps to start hiring faster
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Checklist Items */}
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.id}
                  onHoverStart={() => setIsHovered(item.id)}
                  onHoverEnd={() => setIsHovered(null)}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border transition-all
                    ${item.completed
                      ? "bg-primary/5 border-primary/20"
                      : "bg-card border-border hover:border-primary/50 hover:bg-primary/5"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    {item.completed ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center"
                      >
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      </motion.div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <p
                        className={`font-medium text-sm ${
                          item.completed ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {!item.completed && (
                    <AnimatePresence>
                      {isHovered === item.id && (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-primary"
                            asChild
                          >
                            <Link to={item.link}>
                              {item.linkLabel}
                              <ChevronRight className="h-3 w-3" />
                            </Link>
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}

                  {!item.completed && isHovered !== item.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-muted-foreground hover:text-primary"
                      asChild
                    >
                      <Link to={item.link}>
                        <Icon className="h-4 w-4" />
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium text-primary">
                {completedCount} of {items.length} complete
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Quick tip */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            <AvaGlyph className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              Ava will automatically screen candidates so you can focus on the best ones
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
