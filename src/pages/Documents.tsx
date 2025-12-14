import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDocuments, DocumentWithApplication } from "@/hooks/useDocuments";
import { useApplicationsForDocuments } from "@/hooks/useApplicationsForDocuments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Upload, Download, Clock, CheckCircle, XCircle, Eye, PenTool } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { CreateDocumentDialog } from "@/components/documents/CreateDocumentDialog";
import { DocumentViewerDialog } from "@/components/documents/DocumentViewerDialog";

const statusConfig = {
  pending: { color: "bg-yellow-500/20 text-yellow-500", icon: Clock, label: "Pending" },
  signed: { color: "bg-success/20 text-success", icon: CheckCircle, label: "Signed" },
  declined: { color: "bg-destructive/20 text-destructive", icon: XCircle, label: "Declined" },
};

export default function Documents() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: documents, isLoading } = useDocuments();
  const { data: applications = [] } = useApplicationsForDocuments();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewerDialogOpen, setViewerDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithApplication | null>(null);

  const pendingDocs = documents?.filter(d => d.status === "pending") || [];
  const signedDocs = documents?.filter(d => d.status === "signed") || [];
  const declinedDocs = documents?.filter(d => d.status === "declined") || [];

  const handleViewDocument = (doc: DocumentWithApplication) => {
    setSelectedDocument(doc);
    setViewerDialogOpen(true);
  };

  const renderDocumentCard = (doc: DocumentWithApplication) => {
    const status = statusConfig[doc.status as keyof typeof statusConfig];
    const StatusIcon = status?.icon || Clock;

    return (
      <Card key={doc.id} className="bg-card border-border hover:border-primary/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">{doc.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="capitalize">{doc.document_type?.replace(/_/g, " ") || "Document"}</span>
                  <span>•</span>
                  <span>{format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                </div>
                {doc.applications?.profiles && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {isEmployer ? "To: " : "From: "}
                    {doc.applications.profiles.full_name || doc.applications.profiles.email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={status?.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status?.label}
              </Badge>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => handleViewDocument(doc)}
              >
                {doc.status === "pending" && !isEmployer ? (
                  <PenTool className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Documents</h2>
          <p className="text-muted-foreground mt-1">
            {isEmployer 
              ? "Create and manage contracts, offer letters, and NDAs"
              : "Review and sign documents from employers"}
          </p>
        </div>
        {isEmployer && applications.length > 0 && (
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            Create Document
          </Button>
        )}
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : documents && documents.length > 0 ? (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">
              All ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({pendingDocs.length})
            </TabsTrigger>
            <TabsTrigger value="signed">
              Signed ({signedDocs.length})
            </TabsTrigger>
            <TabsTrigger value="declined">
              Declined ({declinedDocs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {documents.map(renderDocumentCard)}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingDocs.length > 0 ? (
              pendingDocs.map(renderDocumentCard)
            ) : (
              <EmptyState message="No pending documents" />
            )}
          </TabsContent>

          <TabsContent value="signed" className="space-y-4">
            {signedDocs.length > 0 ? (
              signedDocs.map(renderDocumentCard)
            ) : (
              <EmptyState message="No signed documents" />
            )}
          </TabsContent>

          <TabsContent value="declined" className="space-y-4">
            {declinedDocs.length > 0 ? (
              declinedDocs.map(renderDocumentCard)
            ) : (
              <EmptyState message="No declined documents" />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No documents</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              {isEmployer 
                ? "Create and send documents like contracts, offer letters, and NDAs to candidates."
                : "Documents sent to you by employers will appear here for you to review and sign."}
            </p>
            {isEmployer && applications.length > 0 && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Create Your First Document
              </Button>
            )}
            {isEmployer && applications.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You need applicants in "Reviewing", "Interview", or "Hired" status to send documents.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CreateDocumentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        applications={applications}
      />

      <DocumentViewerDialog
        document={selectedDocument}
        open={viewerDialogOpen}
        onOpenChange={setViewerDialogOpen}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-8 text-center">
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
