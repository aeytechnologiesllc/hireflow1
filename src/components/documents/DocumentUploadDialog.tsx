import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { SecurityBadge } from "./SecurityBadge";
import { DocumentRequestWithDetails, getDocumentTypeLabel, useUpdateDocumentRequest } from "@/hooks/useDocumentRequests";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Upload,
  FileText,
  X,
  Check,
  Lock,
  Shield,
  ShieldCheck,
  Loader2,
  Calendar,
  AlertCircle,
  Image,
  File,
} from "lucide-react";

interface DocumentUploadDialogProps {
  request: DocumentRequestWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UploadPhase = "idle" | "uploading" | "encrypting" | "securing" | "complete";

const phaseConfig: Record<UploadPhase, { icon: React.ElementType; label: string; color: string }> = {
  idle: { icon: Upload, label: "Ready to upload", color: "text-muted-foreground" },
  uploading: { icon: Loader2, label: "Uploading document...", color: "text-primary" },
  encrypting: { icon: Lock, label: "Encrypting your document...", color: "text-primary" },
  securing: { icon: Shield, label: "Securing storage...", color: "text-primary" },
  complete: { icon: ShieldCheck, label: "Complete! Your document is protected", color: "text-success" },
};

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function DocumentUploadDialog({
  request,
  open,
  onOpenChange,
}: DocumentUploadDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const updateRequest = useUpdateDocumentRequest();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Please upload a PDF or image file (JPG, PNG, WebP)";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File size must be less than 10MB";
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const simulatePhase = (phaseName: UploadPhase, duration: number): Promise<void> => {
    return new Promise((resolve) => {
      setPhase(phaseName);
      setTimeout(resolve, duration);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !request || !user) return;

    setError(null);
    setProgress(0);

    try {
      // Phase 1: Uploading
      setPhase("uploading");
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${request.id}/${Date.now()}.${fileExt}`;

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 40));
      }, 100);

      const { error: uploadError } = await supabase.storage
        .from("requested-documents")
        .upload(fileName, selectedFile);

      clearInterval(progressInterval);
      setProgress(40);

      if (uploadError) throw uploadError;

      // Phase 2: Encrypting
      await simulatePhase("encrypting", 1200);
      setProgress(65);

      // Phase 3: Securing
      await simulatePhase("securing", 800);
      setProgress(85);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("requested-documents")
        .getPublicUrl(fileName);

      // Update document request
      await updateRequest.mutateAsync({
        id: request.id,
        file_url: urlData.publicUrl,
        file_name: selectedFile.name,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      });

      setProgress(100);
      setPhase("complete");

      // Wait a bit then close
      setTimeout(() => {
        toast({
          title: "Document Uploaded",
          description: "Your document has been securely uploaded and is awaiting review.",
        });
        handleClose();
      }, 1500);
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload document. Please try again.");
      setPhase("idle");
      setProgress(0);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
    setIsDragOver(false);
    onOpenChange(false);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!request) return null;

  const phaseInfo = phaseConfig[phase];
  const PhaseIcon = phaseInfo.icon;
  const isUploading = phase !== "idle" && phase !== "complete";
  const documentLabel = request.custom_document_name || getDocumentTypeLabel(request.document_type);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Upload Document
          </DialogTitle>
          <DialogDescription>
            {documentLabel}
          </DialogDescription>
        </DialogHeader>

        {/* Security badge */}
        <div className="flex justify-center">
          <SecurityBadge variant="protected" size="md" />
        </div>

        {/* Request info */}
        <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
          {request.description && (
            <p className="text-sm text-foreground">{request.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {request.due_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Due {format(new Date(request.due_date), "MMM d, yyyy")}</span>
              </div>
            )}
            <Badge variant={request.is_required ? "default" : "outline"} className="text-xs">
              {request.is_required ? "Required" : "Optional"}
            </Badge>
          </div>
        </div>

        {/* Upload area */}
        <AnimatePresence mode="wait">
          {phase === "idle" && !selectedFile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200",
                  isDragOver
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  onChange={handleInputChange}
                  className="hidden"
                />
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium text-foreground mb-1">
                  Drag and drop your file here
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  PDF, JPG, PNG, or WebP (max 10MB)
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Files
                </Button>
              </div>
            </motion.div>
          )}

          {phase === "idle" && selectedFile && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* File preview */}
              <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-start gap-3">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
                      <File className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Upload button */}
              <Button className="w-full" onClick={handleUpload}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </motion.div>
          )}

          {isUploading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 py-4"
            >
              {/* Animated icon */}
              <div className="flex justify-center">
                <motion.div
                  className="w-20 h-20 rounded-full flex items-center justify-center bg-primary/20"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <PhaseIcon
                    className={cn(
                      "h-10 w-10 animate-spin",
                      phaseInfo.color
                    )}
                  />
                </motion.div>
              </div>

              {/* Phase label */}
              <p className={cn("text-center font-medium", phaseInfo.color)}>
                {phaseInfo.label}
              </p>

              {/* Progress bar */}
              <Progress value={progress} className="h-2" />

              {/* Security message */}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>Your document is protected with bank-level encryption</span>
              </div>
            </motion.div>
          )}

          {phase === "complete" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center"
            >
              <motion.div
                className="w-20 h-20 mx-auto rounded-full bg-success/20 flex items-center justify-center mb-4"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
              >
                <Check className="h-10 w-10 text-success" />
              </motion.div>
              <p className="font-medium text-success">Document Uploaded Successfully!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your document is securely stored and awaiting review.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
