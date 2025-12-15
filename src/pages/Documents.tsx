import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDocuments, DocumentWithApplication } from "@/hooks/useDocuments";
import { useApplicationsForDocuments } from "@/hooks/useApplicationsForDocuments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FileText, Clock, CheckCircle, XCircle, Eye, PenTool, Wand2, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { DocumentSigningDialog } from "@/components/documents/DocumentSigningDialog";
import { SignedDocumentViewer } from "@/components/documents/SignedDocumentViewer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Get display status based on document state and user role
const getDisplayStatus = (doc: DocumentWithApplication, isEmployer: boolean) => {
  if (doc.status === "signed") {
    return { color: "bg-success/20 text-success", icon: CheckCircle, label: "Fully Signed" };
  }
  if (doc.status === "declined") {
    return { color: "bg-destructive/20 text-destructive", icon: XCircle, label: "Declined" };
  }
  // Pending status - check signing state
  const candidateSigned = !!doc.candidate_signed_at;
  const employerSigned = !!doc.employer_signed_at;
  
  if (candidateSigned && !employerSigned) {
    if (isEmployer) {
      return { color: "bg-primary/20 text-primary", icon: PenTool, label: "Awaiting Your Signature" };
    }
    return { color: "bg-blue-500/20 text-blue-500", icon: Clock, label: "Awaiting Countersignature" };
  }
  
  return { color: "bg-yellow-500/20 text-yellow-500", icon: Clock, label: "Pending" };
};

export default function Documents() {
  const { role } = useAuth();
  const isEmployer = role === "employer";
  const { data: documents, isLoading } = useDocuments();
  const { data: applications = [] } = useApplicationsForDocuments();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [signingDialogOpen, setSigningDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithApplication | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentWithApplication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const pendingDocs = documents?.filter(d => d.status === "pending") || [];
  const signedDocs = documents?.filter(d => d.status === "signed") || [];
  const declinedDocs = documents?.filter(d => d.status === "declined") || [];

  const handleViewDocument = (doc: DocumentWithApplication) => {
    setSelectedDocument(doc);
    // Use the signed viewer for fully signed documents, otherwise use signing dialog
    if (doc.status === "signed") {
      setViewerOpen(true);
    } else {
      setSigningDialogOpen(true);
    }
  };

  const handleDeleteClick = (doc: DocumentWithApplication, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentToDelete.id);

      if (error) throw error;

      toast({
        title: "Document Deleted",
        description: "The document has been permanently deleted.",
      });

      queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete document.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const renderDocumentCard = (doc: DocumentWithApplication) => {
    const status = getDisplayStatus(doc, isEmployer);
    const StatusIcon = status.icon;

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
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={status.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
              <Button variant="ghost" size="icon" onClick={() => handleViewDocument(doc)}>
                {/* Show pen icon only if user can sign: pending status, and (candidate hasn't signed yet OR employer's turn) */}
                {doc.status === "pending" && (
                  (!isEmployer && !doc.candidate_signed_at) || 
                  (isEmployer && doc.candidate_signed_at && !doc.employer_signed_at)
                ) ? (
                  <PenTool className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => handleDeleteClick(doc, e)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Documents</h2>
          <p className="text-muted-foreground mt-1">
            {isEmployer ? "Create AI-powered contracts, offer letters, and NDAs" : "Review and sign documents"}
          </p>
        </div>
        {isEmployer && (
          <Button className="gap-2" onClick={() => setWizardOpen(true)}>
            <Wand2 className="h-4 w-4" />
            Create Document
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : documents && documents.length > 0 ? (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All ({documents.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingDocs.length})</TabsTrigger>
            <TabsTrigger value="signed">Signed ({signedDocs.length})</TabsTrigger>
            <TabsTrigger value="declined">Declined ({declinedDocs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">{documents.map(renderDocumentCard)}</TabsContent>
          <TabsContent value="pending" className="space-y-4">
            {pendingDocs.length > 0 ? pendingDocs.map(renderDocumentCard) : <EmptyState message="No pending documents" />}
          </TabsContent>
          <TabsContent value="signed" className="space-y-4">
            {signedDocs.length > 0 ? signedDocs.map(renderDocumentCard) : <EmptyState message="No signed documents" />}
          </TabsContent>
          <TabsContent value="declined" className="space-y-4">
            {declinedDocs.length > 0 ? declinedDocs.map(renderDocumentCard) : <EmptyState message="No declined documents" />}
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No documents</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              {isEmployer ? "Create AI-generated documents like NDAs and offer letters." : "Documents will appear here."}
            </p>
            {isEmployer && (
              <Button onClick={() => setWizardOpen(true)}>
                <Wand2 className="h-4 w-4 mr-2" />
                Create Your First Document
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <DocumentWizard open={wizardOpen} onOpenChange={setWizardOpen} applications={applications} />
      <DocumentSigningDialog document={selectedDocument} open={signingDialogOpen} onOpenChange={setSigningDialogOpen} />
      <SignedDocumentViewer document={selectedDocument} open={viewerOpen} onOpenChange={setViewerOpen} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Document
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete <strong>"{documentToDelete?.name}"</strong>?
              </p>
              <p className="text-destructive font-medium">
                ⚠️ This action cannot be undone. The document and all associated signatures will be permanently deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
