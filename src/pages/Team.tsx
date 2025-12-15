import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTeamInvitations, useUpdateInvitation, useDeleteInvitation } from "@/hooks/useTeam";
import { useTeamMembers, useRevokeTeamMember } from "@/hooks/useTeamMembers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  UserPlus, 
  Users, 
  Mail, 
  Clock, 
  MoreVertical, 
  XCircle, 
  Shield,
  Edit,
  UserX,
  Copy,
  Check,
  Link,
  Trash2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { TeamInviteWizard } from "@/components/team/TeamInviteWizard";
import { EditTeamMemberDialog } from "@/components/team/EditTeamMemberDialog";
import { TeamMember } from "@/hooks/useTeamMembers";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  accepted: "bg-green-500/20 text-green-500",
  declined: "bg-destructive/20 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

const permissionColors: Record<string, string> = {
  full_admin: "bg-red-500/10 text-red-500 border-red-500/20",
  limited: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  view_only: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const permissionLabels: Record<string, string> = {
  full_admin: "Full Admin",
  limited: "Team Member",
  view_only: "View Only",
};

export default function Team() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: invitations, isLoading: invitationsLoading, refetch: refetchInvitations } = useTeamInvitations();
  const { data: teamMembers, isLoading: membersLoading } = useTeamMembers();
  const updateInvitation = useUpdateInvitation();
  const deleteInvitation = useDeleteInvitation();
  const revokeTeamMember = useRevokeTeamMember();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<TeamMember | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCancelInvitation = async (id: string) => {
    try {
      await updateInvitation.mutateAsync({ id, status: "expired" });
      toast.success("Invitation cancelled");
    } catch (error) {
      toast.error("Failed to cancel invitation");
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    try {
      await deleteInvitation.mutateAsync(id);
      toast.success("Invitation deleted");
    } catch (error) {
      toast.error("Failed to delete invitation");
    }
  };

  const handleCopyInviteLink = (code: string) => {
    const link = `${window.location.origin}/join-team/${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success("Invite link copied to clipboard");
  };

  const handleRevokeMember = async () => {
    if (!revokeConfirm) return;
    try {
      await revokeTeamMember.mutateAsync(revokeConfirm.id);
      toast.success("Team member access revoked");
      setRevokeConfirm(null);
    } catch (error) {
      toast.error("Failed to revoke access");
    }
  };

  const activeMembers = teamMembers?.filter(m => m.status === "active") || [];
  const revokedMembers = teamMembers?.filter(m => m.status === "revoked") || [];
  const pendingInvitations = invitations?.filter(i => i.status === "pending" && !isPast(new Date(i.expires_at))) || [];

  if (!isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Employer Access Only</h2>
            <p className="text-muted-foreground">
              This page is only accessible to employers.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Team</h2>
          <p className="text-muted-foreground mt-1">Manage your hiring team members</p>
        </div>
        <Button className="gap-2" onClick={() => setWizardOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite Team Member
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10">
              <Users className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeMembers.length}</p>
              <p className="text-sm text-muted-foreground">Active Members</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-yellow-500/10">
              <Mail className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingInvitations.length}</p>
              <p className="text-sm text-muted-foreground">Pending Invites</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-muted">
              <UserX className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{revokedMembers.length}</p>
              <p className="text-sm text-muted-foreground">Revoked</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Team Members
            {activeMembers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground">
                {activeMembers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="invitations" className="gap-2">
            <Mail className="h-4 w-4" />
            Invitations
            {pendingInvitations.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground">
                {pendingInvitations.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Team Members Tab */}
        <TabsContent value="members" className="space-y-4">
          {membersLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : activeMembers.length > 0 ? (
            <div className="space-y-3">
              {activeMembers.map((member) => (
                <Card key={member.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {(member.name || member.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">
                              {member.name || member.email}
                            </p>
                            <Badge variant="outline" className={permissionColors[member.permission_level]}>
                              <Shield className="h-3 w-3 mr-1" />
                              {permissionLabels[member.permission_level] || member.permission_level}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span>{member.email}</span>
                            {member.department && (
                              <>
                                <span>•</span>
                                <span>{member.department}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Joined {format(new Date(member.joined_at), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-muted-foreground">
                            <MoreVertical className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover border-border">
                          <DropdownMenuItem onClick={() => setEditMember(member)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Permissions
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => setRevokeConfirm(member)}
                            className="text-destructive"
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Revoke Access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-12 text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No team members yet</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-4">
                  Invite colleagues to collaborate on hiring. They'll be able to view jobs, review applicants, and more.
                </p>
                <Button onClick={() => setWizardOpen(true)} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Your First Team Member
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations" className="space-y-4">
          {invitationsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : invitations && invitations.length > 0 ? (
            <div className="space-y-3">
              {invitations.map((invitation) => {
                const isExpired = isPast(new Date(invitation.expires_at));
                const displayStatus = isExpired && invitation.status === "pending" ? "expired" : invitation.status;
                
                return (
                  <Card key={invitation.id} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                            <Mail className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">
                                {invitation.invitee_name || invitation.invitee_email || "Unnamed Invitation"}
                              </p>
                              {invitation.permission_level && (
                                <Badge variant="outline" className={permissionColors[invitation.permission_level]}>
                                  {permissionLabels[invitation.permission_level] || invitation.permission_level}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              {invitation.invitee_email && <span>{invitation.invitee_email}</span>}
                              {invitation.department && (
                                <>
                                  <span>•</span>
                                  <span>{invitation.department}</span>
                                </>
                              )}
                              <span>•</span>
                              <Clock className="h-3 w-3" />
                              <span>
                                {isExpired ? "Expired" : `Expires ${format(new Date(invitation.expires_at), "MMM d, yyyy")}`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusColors[displayStatus]}>
                            {displayStatus}
                          </Badge>
                          {invitation.status === "pending" && !isExpired && invitation.invite_code ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyInviteLink(invitation.invite_code!)}
                                className="gap-1"
                              >
                                {copiedCode === invitation.invite_code ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                                Copy Link
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                                    <MoreVertical className="h-5 w-5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-popover border-border">
                                  <DropdownMenuItem 
                                    onClick={() => handleCancelInvitation(invitation.id)}
                                    className="text-destructive"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Cancel Invitation
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteInvitation(invitation.id)}
                              className="gap-2 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-12 text-center">
                <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No invitations</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Create an invitation to share with a colleague.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Invite Wizard */}
      <TeamInviteWizard 
        open={wizardOpen} 
        onOpenChange={setWizardOpen}
        onSuccess={() => refetchInvitations()}
      />

      {/* Edit Member Dialog */}
      <EditTeamMemberDialog
        open={!!editMember}
        onOpenChange={(open) => !open && setEditMember(null)}
        member={editMember}
      />

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeConfirm} onOpenChange={(open) => !open && setRevokeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Team Member Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke {revokeConfirm?.name || revokeConfirm?.email}'s access to your team. They will no longer be able to view jobs, applicants, or any team data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
