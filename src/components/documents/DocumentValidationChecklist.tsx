import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronRight,
  Building2,
  User,
  Briefcase,
  Calendar,
  Scale,
  PenTool,
  FileText,
  AlertTriangle,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DocumentValidation, ValidationResult } from "@/lib/documentValidation";
import { getValidationCounts, isDocumentReady } from "@/lib/documentValidation";

interface DocumentValidationChecklistProps {
  validation: DocumentValidation;
  onFieldClick?: (field: string) => void;
  className?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  companyIdentity: {
    label: "Company Identity",
    icon: Building2,
    description: "Company name, email, and contact information",
  },
  recipientInfo: {
    label: "Recipient Information",
    icon: User,
    description: "Recipient name and contact details",
  },
  roleCompensation: {
    label: "Role & Compensation",
    icon: Briefcase,
    description: "Job title and compensation details",
  },
  dateValidation: {
    label: "Date Validation",
    icon: Calendar,
    description: "Document and start dates",
  },
  legalCompliance: {
    label: "Legal & Compliance",
    icon: Scale,
    description: "Required legal disclaimers and jurisdiction",
  },
  signatureConfig: {
    label: "Signature Configuration",
    icon: PenTool,
    description: "Signature fields and signing order",
  },
  formatting: {
    label: "Formatting & Content",
    icon: FileText,
    description: "Placeholders and document structure",
  },
};

function ValidationItem({ 
  result, 
  onFieldClick 
}: { 
  result: ValidationResult; 
  onFieldClick?: (field: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-start gap-3 py-2 px-3 rounded-lg transition-colors",
        result.passed 
          ? "bg-emerald-500/5" 
          : "bg-destructive/5 cursor-pointer hover:bg-destructive/10"
      )}
      onClick={() => !result.passed && result.field && onFieldClick?.(result.field)}
    >
      {result.passed ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm",
          result.passed ? "text-muted-foreground" : "text-foreground"
        )}>
          {result.message}
        </p>
        {!result.passed && result.action && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-primary">→</span> {result.action}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function ValidationCategory({
  categoryKey,
  results,
  onFieldClick,
}: {
  categoryKey: string;
  results: ValidationResult[];
  onFieldClick?: (field: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const config = CATEGORY_CONFIG[categoryKey];
  
  if (!config || results.length === 0) return null;

  const Icon = config.icon;
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between p-3 transition-colors",
          allPassed ? "bg-emerald-500/5" : "bg-destructive/5"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            allPassed ? "bg-emerald-500/10" : "bg-destructive/10"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              allPassed ? "text-emerald-500" : "text-destructive"
            )} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant={allPassed ? "default" : "destructive"} 
            className={cn(
              "text-xs",
              allPassed && "bg-emerald-500 hover:bg-emerald-600"
            )}
          >
            {passedCount}/{totalCount}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-2 space-y-1 bg-background">
              {results.map((result, idx) => (
                <ValidationItem 
                  key={`${categoryKey}-${idx}`} 
                  result={result} 
                  onFieldClick={onFieldClick}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DocumentValidationChecklist({
  validation,
  onFieldClick,
  className,
}: DocumentValidationChecklistProps) {
  const counts = getValidationCounts(validation);
  const ready = isDocumentReady(validation);
  const progressPercent = counts.total > 0 ? (counts.passed / counts.total) * 100 : 0;

  const categories = [
    { key: "companyIdentity", results: validation.companyIdentity },
    { key: "recipientInfo", results: validation.recipientInfo },
    { key: "roleCompensation", results: validation.roleCompensation },
    { key: "dateValidation", results: validation.dateValidation },
    { key: "legalCompliance", results: validation.legalCompliance },
    { key: "signatureConfig", results: validation.signatureConfig },
    { key: "formatting", results: validation.formatting },
  ].filter(c => c.results.length > 0);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Document Validation</h3>
        </div>
        <Badge 
          variant={ready ? "default" : "secondary"}
          className={cn(ready && "bg-emerald-500 hover:bg-emerald-600")}
        >
          {counts.passed}/{counts.total} checks passed
        </Badge>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <Progress 
          value={progressPercent} 
          className={cn(
            "h-2",
            ready && "[&>div]:bg-emerald-500"
          )}
        />
        <p className="text-xs text-muted-foreground text-center">
          {ready 
            ? "All validation checks passed"
            : `${counts.failed} issue${counts.failed !== 1 ? "s" : ""} need${counts.failed === 1 ? "s" : ""} attention`
          }
        </p>
      </div>

      {/* Status Banner */}
      {ready ? (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Sparkles className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Ready to Send
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              This document meets professional and legal standards
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Review Required
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Please address the issues below before sending
            </p>
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-2">
        {categories.map(({ key, results }) => (
          <ValidationCategory
            key={key}
            categoryKey={key}
            results={results}
            onFieldClick={onFieldClick}
          />
        ))}
      </div>
    </div>
  );
}

// Compact version for inline display
export function DocumentValidationSummary({
  validation,
  className,
}: {
  validation: DocumentValidation;
  className?: string;
}) {
  const counts = getValidationCounts(validation);
  const ready = isDocumentReady(validation);

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg",
      ready ? "bg-emerald-500/10" : "bg-amber-500/10",
      className
    )}>
      {ready ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-500" />
      )}
      <span className={cn(
        "text-sm",
        ready ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
      )}>
        {ready 
          ? "All checks passed"
          : `${counts.failed} issue${counts.failed !== 1 ? "s" : ""} to fix`
        }
      </span>
    </div>
  );
}
