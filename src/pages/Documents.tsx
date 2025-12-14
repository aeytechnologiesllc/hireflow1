import { useAuth } from "@/hooks/useAuth";
import { useDocuments } from "@/hooks/useDocuments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Download, Clock, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  signed: "bg-success/20 text-success",
  declined: "bg-destructive/20 text-destructive",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  signed: <CheckCircle className="h-4 w-4" />,
};

export default function Documents() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: documents, isLoading } = useDocuments();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Documents</h2>
          <p className="text-muted-foreground mt-1">Manage resumes, contracts, and other documents</p>
        </div>
        {isEmployer && (
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="space-y-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="bg-card border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{doc.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{doc.document_type || "Document"}</span>
                        <span>•</span>
                        <span>Uploaded {format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColors[doc.status]}>
                      <span className="flex items-center gap-1">
                        {statusIcons[doc.status]}
                        {doc.status}
                      </span>
                    </Badge>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No documents</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {isEmployer 
                ? "Upload documents like contracts and offer letters to manage them here."
                : "Documents related to your applications will appear here."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
