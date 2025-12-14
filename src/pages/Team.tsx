import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, Users } from "lucide-react";

export default function Team() {
  const { role } = useAuth();
  const isEmployer = role === "employer";

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
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Team Member
        </Button>
      </div>

      {/* Empty State */}
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No team members</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Invite colleagues to collaborate on hiring. They'll be able to view jobs, review applicants, and schedule interviews.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
