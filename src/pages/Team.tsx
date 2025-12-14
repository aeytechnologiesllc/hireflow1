import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTeamInvitations, useCreateInvitation, useUpdateInvitation } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Users, Mail, Clock, MoreVertical, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, isPast } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  accepted: "bg-success/20 text-success",
  declined: "bg-destructive/20 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

export default function Team() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: invitations, isLoading } = useTeamInvitations();
  const createInvitation = useCreateInvitation();
  const updateInvitation = useUpdateInvitation();
  const [inviteEmail, setInviteEmail] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      await createInvitation.mutateAsync(inviteEmail.trim());
      toast.success("Invitation sent successfully!");
      setInviteEmail("");
      setDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation");
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await updateInvitation.mutateAsync({ id, status: "expired" });
      toast.success("Invitation cancelled");
    } catch (error) {
      toast.error("Failed to cancel invitation");
    }
  };

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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Invite Team Member</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Send an invitation to join your hiring team
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="bg-background border-border"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createInvitation.isPending}>
                  Send Invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Invitations List */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : invitations && invitations.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Pending Invitations</h3>
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
                        <p className="font-medium text-foreground">{invitation.invitee_email}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>Expires {format(new Date(invitation.expires_at), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[displayStatus]}>
                        {displayStatus}
                      </Badge>
                      {invitation.status === "pending" && !isExpired && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground">
                              <MoreVertical className="h-5 w-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover border-border">
                            <DropdownMenuItem 
                              onClick={() => handleCancel(invitation.id)}
                              className="text-destructive"
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancel Invitation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No team members</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Invite colleagues to collaborate on hiring. They'll be able to view jobs, review applicants, and schedule interviews.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
