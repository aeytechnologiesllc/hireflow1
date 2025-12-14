import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload } from "lucide-react";

export default function Documents() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Documents</h2>
          <p className="text-muted-foreground mt-1">Manage resumes, contracts, and other documents</p>
        </div>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Empty State */}
      <Card className="bg-card border-border">
        <CardContent className="p-12 text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No documents</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Upload documents like resumes, contracts, and offer letters to manage them here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
