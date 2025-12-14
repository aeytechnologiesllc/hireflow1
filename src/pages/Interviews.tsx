import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Interviews() {
  const { role } = useAuth();
  const isEmployer = role === "employer";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Interviews</h2>
          <p className="text-muted-foreground mt-1">
            {isEmployer 
              ? "Schedule and manage candidate interviews" 
              : "View your upcoming interviews"}
          </p>
        </div>
        {isEmployer && (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Schedule Interview
          </Button>
        )}
      </div>

      {/* Empty State */}
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No interviews scheduled</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {isEmployer
              ? "Schedule interviews with candidates to see them here."
              : "When employers schedule interviews with you, they'll appear here."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
