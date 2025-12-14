import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquare, Search } from "lucide-react";

export default function Messages() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Messages</h2>
          <p className="text-muted-foreground mt-1">Communicate with candidates and employers</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search messages..." 
          className="pl-10 bg-card border-border"
        />
      </div>

      {/* Empty State */}
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No messages yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your conversations will appear here once you start communicating with others.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
