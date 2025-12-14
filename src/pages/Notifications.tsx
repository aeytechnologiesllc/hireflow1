import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check } from "lucide-react";

export default function Notifications() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Notifications</h2>
          <p className="text-muted-foreground mt-1">Stay updated on your hiring activity</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Check className="h-4 w-4" />
          Mark All as Read
        </Button>
      </div>

      {/* Empty State */}
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <Bell className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No notifications</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            When you receive new messages, application updates, or interview invitations, they'll appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
