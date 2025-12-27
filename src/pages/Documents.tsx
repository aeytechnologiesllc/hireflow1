import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useDocuments, DocumentWithApplication } from "@/hooks/useDocuments";
import { useApplicationsForDocuments } from "@/hooks/useApplicationsForDocuments";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { useDocumentRequests, useDeleteDocumentRequest, DocumentRequestWithDetails } from "@/hooks/useDocumentRequests";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { FileText, Clock, CheckCircle, XCircle, Eye, PenTool, Wand2, Trash2, Loader2, EyeOff, CalendarDays, Search, X, ClipboardList } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { DocumentWizard } from "@/components/documents/DocumentWizard";
import { DocumentSigningDialog } from "@/components/documents/DocumentSigningDialog";
import { SignedDocumentViewer } from "@/components/documents/SignedDocumentViewer";
import { DocumentRequestWizard } from "@/components/documents/DocumentRequestWizard";
import { DocumentRequestCard } from "@/components/documents/DocumentRequestCard";
import { DocumentUploadDialog } from "@/components/documents/DocumentUploadDialog";
import { DocumentRequestViewerDialog } from "@/components/documents/DocumentRequestViewerDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { cn } from "@/lib/utils";

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
    // Both employer and candidate see BLUE for awaiting employer signature
    if (isEmployer) {
      return { color: "bg-blue-500/20 text-blue-500", icon: PenTool, label: "Awaiting Your Signature" };
    }
    return { color: "bg-blue-500/20 text-blue-500", icon: Clock, label: "Awaiting Countersignature" };
  }
  
  return { color: "bg-yellow-500/20 text-yellow-500", icon: Clock, label: "Pending" };
};

export default function Documents() {
  const { user, role, isTeamMember } = useAuth();
  const { data: permissions } = useTeamMemberPermissions();
  const isEmployer = role === "employer";
  const canSendDocuments = !isTeamMember || permissions?.canSendDocuments;
  const { data: documents, isLoading } = useDocuments();
  const { data: applications = [] } = useApplicationsForDocuments();
  const { data: documentRequests = [], isLoading: isLoadingRequests } = useDocumentRequests();
  const deleteDocumentRequest = useDeleteDocumentRequest();
  
  const [wizardOpen, setWizardOpen] = useState(false);
  const [requestWizardOpen, setRequestWizardOpen] = useState(false);
  const [signingDialogOpen, setSigningDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [requestViewerOpen, setRequestViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithApplication | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<DocumentRequestWithDetails | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentWithApplication | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [preSelectedApplicationId, setPreSelectedApplicationId] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle query params to auto-open wizard for a specific applicant
  useEffect(() => {
    const applicantId = searchParams.get("applicant_id");
    const action = searchParams.get("action");
    
    if (applicantId && action === "create" && isEmployer && canSendDocuments) {
      // Set pre-selected application and open the wizard
      setPreSelectedApplicationId(applicantId);
      setWizardOpen(true);
      
      // Clear the query params
      searchParams.delete("applicant_id");
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isEmployer, canSendDocuments]);

  // Search and date filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);

  // Filter documents by search and date range
  const filteredDocuments = useMemo(() => {
    let docs = documents || [];
    
    // Filter by search query (applicant name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      docs = docs.filter(doc => 
        doc.applications?.profiles?.full_name?.toLowerCase().includes(query)
      );
    }
    
    // Filter by date range
    if (dateRange?.from) {
      docs = docs.filter(doc => {
        const docDate = new Date(doc.created_at);
        if (dateRange.to) {
          // Set end date to end of day
          const endDate = new Date(dateRange.to);
          endDate.setHours(23, 59, 59, 999);
          return docDate >= dateRange.from! && docDate <= endDate;
        }
        return docDate >= dateRange.from!;
      });
    }
    
    return docs;
  }, [documents, searchQuery, dateRange]);

  const pendingDocs = filteredDocuments.filter(d => d.status === "pending");
  const signedDocs = filteredDocuments.filter(d => d.status === "signed");
  const declinedDocs = filteredDocuments.filter(d => d.status === "declined");

  // Filter document requests for candidates (show only their pending requests)
  const candidatePendingRequests = documentRequests.filter(r => r.status === "pending" || r.status === "rejected");

  // Split document requests for employer tabs
  const pendingUploadRequests = documentRequests.filter(r => r.status === "pending");
  const receivedRequests = documentRequests.filter(r => r.status === "submitted" || r.status === "reviewed");

  const hasActiveFilters = searchQuery.trim() || dateRange?.from;


  // Mark pending document requests as viewed for candidates when they open this page
  const unseenCandidateRequestIds = useMemo(
    () => candidatePendingRequests.filter(r => !r.candidate_viewed_at).map(r => r.id),
    [candidatePendingRequests]
  );
  const viewedCandidateIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isEmployer || !user) return;
    if (unseenCandidateRequestIds.length === 0) return;

    const idsToMark = unseenCandidateRequestIds.filter((id) => !viewedCandidateIdsRef.current.has(id));
    if (idsToMark.length === 0) return;

    idsToMark.forEach((id) => viewedCandidateIdsRef.current.add(id));

    void (async () => {
      const { error } = await supabase
        .from("document_requests")
        .update({
          candidate_viewed_at: new Date().toISOString(),
        })
        .in("id", idsToMark);

      if (error) {
        idsToMark.forEach((id) => viewedCandidateIdsRef.current.delete(id));
        console.error("Failed to mark document requests as viewed:", error);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-documents-count"] });
    })();
  }, [isEmployer, user, unseenCandidateRequestIds, queryClient]);

  // Document request handlers
  const handleUploadRequest = (request: DocumentRequestWithDetails) => {
    setSelectedRequest(request);
    setUploadDialogOpen(true);
  };

  // Helper to mark document request as reviewed
  const markRequestAsReviewed = async (request: DocumentRequestWithDetails) => {
    if (!isEmployer || !user || request.status !== "submitted") return;
    
    const { error } = await supabase
      .from("document_requests")
      .update({
        status: "reviewed",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", request.id);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      queryClient.invalidateQueries({ queryKey: ["employer-pending-documents-count"] });
    }
  };

  const handleViewRequest = async (request: DocumentRequestWithDetails) => {
    if (request.file_url) {
      // Mark as reviewed when employer views the document
      await markRequestAsReviewed(request);
      
      setSelectedRequest(request);
      setRequestViewerOpen(true);
    }
  };

  const handleDownloadRequest = async (request: DocumentRequestWithDetails) => {
    if (!request.file_url) return;

    // Mark as reviewed when employer downloads the document
    await markRequestAsReviewed(request);

    try {
      let filePath: string;

      // Handle different URL formats
      if (request.file_url.includes('supabase.co')) {
        const urlParts = request.file_url.split("/requested-documents/");
        if (urlParts.length < 2) throw new Error("Invalid file URL format");
        filePath = urlParts[1];
      } else if (request.file_url.startsWith('requested-documents/')) {
        filePath = request.file_url.replace('requested-documents/', '');
      } else {
        filePath = request.file_url;
      }
      
      const { data, error } = await supabase.storage
        .from("requested-documents")
        .createSignedUrl(filePath, 60); // 1 minute for download

      if (error) throw error;
      
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = request.file_name || "document";
      link.click();
    } catch (err) {
      console.error("Download error:", err);
      toast({
        title: "Download Failed",
        description: "Could not download the document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRequest = async (request: DocumentRequestWithDetails) => {
    await deleteDocumentRequest.mutateAsync(request.id);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDateRange(undefined);
  };

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
                  {doc.applications?.profiles?.full_name && (
                    <>
                      <span>•</span>
                      <span>{doc.applications.profiles.full_name}</span>
                    </>
                  )}
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
    <motion.div 
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      <motion.div variants={staggerItem} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Documents</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {isEmployer ? "Create contracts, offer letters, and NDAs" : "Review and sign documents"}
          </p>
        </div>
        {isEmployer && canSendDocuments && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm" onClick={() => setRequestWizardOpen(true)}>
              <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Request Document</span>
              <span className="sm:hidden">Request</span>
            </Button>
            <Button size="sm" className="gap-1.5 text-xs sm:text-sm" onClick={() => setWizardOpen(true)}>
              <Wand2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Create Document</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </div>
        )}
        {isTeamMember && !canSendDocuments && (
          <Badge variant="outline" className="gap-1 text-muted-foreground text-xs">
            <EyeOff className="h-3 w-3" />
            View Only
          </Badge>
        )}
      </motion.div>

      {/* Search and Filter Bar */}
      {documents && documents.length > 0 && (
        <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-3">
          {/* Search by applicant name */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by applicant name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          {/* Date range picker */}
          <Popover open={isDateRangeOpen} onOpenChange={setIsDateRangeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("gap-2", dateRange?.from && "border-primary")}>
                <CalendarDays className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
                  ) : format(dateRange.from, "MMM d, yyyy")
                ) : "Select dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={(range) => {
                  setDateRange(range);
                  // Auto-close when both dates are selected
                  if (range?.from && range?.to) {
                    setIsDateRangeOpen(false);
                  }
                }}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Clear filters button */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          )}

          {/* Show filter result count */}
          {hasActiveFilters && (
            <span className="text-sm text-muted-foreground">
              Showing {filteredDocuments.length} of {documents.length} documents
            </span>
          )}
        </motion.div>
      )}

      {/* Candidate Pending Requests Banner */}
      {!isEmployer && candidatePendingRequests.length > 0 && (
        <motion.div variants={staggerItem}>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    {candidatePendingRequests.length} document{candidatePendingRequests.length > 1 ? "s" : ""} requested
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your employer has requested documents from you
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {candidatePendingRequests.map((request) => (
                  <DocumentRequestCard
                    key={request.id}
                    request={request}
                    isEmployer={false}
                    onUpload={handleUploadRequest}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isLoading || isLoadingRequests ? (
        <motion.div variants={staggerItem} className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </motion.div>
      ) : (documents && documents.length > 0) || (isEmployer && documentRequests && documentRequests.length > 0) ? (
        <motion.div variants={staggerItem}>
          <Tabs defaultValue="all" className="w-full">
            <div className="overflow-x-auto -mx-1 px-1 pb-2">
              <TabsList className="mb-4 inline-flex w-auto min-w-full sm:w-full gap-1">
                <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">
                  All ({filteredDocuments.length + (isEmployer ? documentRequests.length : 0)})
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">
                  Pending ({pendingDocs.length})
                </TabsTrigger>
                <TabsTrigger value="signed" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">
                  Signed ({signedDocs.length})
                </TabsTrigger>
                <TabsTrigger value="declined" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">
                  Declined ({declinedDocs.length})
                </TabsTrigger>
                {isEmployer && (
                  <>
                    <TabsTrigger value="pending-uploads" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">
                      <span className="hidden sm:inline">Pending Uploads</span>
                      <span className="sm:hidden">Uploads</span>
                      <span className="ml-1">({pendingUploadRequests.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="received" className="text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap">
                      Received ({receivedRequests.length})
                    </TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            <TabsContent value="all" className="space-y-4">
              {/* Show documents */}
              {filteredDocuments.map(renderDocumentCard)}
              {/* For employers, also show document requests in "All" */}
              {isEmployer && documentRequests.map((request) => (
                <DocumentRequestCard
                  key={request.id}
                  request={request}
                  isEmployer={true}
                  onView={request.file_url ? handleViewRequest : undefined}
                  onDownload={request.file_url ? handleDownloadRequest : undefined}
                  onDelete={handleDeleteRequest}
                />
              ))}
              {filteredDocuments.length === 0 && (!isEmployer || documentRequests.length === 0) && (
                <EmptyState message="No documents found" />
              )}
            </TabsContent>
            <TabsContent value="pending" className="space-y-4">
              {pendingDocs.length > 0 ? pendingDocs.map(renderDocumentCard) : <EmptyState message="No pending documents" />}
            </TabsContent>
            <TabsContent value="signed" className="space-y-4">
              {signedDocs.length > 0 ? signedDocs.map(renderDocumentCard) : <EmptyState message="No signed documents" />}
            </TabsContent>
            <TabsContent value="declined" className="space-y-4">
              {declinedDocs.length > 0 ? declinedDocs.map(renderDocumentCard) : <EmptyState message="No declined documents" />}
            </TabsContent>
            {isEmployer && (
              <>
                <TabsContent value="pending-uploads" className="space-y-4">
                  {pendingUploadRequests.length > 0 ? (
                    pendingUploadRequests.map((request) => (
                      <DocumentRequestCard
                        key={request.id}
                        request={request}
                        isEmployer={true}
                        onDelete={handleDeleteRequest}
                      />
                    ))
                  ) : (
                    <EmptyState message="No pending document requests" />
                  )}
                </TabsContent>
                <TabsContent value="received" className="space-y-4">
                  {receivedRequests.length > 0 ? (
                    receivedRequests.map((request) => (
                      <DocumentRequestCard
                        key={request.id}
                        request={request}
                        isEmployer={true}
                        onView={handleViewRequest}
                        onDownload={handleDownloadRequest}
                        onDelete={handleDeleteRequest}
                      />
                    ))
                  ) : (
                    <EmptyState message="No documents received yet" />
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>
        </motion.div>
      ) : !isEmployer && candidatePendingRequests.length > 0 ? (
        // Candidate has only pending requests, no documents - just show the banner (already rendered above)
        null
      ) : (
        <motion.div variants={staggerItem}>
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No documents</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
              {isEmployer 
                ? (canSendDocuments ? "Create AI-generated documents or request documents from candidates." : "Documents will appear here when created.")
                : "Documents will appear here."}
              </p>
              {isEmployer && canSendDocuments && (
                <div className="flex items-center justify-center gap-2">
                  <Button variant="outline" onClick={() => setRequestWizardOpen(true)}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Request Document
                  </Button>
                  <Button onClick={() => setWizardOpen(true)}>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Create Document
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <DocumentWizard 
        open={wizardOpen} 
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) setPreSelectedApplicationId(undefined);
        }} 
        applications={applications}
        preSelectedApplicationId={preSelectedApplicationId}
      />
      <DocumentRequestWizard open={requestWizardOpen} onOpenChange={setRequestWizardOpen} applications={applications} />
      <DocumentSigningDialog document={selectedDocument} open={signingDialogOpen} onOpenChange={setSigningDialogOpen} />
      <SignedDocumentViewer document={selectedDocument} open={viewerOpen} onOpenChange={setViewerOpen} />
      <DocumentUploadDialog 
        request={selectedRequest} 
        open={uploadDialogOpen} 
        onOpenChange={(open) => {
          setUploadDialogOpen(open);
          if (!open) setSelectedRequest(null);
        }} 
      />
      <DocumentRequestViewerDialog
        request={selectedRequest}
        open={requestViewerOpen}
        onOpenChange={(open) => {
          setRequestViewerOpen(open);
          if (!open) setSelectedRequest(null);
        }}
      />

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

    </motion.div>
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
