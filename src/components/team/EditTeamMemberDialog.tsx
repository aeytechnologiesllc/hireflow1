import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Shield, Briefcase, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useUpdateTeamMember, TeamMember } from "@/hooks/useTeamMembers";

interface EditTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
}

type PermissionLevel = "full_admin" | "limited" | "view_only";

interface PermissionDefaults {
  can_create_jobs: boolean;
  can_delete_jobs: boolean;
  can_message_candidates: boolean;
  can_manage_pipeline: boolean;
  can_schedule_interviews: boolean;
  can_send_documents: boolean;
}

const defaultPermissions: Record<PermissionLevel, PermissionDefaults> = {
  full_admin: {
    can_create_jobs: true,
    can_delete_jobs: true,
    can_message_candidates: true,
    can_manage_pipeline: true,
    can_schedule_interviews: true,
    can_send_documents: true,
  },
  limited: {
    can_create_jobs: false,
    can_delete_jobs: false,
    can_message_candidates: true,
    can_manage_pipeline: true,
    can_schedule_interviews: true,
    can_send_documents: true,
  },
  view_only: {
    can_create_jobs: false,
    can_delete_jobs: false,
    can_message_candidates: false,
    can_manage_pipeline: false,
    can_schedule_interviews: false,
    can_send_documents: false,
  },
};

export function EditTeamMemberDialog({ open, onOpenChange, member }: EditTeamMemberDialogProps) {
  const { toast } = useToast();
  const { data: jobs } = useEmployerJobs();
  const updateMember = useUpdateTeamMember();

  const [formData, setFormData] = useState<{
    name: string;
    department: string;
    permission_level: PermissionLevel;
    can_create_jobs: boolean;
    can_delete_jobs: boolean;
    can_message_candidates: boolean;
    can_manage_pipeline: boolean;
    can_schedule_interviews: boolean;
    can_send_documents: boolean;
    assigned_job_ids: string[];
  }>({
    name: "",
    department: "",
    permission_level: "limited",
    can_create_jobs: false,
    can_delete_jobs: false,
    can_message_candidates: true,
    can_manage_pipeline: true,
    can_schedule_interviews: true,
    can_send_documents: true,
    assigned_job_ids: [],
  });

  useEffect(() => {
    if (member) {
      const validLevel = (member.permission_level === "full_admin" || member.permission_level === "limited" || member.permission_level === "view_only") 
        ? member.permission_level as PermissionLevel 
        : "limited" as PermissionLevel;
      
      setFormData({
        name: member.name || "",
        department: member.department || "",
        permission_level: validLevel,
        can_create_jobs: member.can_create_jobs,
        can_delete_jobs: member.can_delete_jobs,
        can_message_candidates: member.can_message_candidates,
        can_manage_pipeline: member.can_manage_pipeline,
        can_schedule_interviews: member.can_schedule_interviews,
        can_send_documents: member.can_send_documents,
        assigned_job_ids: member.assigned_job_ids || [],
      });
    }
  }, [member]);

  const handlePermissionLevelChange = (level: PermissionLevel) => {
    setFormData({
      ...formData,
      permission_level: level,
      ...defaultPermissions[level],
    });
  };

  const handleJobToggle = (jobId: string) => {
    setFormData((prev) => ({
      ...prev,
      assigned_job_ids: prev.assigned_job_ids.includes(jobId)
        ? prev.assigned_job_ids.filter((id) => id !== jobId)
        : [...prev.assigned_job_ids, jobId],
    }));
  };

  const handleSave = async () => {
    if (!member) return;

    try {
      await updateMember.mutateAsync({
        id: member.id,
        updates: {
          name: formData.name || null,
          department: formData.department || null,
          permission_level: formData.permission_level,
          can_create_jobs: formData.can_create_jobs,
          can_delete_jobs: formData.can_delete_jobs,
          can_message_candidates: formData.can_message_candidates,
          can_manage_pipeline: formData.can_manage_pipeline,
          can_schedule_interviews: formData.can_schedule_interviews,
          can_send_documents: formData.can_send_documents,
          assigned_job_ids: formData.assigned_job_ids,
        },
      });

      toast({
        title: "Permissions Updated",
        description: "Team member permissions have been updated successfully.",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update permissions",
        variant: "destructive",
      });
    }
  };

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Edit Team Member
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={member.email} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Input
                id="edit-department"
                placeholder="e.g., HR, Engineering, Sales"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border text-sm">
              <p className="text-muted-foreground">
                Joined {new Date(member.joined_at).toLocaleDateString()}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4 mt-4">
            <div className="space-y-3">
              {[
                {
                  level: "full_admin" as PermissionLevel,
                  title: "Full Admin",
                  description: "Can create, edit, delete jobs",
                  color: "bg-destructive/10 text-destructive",
                },
                {
                  level: "limited" as PermissionLevel,
                  title: "Limited Access",
                  description: "Can manage applicants only",
                  color: "bg-warning/10 text-warning",
                },
                {
                  level: "view_only" as PermissionLevel,
                  title: "View Only",
                  description: "Can only view, no actions",
                  color: "bg-secondary text-muted-foreground",
                },
              ].map((option) => (
                <button
                  key={option.level}
                  onClick={() => handlePermissionLevelChange(option.level)}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    formData.permission_level === option.level
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{option.title}</span>
                      <Badge variant="outline" className={option.color}>
                        {option.level.replace("_", " ")}
                      </Badge>
                    </div>
                    {formData.permission_level === option.level && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Fine-tune Permissions
              </h4>
              {[
                { key: "can_create_jobs", label: "Create Jobs" },
                { key: "can_delete_jobs", label: "Delete Jobs" },
                { key: "can_message_candidates", label: "Message Candidates" },
                { key: "can_manage_pipeline", label: "Manage Pipeline" },
                { key: "can_schedule_interviews", label: "Schedule Interviews" },
                { key: "can_send_documents", label: "Send Documents" },
              ].map((permission) => (
                <div
                  key={permission.key}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm">{permission.label}</span>
                  <Switch
                    checked={formData[permission.key as keyof typeof formData] as boolean}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, [permission.key]: checked })
                    }
                  />
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-muted/50 border text-sm">
              <p className="text-muted-foreground">
                Select specific jobs for this team member. If no jobs are selected, they'll have access to all jobs.
              </p>
            </div>

            <ScrollArea className="h-[250px] pr-4">
              <div className="space-y-2">
                {jobs && jobs.length > 0 ? (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => handleJobToggle(job.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.assigned_job_ids.includes(job.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Checkbox
                        checked={formData.assigned_job_ids.includes(job.id)}
                        onCheckedChange={() => handleJobToggle(job.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{job.title}</p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {job.job_code}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No jobs available</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {formData.assigned_job_ids.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {formData.assigned_job_ids.length} job{formData.assigned_job_ids.length > 1 ? "s" : ""} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, assigned_job_ids: [] })}
                >
                  Clear
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMember.isPending}>
            {updateMember.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
