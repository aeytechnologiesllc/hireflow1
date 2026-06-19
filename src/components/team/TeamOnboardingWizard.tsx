import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  MessageSquare,
  Shield,
  Users,
} from "lucide-react";
import AvaGlyph from "@/components/AvaGlyph";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";

interface TeamOnboardingWizardProps {
  companyName: string;
  memberName: string;
  department?: string | null;
  permissionLabel: string;
  assignedJobTitles: string[];
  canCreateJobs: boolean;
  canMessageCandidates: boolean;
  canManagePipeline: boolean;
  canScheduleInterviews: boolean;
  canSendDocuments: boolean;
  onComplete: () => Promise<void>;
}

interface StepConfig {
  eyebrow: string;
  title: string;
  description: string;
}

const STEPS: StepConfig[] = [
  {
    eyebrow: "Welcome",
    title: "You are in the team workspace now",
    description: "HireFlow will keep team members inside the Team Portal so the experience stays simple and role-specific.",
  },
  {
    eyebrow: "Your access",
    title: "Here is exactly what you can do",
    description: "A quick permissions check helps teammates understand their scope right away without guessing.",
  },
  {
    eyebrow: "Next steps",
    title: "Start where your work actually lives",
    description: "Jobs, applicants, interviews, and candidate communication are all routed from the Team Portal based on your permissions.",
  },
];

function getNextActions(params: {
  canCreateJobs: boolean;
  canManagePipeline: boolean;
  canMessageCandidates: boolean;
  canScheduleInterviews: boolean;
  canSendDocuments: boolean;
}) {
  const actions: Array<{ icon: typeof Briefcase; label: string; description: string }> = [];

  if (params.canCreateJobs) {
    actions.push({
      icon: Briefcase,
      label: "Build and manage jobs",
      description: "Create roles, refine the screening plan, and help keep openings current.",
    });
  }

  actions.push({
    icon: Users,
    label: "Review applicants",
    description: params.canManagePipeline
      ? "Move candidates through the pipeline and keep momentum moving."
      : "View applicants, see their progress, and stay aligned with the hiring team.",
  });

  if (params.canMessageCandidates || params.canScheduleInterviews || params.canSendDocuments) {
    actions.push({
      icon: MessageSquare,
      label: "Coordinate candidate follow-up",
      description: "Use messages, interviews, and documents only where your permissions allow it.",
    });
  }

  return actions.slice(0, 3);
}

function getWorkspaceExpectations(params: {
  permissionLabel: string;
  department?: string | null;
  assignedJobTitles: string[];
  canCreateJobs: boolean;
  canManagePipeline: boolean;
  canMessageCandidates: boolean;
  canScheduleInterviews: boolean;
  canSendDocuments: boolean;
}) {
  const expectations: string[] = [];

  if (params.department) {
    expectations.push(`Your first focus area is the ${params.department} team.`);
  }

  if (params.assignedJobTitles.length > 0) {
    expectations.push(`Start with the roles already assigned to you: ${params.assignedJobTitles.slice(0, 2).join(", ")}${params.assignedJobTitles.length > 2 ? ", and more." : "."}`);
  } else {
    expectations.push("Use the Team Portal as your home base for the jobs and applicants your owner has made visible to you.");
  }

  if (params.canManagePipeline) {
    expectations.push("Keep applicants moving so the hiring process does not stall between stages.");
  } else if (params.canMessageCandidates || params.canScheduleInterviews || params.canSendDocuments) {
    expectations.push("Your role is focused on coordination and candidate follow-up rather than moving candidates between stages.");
  } else if (!params.canCreateJobs) {
    expectations.push("This workspace is currently set up for visibility first, so you can stay aligned without changing the hiring flow.");
  }

  if (params.permissionLabel === "Full Admin") {
    expectations.push("You can create jobs and help shape the hiring plan when the owner needs support.");
  }

  return expectations.slice(0, 3);
}

function getFirstWeekChecklist(params: {
  assignedJobTitles: string[];
  canCreateJobs: boolean;
  canManagePipeline: boolean;
  canMessageCandidates: boolean;
  canScheduleInterviews: boolean;
  canSendDocuments: boolean;
}) {
  const checklist: string[] = [];

  checklist.push(
    params.assignedJobTitles.length > 0
      ? "Open your assigned jobs and review the active applicant flow."
      : "Open Team Portal and review which jobs and applicants are visible to you."
  );

  if (params.canManagePipeline) {
    checklist.push("Use the pipeline view to move strong applicants forward and keep stages current.");
  }

  if (params.canMessageCandidates || params.canScheduleInterviews || params.canSendDocuments) {
    checklist.push("Check messages, interviews, and documents so candidate follow-up stays fast and consistent.");
  }

  if (params.canCreateJobs) {
    checklist.push("If a new opening is needed, use Ava to generate the job and screening plan instead of starting from scratch.");
  }

  return checklist.slice(0, 4);
}

export default function TeamOnboardingWizard(props: TeamOnboardingWizardProps) {
  const {
    companyName,
    memberName,
    department,
    permissionLabel,
    assignedJobTitles,
    canCreateJobs,
    canMessageCandidates,
    canManagePipeline,
    canScheduleInterviews,
    canSendDocuments,
    onComplete,
  } = props;
  const [step, setStep] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const isMobile = useIsMobile();

  const permissionItems = useMemo(
    () => [
      { label: "Create jobs", enabled: canCreateJobs },
      { label: "Manage pipeline", enabled: canManagePipeline },
      { label: "Message candidates", enabled: canMessageCandidates },
      { label: "Schedule interviews", enabled: canScheduleInterviews },
      { label: "Send documents", enabled: canSendDocuments },
    ],
    [canCreateJobs, canManagePipeline, canMessageCandidates, canScheduleInterviews, canSendDocuments],
  );

  const nextActions = useMemo(
    () =>
      getNextActions({
        canCreateJobs,
        canManagePipeline,
        canMessageCandidates,
        canScheduleInterviews,
        canSendDocuments,
      }),
    [canCreateJobs, canManagePipeline, canMessageCandidates, canScheduleInterviews, canSendDocuments],
  );

  const workspaceExpectations = useMemo(
    () =>
      getWorkspaceExpectations({
        permissionLabel,
        department,
        assignedJobTitles,
        canCreateJobs,
        canManagePipeline,
        canMessageCandidates,
        canScheduleInterviews,
        canSendDocuments,
      }),
    [
      permissionLabel,
      department,
      assignedJobTitles,
      canCreateJobs,
      canManagePipeline,
      canMessageCandidates,
      canScheduleInterviews,
      canSendDocuments,
    ],
  );

  const firstWeekChecklist = useMemo(
    () =>
      getFirstWeekChecklist({
        assignedJobTitles,
        canCreateJobs,
        canManagePipeline,
        canMessageCandidates,
        canScheduleInterviews,
        canSendDocuments,
      }),
    [
      assignedJobTitles,
      canCreateJobs,
      canManagePipeline,
      canMessageCandidates,
      canScheduleInterviews,
      canSendDocuments,
    ],
  );

  const handleContinue = async () => {
    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await onComplete();
    } finally {
      setIsFinishing(false);
    }
  };

  const activeStep = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] h-[280px] w-[280px] rounded-full bg-primary/18 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[220px] w-[220px] rounded-full bg-accent/16 blur-[120px]" />
      </div>

      <div className={`relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-4xl items-center px-4 py-6 ${isMobile ? "py-4" : "py-8"}`}>
        <Card className="w-full border-primary/15 bg-card/95 backdrop-blur">
          <CardContent className={`${isMobile ? "p-5" : "p-8"} space-y-6`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                    <AvaGlyph className="h-3 w-3" />
                    Team onboarding
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {activeStep.eyebrow}
                  </p>
                </div>
                <div className="flex gap-2">
                  {STEPS.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 rounded-full transition-all ${index === step ? "w-8 bg-primary" : "w-2 bg-muted"}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h1 className={`${isMobile ? "text-2xl" : "text-3xl"} font-bold text-foreground`}>
                  {activeStep.title}
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                  {activeStep.description}
                </p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25 }}
                  className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]"
                >
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold">{companyName}</h2>
                        <p className="text-sm text-muted-foreground">
                          {department ? `${department} team` : "Hiring team workspace"}
                        </p>
                      </div>
                    </div>

                    <p className="text-muted-foreground">
                      {memberName}, this space is built for team members. You will start in the Team Portal, see your permissions clearly, and only get the tools that fit your role.
                    </p>
                  </div>

                  <div className="rounded-2xl border bg-background/70 p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Your role</span>
                    </div>
                    <Badge className="mb-3 bg-primary/15 text-primary hover:bg-primary/15">
                      {permissionLabel}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      You can always return to the Team Portal to see what is available to you and what the account owner has assigned.
                    </p>
                  </div>

                  <div className="rounded-2xl border bg-background/70 p-6 md:col-span-2">
                    <div className="mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">How this workspace is set up for you</span>
                    </div>
                    <div className="space-y-2">
                      {workspaceExpectations.map((expectation) => (
                        <div key={expectation} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{expectation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="permissions"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    {permissionItems.map((item) => (
                      <div
                        key={item.label}
                        className={`rounded-2xl border p-4 ${item.enabled ? "border-success/30 bg-success/10" : "border-border bg-muted/30"}`}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className={`h-4 w-4 ${item.enabled ? "text-success" : "text-muted-foreground"}`} />
                          <span className={`font-medium ${item.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                            {item.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border bg-background/70 p-5">
                    <h3 className="mb-2 text-lg font-semibold">Assigned job scope</h3>
                    {assignedJobTitles.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {assignedJobTitles.map((jobTitle) => (
                          <Badge key={jobTitle} variant="secondary">
                            {jobTitle}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No specific job limit is set right now, so the Team Portal will show the jobs and applicants available under your current permissions.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="next-steps"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25 }}
                  className="grid gap-4 md:grid-cols-3"
                >
                  {nextActions.map((action) => (
                    <div key={action.label} className="rounded-2xl border bg-background/70 p-5">
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12">
                        <action.icon className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="mb-2 font-semibold">{action.label}</h3>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>
                  ))}

                  <div className="rounded-2xl border bg-background/70 p-5 md:col-span-3">
                    <h3 className="mb-3 font-semibold">First checklist</h3>
                    <div className="space-y-2">
                      {firstWeekChecklist.map((item) => (
                        <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0 || isFinishing}
              >
                Back
              </Button>
              <Button onClick={handleContinue} disabled={isFinishing} className="gap-2">
                {step === STEPS.length - 1 ? "Open Team Portal" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
