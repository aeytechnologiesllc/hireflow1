import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  PenTool, 
  Trash2, 
  User, 
  Building2, 
  Move,
  Plus,
  ZoomIn,
  ZoomOut,
  GripVertical
} from "lucide-react";

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
}

export function PdfSignaturePlacer({
  pdfUrl,
  signatureFields,
  onFieldsChange,
  readOnly = false,
  activeSignerId,
  signatures = {},
}: PdfSignaturePlacerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<"candidate" | "employer" | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isDragging, setIsDragging] = useState(false);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!placementMode || readOnly || isDragging) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Check if clicking on existing field
    const clickedOnField = (e.target as HTMLElement).closest('[data-signature-field]');
    if (clickedOnField) return;
    
    const newField: SignatureFieldWithPosition = {
      id: `field_${Date.now()}`,
      label: placementMode === "candidate" ? "Candidate Signature" : "Employer Signature",
      required: true,
      type: placementMode,
      x: Math.max(0, Math.min(x - 10, 80)), // Center the field (20% width)
      y: Math.max(0, Math.min(y - 3, 90)), // Offset slightly
      page: 1,
      width: 20,
      height: 6,
    };
    
    onFieldsChange([...signatureFields, newField]);
    setPlacementMode(null);
  }, [placementMode, readOnly, isDragging, signatureFields, onFieldsChange]);

  const handleFieldDragStart = (fieldId: string) => {
    if (readOnly) return;
    setDraggedField(fieldId);
    setIsDragging(true);
  };

  const handleFieldDrag = useCallback((e: React.MouseEvent<HTMLDivElement>, fieldId: string) => {
    if (!draggedField || draggedField !== fieldId || readOnly) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const field = signatureFields.find(f => f.id === fieldId);
    if (!field) return;
    
    const updatedFields = signatureFields.map(f => {
      if (f.id === fieldId) {
        return {
          ...f,
          x: Math.max(0, Math.min(x - field.width / 2, 100 - field.width)),
          y: Math.max(0, Math.min(y - field.height / 2, 100 - field.height)),
        };
      }
      return f;
    });
    
    onFieldsChange(updatedFields);
  }, [draggedField, readOnly, signatureFields, onFieldsChange]);

  const handleFieldDragEnd = () => {
    setDraggedField(null);
    setTimeout(() => setIsDragging(false), 100);
  };

  const removeField = (fieldId: string) => {
    onFieldsChange(signatureFields.filter(f => f.id !== fieldId));
  };

  const getFieldColor = (type: "candidate" | "employer") => {
    return type === "candidate" 
      ? "border-blue-500 bg-blue-500/10" 
      : "border-emerald-500 bg-emerald-500/10";
  };

  const getFieldIcon = (type: "candidate" | "employer") => {
    return type === "candidate" ? User : Building2;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Add Signature:</span>
            <Button
              variant={placementMode === "candidate" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlacementMode(placementMode === "candidate" ? null : "candidate")}
              className={cn(
                placementMode === "candidate" && "bg-blue-600 hover:bg-blue-700"
              )}
            >
              <User className="h-4 w-4 mr-1" />
              Candidate
            </Button>
            <Button
              variant={placementMode === "employer" ? "default" : "outline"}
              size="sm"
              onClick={() => setPlacementMode(placementMode === "employer" ? null : "employer")}
              className={cn(
                placementMode === "employer" && "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              <Building2 className="h-4 w-4 mr-1" />
              Employer
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              disabled={zoom <= 50}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom(Math.min(150, zoom + 10))}
              disabled={zoom >= 150}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Placement Mode Indicator */}
      {placementMode && !readOnly && (
        <div className={cn(
          "p-3 rounded-lg border-2 border-dashed text-center text-sm",
          placementMode === "candidate" 
            ? "border-blue-500 bg-blue-500/5 text-blue-600" 
            : "border-emerald-500 bg-emerald-500/5 text-emerald-600"
        )}>
          <PenTool className="h-4 w-4 inline mr-2" />
          Click anywhere on the PDF to place {placementMode === "candidate" ? "candidate" : "employer"} signature
        </div>
      )}

      {/* PDF Container with Signature Fields Overlay */}
      <div 
        ref={containerRef}
        className={cn(
          "relative rounded-lg border border-border overflow-hidden bg-zinc-100 dark:bg-zinc-900",
          placementMode && "cursor-crosshair",
          !readOnly && !placementMode && "cursor-default"
        )}
        style={{ 
          minHeight: "500px",
          transform: `scale(${zoom / 100})`,
          transformOrigin: "top center",
        }}
        onClick={handleContainerClick}
        onMouseMove={(e) => draggedField && handleFieldDrag(e, draggedField)}
        onMouseUp={handleFieldDragEnd}
        onMouseLeave={handleFieldDragEnd}
      >
        {/* PDF Iframe */}
        <iframe
          src={`${pdfUrl}#toolbar=0&navpanes=0`}
          className="w-full h-[600px] border-0 pointer-events-none"
          title="Document Preview"
        />

        {/* Signature Fields Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {signatureFields.map((field) => {
              const FieldIcon = getFieldIcon(field.type);
              const hasSignature = signatures[field.id];
              const isActive = activeSignerId === field.type && !hasSignature;
              
              return (
                <motion.div
                  key={field.id}
                  data-signature-field
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={cn(
                    "absolute border-2 rounded pointer-events-auto transition-all",
                    getFieldColor(field.type),
                    hasSignature && "border-success bg-success/10",
                    isActive && "ring-2 ring-primary ring-offset-2 animate-pulse",
                    draggedField === field.id && "opacity-70 scale-105",
                    !readOnly && "hover:shadow-lg"
                  )}
                  style={{
                    left: `${field.x}%`,
                    top: `${field.y}%`,
                    width: `${field.width}%`,
                    height: `${field.height}%`,
                    minHeight: "40px",
                    minWidth: "100px",
                  }}
                >
                  {/* Field Content */}
                  <div className="flex items-center justify-center h-full p-2 gap-2">
                    {hasSignature ? (
                      <img 
                        src={signatures[field.id]} 
                        alt="Signature" 
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <>
                        <FieldIcon className={cn(
                          "h-4 w-4",
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

                  {/* Drag Handle & Delete Button (Edit Mode Only) */}
                  {!readOnly && !hasSignature && (
                    <>
                      <div
                        className={cn(
                          "absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-8 rounded-l flex items-center justify-center cursor-grab active:cursor-grabbing",
                          field.type === "candidate" ? "bg-blue-500" : "bg-emerald-500"
                        )}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleFieldDragStart(field.id);
                        }}
                      >
                        <GripVertical className="h-4 w-4 text-white" />
                      </div>
                      <button
                        className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/90 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(field.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Field List */}
      {signatureFields.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Signature Fields ({signatureFields.length})</Label>
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
                  {field.label}
                  {!readOnly && (
                    <button
                      onClick={() => removeField(field.id)}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  )}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {signatureFields.length === 0 && !readOnly && (
        <div className="text-center p-6 bg-secondary/30 rounded-lg border border-dashed border-border">
          <PenTool className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No signature fields placed yet. Use the buttons above to add signature fields.
          </p>
        </div>
      )}
    </div>
  );
}
