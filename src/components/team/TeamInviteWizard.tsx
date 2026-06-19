import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowRight, Copy, Check, Users, Shield, Briefcase, Link, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useEmployerJobs } from "@/hooks/useJobs";
import { motion, AnimatePresence } from "framer-motion";
import { TeamMemberLimitDialog } from "@/components/subscription/TeamMemberLimitDialog";

interface TeamInviteWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type PermissionLevel = "full_admin" | "limited" | "view_only";

interface InviteData {
  name: string;
  email: string;
  department: string;
  permissionLevel: PermissionLevel;
  canCreateJobs: boolean;
  canDeleteJobs: boolean;
  canMessageCandidates: boolean;
  canManagePipeline: boolean;
  canScheduleInterviews: boolean;
  canSendDocuments: boolean;
  assignedJobIds: string[];
}

const defaultPermissions: Record<PermissionLevel, Partial<InviteData>> = {
  full_admin: {
    canCreateJobs: true,
    canDeleteJobs: true,
    canMessageCandidates: true,
    canManagePipeline: true,
    canScheduleInterviews: true,
    canSendDocuments: true,
  },
  limited: {
    canCreateJobs: false,
    canDeleteJobs: false,
    canMessageCandidates: true,
    canManagePipeline: true,
    canScheduleInterviews: true,
    canSendDocuments: true,
  },
  view_only: {
    canCreateJobs: false,
    canDeleteJobs: false,
    canMessageCandidates: false,
    canManagePipeline: false,
    canScheduleInterviews: false,
    canSendDocuments: false,
  },
};

export function TeamInviteWizard({ open, onOpenChange, onSuccess }: TeamInviteWizardProps) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { usage, limits, isWithinLimit } = useSubscription();
  const { data: jobs } = useEmployerJobs();
  const canAddMoreTeamMembers = isWithinLimit('teamMembers');

  const [inviteData, setInviteData] = useState<InviteData>({
    name: "",
    email: "",
    department: "",
    permissionLevel: "limited",
    canCreateJobs: false,
    canDeleteJobs: false,
    canMessageCandidates: true,
    canManagePipeline: true,
    canScheduleInterviews: true,
    canSendDocuments: true,
    assignedJobIds: [],
  });

  const handlePermissionLevelChange = (level: PermissionLevel) => {
    setInviteData({
      ...inviteData,
      permissionLevel: level,
      ...defaultPermissions[level],
    });
  };

  const handleJobToggle = (jobId: string) => {
    setInviteData((prev) => ({
      ...prev,
      assignedJobIds: prev.assignedJobIds.includes(jobId)
        ? prev.assignedJobIds.filter((id) => id !== jobId)
        : [...prev.assignedJobIds, jobId],
    }));
  };

  const handleCreateInvite = async () => {
    if (!user) return;

    // Check team member limit
    if (!canAddMoreTeamMembers) {
      setShowLimitDialog(true);
      return;
    }

    // Validate required email
    if (!inviteData.email.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter an email address for the team member.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    setIsLoading(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { data, error } = await supabase
        .from("team_invitations")
        .insert({
          inviter_id: user.id,
          invitee_email: inviteData.email.trim(),
          invitee_name: inviteData.name || null,
          department: inviteData.department || null,
          permission_level: inviteData.permissionLevel,
          can_create_jobs: inviteData.canCreateJobs,
          can_delete_jobs: inviteData.canDeleteJobs,
          can_message_candidates: inviteData.canMessageCandidates,
          can_manage_pipeline: inviteData.canManagePipeline,
          can_schedule_interviews: inviteData.canScheduleInterviews,
          can_send_documents: inviteData.canSendDocuments,
          assigned_job_ids: inviteData.assignedJobIds,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      setInviteCode(data.invite_code);
      setStep(5);
      toast({
        title: "Invitation Created",
        description: "Share the invite link with your team member.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create invitation",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/join-team/${inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  const handleClose = () => {
    setStep(1);
    setInviteCode(null);
    setCopied(false);
    setInviteData({
      name: "",
      email: "",
      department: "",
      permissionLevel: "limited",
      canCreateJobs: false,
      canDeleteJobs: false,
      canMessageCandidates: true,
      canManagePipeline: true,
      canScheduleInterviews: true,
      canSendDocuments: true,
      assignedJobIds: [],
    });
    onOpenChange(false);
    if (inviteCode) {
      onSuccess();
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <p className="text-sm text-muted-foreground">Enter team member details</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@company.com"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Only this email can use the invite link
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department (Optional)</Label>
                <Input
                  id="department"
                  placeholder="e.g., HR, Engineering, Sales"
                  value={inviteData.department}
                  onChange={(e) => setInviteData({ ...inviteData, department: e.target.value })}
                />
              </div>
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Permission Level</h3>
                <p className="text-sm text-muted-foreground">Choose access level for this team member</p>
              </div>
            </div>

            <div className="grid gap-3">
              {[
                {
                  level: "full_admin" as PermissionLevel,
                  title: "Full Admin",
                  description: "Can create, edit, delete jobs and manage everything",
                  color: "bg-destructive/10 border-destructive/20 text-destructive",
                },
                {
                  level: "limited" as PermissionLevel,
                  title: "Limited Access",
                  description: "Can manage applicants but cannot create or delete jobs",
                  color: "bg-warning/10 border-warning/20 text-warning",
                },
                {
                  level: "view_only" as PermissionLevel,
                  title: "View Only",
                  description: "Can only view jobs and applicants, no actions allowed",
                  color: "bg-secondary border-border text-muted-foreground",
                },
              ].map((option) => (
                <button
                  key={option.level}
                  onClick={() => handlePermissionLevelChange(option.level)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    inviteData.permissionLevel === option.level
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{option.title}</span>
                        <Badge variant="outline" className={option.color}>
                          {option.level === "full_admin" ? "Admin" : option.level === "limited" ? "Team" : "Viewer"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        inviteData.permissionLevel === option.level
                          ? "border-primary bg-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {inviteData.permissionLevel === option.level && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Fine-tune Permissions</h3>
                <p className="text-sm text-muted-foreground">Customize specific permissions</p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { key: "canCreateJobs", label: "Create Jobs", description: "Can create new job postings" },
                { key: "canDeleteJobs", label: "Delete Jobs", description: "Can delete existing job postings" },
                { key: "canMessageCandidates", label: "Message Candidates", description: "Can send messages to applicants" },
                { key: "canManagePipeline", label: "Manage Pipeline", description: "Can move applicants through hiring stages" },
                { key: "canScheduleInterviews", label: "Schedule Interviews", description: "Can schedule interviews with candidates" },
                { key: "canSendDocuments", label: "Send Documents", description: "Can create and send documents for signing" },
              ].map((permission) => (
                <div
                  key={permission.key}
                  className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{permission.label}</p>
                    <p className="text-sm text-muted-foreground">{permission.description}</p>
                  </div>
                  <Switch
                    checked={inviteData[permission.key as keyof InviteData] as boolean}
                    onCheckedChange={(checked) =>
                      setInviteData({ ...inviteData, [permission.key]: checked })
                    }
                  />
                </div>
              ))}
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-primary/10">
                <Briefcase className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Assign Jobs</h3>
                <p className="text-sm text-muted-foreground">
                  Select specific jobs or leave empty for access to all jobs
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border mb-4">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> If no jobs are selected, this team member will have access to all current and future jobs based on their permission level.
              </p>
            </div>

            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {jobs && jobs.length > 0 ? (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => handleJobToggle(job.id)}
                      className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                        inviteData.assignedJobIds.includes(job.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Checkbox
                        checked={inviteData.assignedJobIds.includes(job.id)}
                        onCheckedChange={() => handleJobToggle(job.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{job.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {job.job_code}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{job.location || "Remote"}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No jobs available</p>
                    <p className="text-sm">Create jobs first to assign them to team members</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {inviteData.assignedJobIds.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {inviteData.assignedJobIds.length} job{inviteData.assignedJobIds.length > 1 ? "s" : ""} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInviteData({ ...inviteData, assignedJobIds: [] })}
                >
                  Clear selection
                </Button>
              </div>
            )}
          </motion.div>
        );

      case 5:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6 text-center"
          >
            <div className="p-4 rounded-full bg-success/10 w-fit mx-auto">
              <Check className="h-12 w-12 text-success" />
            </div>

            <div>
              <h3 className="font-semibold text-xl mb-2">Invitation Created!</h3>
              <p className="text-muted-foreground">Share this link with your team member</p>
            </div>

            <div className="p-4 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <Link className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Invite Link</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/join-team/${inviteCode}`}
                  className="text-sm"
                />
                <Button onClick={handleCopyLink} variant="outline" size="icon">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted/30 border border-border text-left">
              <h4 className="font-medium mb-2">Invitation Summary</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                {inviteData.name && <p>Name: {inviteData.name}</p>}
                {inviteData.email && <p>Email: {inviteData.email}</p>}
                {inviteData.department && <p>Department: {inviteData.department}</p>}
                <p>Permission Level: {inviteData.permissionLevel.replace("_", " ").toUpperCase()}</p>
                <p>
                  Jobs:{" "}
                  {inviteData.assignedJobIds.length > 0
                    ? `${inviteData.assignedJobIds.length} specific job(s)`
                    : "All jobs"}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              This invitation expires in 7 days
            </p>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Invite Team Member
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        {step < 5 && (
          <div className="flex items-center justify-center gap-2 mb-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  s === step
                    ? "w-8 bg-primary"
                    : s < step
                    ? "w-2 bg-primary"
                    : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>

        {/* Navigation */}
        {step < 5 && (
          <div className="flex justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => (step === 1 ? handleClose() : setStep(step - 1))}
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            {step < 4 ? (
              <Button onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleCreateInvite} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    Generate Invite Link
                    <Link className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="flex justify-center mt-4">
            <Button onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>

      <TeamMemberLimitDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        currentCount={usage?.team_members_added ?? 0}
        limit={limits?.teamMembers ?? 0}
      />
    </Dialog>
  );
}
