import { useMemo, useRef, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MousePointer2,
  RotateCcw,
} from "lucide-react";

// Set up PDF.js worker using CDN for reliability
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface SignatureFieldWithPosition {
  id: string;
  label: string;
  required: boolean;
  type: "candidate" | "employer";
  x: number; // percentage from left (0-100)
  y: number; // percentage from top (0-100)
  page: number;
  width: number; // percentage width
  height: number; // percentage height
}

interface PdfSignaturePlacerProps {
  pdfUrl: string;
  signatureFields: SignatureFieldWithPosition[];
  onFieldsChange: (fields: SignatureFieldWithPosition[]) => void;
  readOnly?: boolean;
  activeSignerId?: "candidate" | "employer";
  signatures?: Record<string, string>;
  guidedMode?: boolean; // Enable step-by-step guided placement
}

// Define the 4 fields to place in order
const PLACEMENT_STEPS = [
  { id: "candidate_signature", label: "Candidate Signature", type: "candidate" as const, width: 20, height: 5 },
  { id: "candidate_date", label: "Candidate Date", type: "candidate" as const, width: 12, height: 4 },
  { id: "employer_signature", label: "Employer Signature", type: "employer" as const, width: 20, height: 5 },
  { id: "employer_date", label: "Employer Date", type: "employer" as const, width: 12, height: 4 },
];

export function PdfSignaturePlacer({
  pdfUrl,
  signatureFields,
  onFieldsChange,
  readOnly = false,
  activeSignerId,
  signatures = {},
  guidedMode = false,
}: PdfSignaturePlacerProps) {
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [zoom] = useState(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placementStep, setPlacementStep] = useState(0); // 0-3 for guided mode
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const file = useMemo(() => ({ url: pdfUrl }), [pdfUrl]);

  const isPlacementComplete = placementStep >= PLACEMENT_STEPS.length;
  const currentStepInfo = PLACEMENT_STEPS[placementStep];

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (err: Error) => {
    console.error("PDF load error:", err);
    setError(err?.message || "Failed to load PDF document");
    setLoading(false);
  };

  const onDocumentSourceError = (err: Error) => {
    console.error("PDF source error:", err, { pdfUrl });
    setError(err?.message || "Failed to resolve PDF source");
    setLoading(false);
  };

  // Helper to find the next missing field step
  const findNextMissingStep = (fields: SignatureFieldWithPosition[]) => {
    const placedIds = fields.map(f => f.id);
    for (let i = 0; i < PLACEMENT_STEPS.length; i++) {
      if (!placedIds.includes(PLACEMENT_STEPS[i].id)) {
        return i;
      }
    }
    return PLACEMENT_STEPS.length; // All placed
  };

  const handlePdfClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !guidedMode || isPlacementComplete) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Create the field at clicked position
    const newField: SignatureFieldWithPosition = {
      id: currentStepInfo.id,
      label: currentStepInfo.label,
      required: true,
      type: currentStepInfo.type,
      x: Math.max(0, Math.min(100 - currentStepInfo.width, x - currentStepInfo.width / 2)),
      y: Math.max(0, Math.min(100 - currentStepInfo.height, y - currentStepInfo.height / 2)),
      page: currentPage,
      width: currentStepInfo.width,
      height: currentStepInfo.height,
    };

    const newFields = [...signatureFields, newField];
    onFieldsChange(newFields);
    
    // Find the next missing field, not just increment
    setPlacementStep(findNextMissingStep(newFields));
  };

  const rafRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !guidedMode || isPlacementComplete) {
      setHoverPosition(null);
      return;
    }

    // Capture values synchronously before RAF (event object gets pooled/nullified)
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Throttle updates using requestAnimationFrame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      setHoverPosition({ x, y });
      rafRef.current = null;
    });
  }, [readOnly, guidedMode, isPlacementComplete]);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoverPosition(null);
  }, []);

  const handleUndo = () => {
    if (placementStep > 0) {
      const prevStep = placementStep - 1;
      const prevStepId = PLACEMENT_STEPS[prevStep].id;
      onFieldsChange(signatureFields.filter(f => f.id !== prevStepId));
      setPlacementStep(prevStep);
    }
  };

  const handleReset = () => {
    onFieldsChange([]);
    setPlacementStep(0);
  };

  const removeField = (fieldId: string) => {
    const newFields = signatureFields.filter(f => f.id !== fieldId);
    onFieldsChange(newFields);
    setPlacementStep(findNextMissingStep(newFields));
  };

  const getFieldColor = (type: "candidate" | "employer") => {
    return type === "candidate" 
      ? "border-blue-500 bg-blue-500/10" 
      : "border-emerald-500 bg-emerald-500/10";
  };

  const getFieldIcon = (type: "candidate" | "employer") => {
    return type === "candidate" ? User : Building2;
  };

  const currentPageFields = signatureFields.filter(f => f.page === currentPage);

  return (
    <div className="space-y-2">
      {/* Compact Guided Placement Header */}
      {guidedMode && !readOnly && (
        <div className="flex items-center justify-between gap-2 px-1">
          {!isPlacementComplete ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MousePointer2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium text-primary truncate">
                Click to place: <strong>{currentStepInfo.label}</strong>
              </span>
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {placementStep + 1}/4
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">All fields placed</span>
            </div>
          )}
          
          {/* Inline Undo/Reset */}
          {placementStep > 0 && (
            <div className="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleUndo}>
                <RotateCcw className="h-3 w-3 mr-1" />
                Undo
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={handleReset}>
                Reset
              </Button>
            </div>
          )}
        </div>
      )}

      {/* PDF Container */}
      <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
        {/* Compact Page Navigation */}
        {numPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-1 px-2 border-b border-border bg-background">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentPage} / {numPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* PDF Content - Maximized height */}
        <div className="overflow-auto max-h-[calc(80vh-160px)] flex justify-center p-2 bg-zinc-100 dark:bg-zinc-900">
          {loading && !error && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-destructive max-w-[720px] w-full">
              <AlertCircle className="h-8 w-8" />
              <p className="text-center text-sm">{error}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, "_blank")}>Open PDF</Button>
              </div>
              {/* Fallback preview */}
              <div className="w-full rounded-lg overflow-hidden border border-border bg-background">
                <iframe
                  src={pdfUrl}
                  title="PDF Preview"
                  className="w-full h-[420px] border-0"
                />
              </div>
            </div>
          )}

          <Document
            key={pdfUrl}
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            onSourceError={onDocumentSourceError}
            loading={null}
            options={{
              disableRange: true,
              disableStream: true,
            }}
          >
            {numPages > 0 && (
              <div 
                ref={pageContainerRef} 
                className={cn(
                  "relative",
                  guidedMode && !isPlacementComplete && !readOnly && "cursor-crosshair"
                )}
                onClick={handlePdfClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <Page
                  pageNumber={currentPage}
                  scale={zoom}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />

              {/* Hover Preview (Guided Mode) */}
              {guidedMode && !readOnly && !isPlacementComplete && hoverPosition && (
                <div
                  className={cn(
                    "absolute border-2 border-dashed rounded pointer-events-none",
                    currentStepInfo.type === "candidate" ? "border-blue-500/70 bg-blue-500/15" : "border-emerald-500/70 bg-emerald-500/15"
                  )}
                  style={{
                    left: `${Math.max(0, Math.min(100 - currentStepInfo.width, hoverPosition.x - currentStepInfo.width / 2))}%`,
                    top: `${Math.max(0, Math.min(100 - currentStepInfo.height, hoverPosition.y - currentStepInfo.height / 2))}%`,
                    width: `${currentStepInfo.width}%`,
                    height: `${currentStepInfo.height}%`,
                    minHeight: "24px",
                    minWidth: "60px",
                    willChange: "transform, left, top",
                    transform: "translateZ(0)",
                  }}
                >
                  <span className={cn(
                    "absolute inset-0 flex items-center justify-center text-xs font-medium",
                    currentStepInfo.type === "candidate" ? "text-blue-600" : "text-emerald-600"
                  )}>
                    {currentStepInfo.label}
                  </span>
                </div>
              )}

              {/* Signature Fields Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <AnimatePresence>
                  {currentPageFields.map((field) => {
                    const FieldIcon = getFieldIcon(field.type);
                    const hasSignature = signatures[field.id];
                    const isActive = activeSignerId === field.type && !hasSignature;
                    
                    return (
                      <motion.div
                        key={field.id}
                        data-signature-field
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "absolute border-2 rounded pointer-events-auto",
                          getFieldColor(field.type),
                          hasSignature && "border-success bg-success/10",
                          isActive && "ring-2 ring-primary ring-offset-2"
                        )}
                        style={{
                          left: `${field.x}%`,
                          top: `${field.y}%`,
                          width: `${field.width}%`,
                          height: `${field.height}%`,
                          minHeight: "24px",
                          minWidth: "60px",
                        }}
                      >
                        {/* Field Content */}
                        <div className="flex items-center justify-center h-full p-1 gap-1">
                          {hasSignature ? (
                            <img 
                              src={signatures[field.id]} 
                              alt="Signature" 
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <>
                              <FieldIcon className={cn(
                                "h-3 w-3 flex-shrink-0",
                                field.type === "candidate" ? "text-blue-600" : "text-emerald-600"
                              )} />
                              <span className={cn(
                                "text-xs font-medium truncate",
                                field.type === "candidate" ? "text-blue-700" : "text-emerald-700"
                              )}>
                                {field.label}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Delete Button (Edit Mode Only) */}
                        {!readOnly && !hasSignature && (
                          <button
                            className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(field.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
            )}
          </Document>
        </div>
      </div>

      {/* Field List (Non-guided mode) */}
      {!guidedMode && signatureFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Signature Fields ({signatureFields.length})</p>
          <div className="flex flex-wrap gap-2">
            {signatureFields.map((field) => {
              const FieldIcon = getFieldIcon(field.type);
              return (
                <Badge 
                  key={field.id}
                  variant="outline"
                  className={cn(
                    "gap-1",
                    field.type === "candidate" 
                      ? "border-blue-500 text-blue-600" 
                      : "border-emerald-500 text-emerald-600"
                  )}
                >
                  <FieldIcon className="h-3 w-3" />
                  {field.label} (Page {field.page})
                  {!readOnly && (
                    <button
                      onClick={() => removeField(field.id)}
                      className="ml-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
