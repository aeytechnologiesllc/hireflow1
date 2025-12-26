import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SecurityBadge } from "./SecurityBadge";
import { DocumentRequestWithDetails, getDocumentTypeLabel } from "@/hooks/useDocumentRequests";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  FileText,
  Download,
  Calendar,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentRequestViewerDialogProps {
  request: DocumentRequestWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentRequestViewerDialog({
  request,
  open,
  onOpenChange,
}: DocumentRequestViewerDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(true);

  useEffect(() => {
    if (open && request?.file_url) {
      fetchSignedUrl();
    } else {
      setSignedUrl(null);
      setError(null);
      setZoom(1);
      setRotation(0);
      setNumPages(0);
      setCurrentPage(1);
      setPdfLoading(true);
    }
  }, [open, request?.file_url]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setPdfLoading(false);
  };

  const onDocumentLoadError = () => {
    setPdfLoading(false);
    setError("Failed to load PDF document");
  };

  const goToPreviousPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(p + 1, numPages));

  const fetchSignedUrl = async () => {
    if (!request?.file_url) return;

    setIsLoading(true);
    setError(null);

    try {
      let filePath: string;

      // Handle different URL formats:
      // 1. Full Supabase URL: https://xxx.supabase.co/storage/.../requested-documents/path
      // 2. Old format with bucket prefix: requested-documents/path
      // 3. New format: just the path (userId/requestId/timestamp.ext)
      if (request.file_url.includes('supabase.co')) {
        const urlParts = request.file_url.split("/requested-documents/");
        if (urlParts.length < 2) {
          throw new Error("Invalid file URL format");
        }
        filePath = urlParts[1];
      } else if (request.file_url.startsWith('requested-documents/')) {
        filePath = request.file_url.replace('requested-documents/', '');
      } else {
        filePath = request.file_url;
      }

      const { data, error: signError } = await supabase.storage
        .from("requested-documents")
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (signError) throw signError;
      setSignedUrl(data.signedUrl);
    } catch (err: any) {
      console.error("Error fetching signed URL:", err);
      setError(err.message || "Failed to load document");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!signedUrl || !request) return;

    const link = document.createElement("a");
    link.href = signedUrl;
    link.download = request.file_name || "document";
    link.click();
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  if (!request) return null;

  const documentLabel = request.custom_document_name || getDocumentTypeLabel(request.document_type);
  const candidateName = request.candidate_profile?.full_name || request.candidate_profile?.email || "Unknown";
  const initials = candidateName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isImage = request.file_name?.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  const isPdf = request.file_name?.match(/\.pdf$/i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {documentLabel}
          </DialogTitle>
        </DialogHeader>

        {/* Document info bar */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={request.candidate_profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{candidateName}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Uploaded {request.submitted_at && format(new Date(request.submitted_at), "MMM d, yyyy 'at' h:mm a")}</span>
            </div>
            <SecurityBadge variant="encrypted" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            {(isImage || isPdf) && (
              <>
                <Button size="icon" variant="ghost" onClick={handleZoomOut} title="Zoom out">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={handleZoomIn} title="Zoom in">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={handleRotate} title="Rotate">
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}
            {isPdf && numPages > 1 && (
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button size="icon" variant="ghost" onClick={goToPreviousPage} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {currentPage} / {numPages}
                </span>
                <Button size="icon" variant="ghost" onClick={goToNextPage} disabled={currentPage >= numPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={!signedUrl}>
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </div>
        </div>

        {/* Document viewer */}
        <div className="flex-1 min-h-[400px] rounded-lg bg-secondary/30 border border-border overflow-auto flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Loading document...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchSignedUrl}>
                Try Again
              </Button>
            </div>
          ) : signedUrl ? (
            isImage ? (
              <motion.img
                src={signedUrl}
                alt={documentLabel}
                className="max-w-full max-h-full object-contain transition-transform duration-200"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            ) : isPdf ? (
              <div className="flex flex-col items-center w-full overflow-auto p-4">
                <Document
                  file={signedUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <p>Loading PDF...</p>
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center gap-3 text-destructive">
                      <AlertCircle className="h-8 w-8" />
                      <p>Failed to load PDF</p>
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    scale={zoom}
                    rotate={rotation}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="shadow-lg"
                  />
                </Document>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <FileText className="h-16 w-16" />
                <p className="font-medium">{request.file_name}</p>
                <Button onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download to View
                </Button>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <FileText className="h-16 w-16" />
              <p>No document available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
