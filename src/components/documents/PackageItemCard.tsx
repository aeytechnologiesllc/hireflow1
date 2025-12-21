import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  FileText, 
  Upload, 
  Trash2,
  CheckCircle,
  Clock,
  FileCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PackageItem } from "@/hooks/useDocumentPackages";

interface PackageItemCardProps {
  item: PackageItem;
  onRemove?: () => void;
  canRemove?: boolean;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  nda: "NDA",
  employment_contract: "Employment Contract",
  background_check: "Background Check Authorization",
  non_compete: "Non-Compete Agreement",
  ip_assignment: "IP Assignment",
  custom: "Custom Document",
  drivers_license: "Driver's License",
  ssn_card: "Social Security Card",
  passport: "Passport",
  work_authorization: "Work Authorization",
  tax_form: "Tax Form",
  id_card: "Government ID",
  proof_of_address: "Proof of Address",
  bank_details: "Bank Details",
};

export function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

export function PackageItemCard({ item, onRemove, canRemove = true }: PackageItemCardProps) {
  const isDocument = item.type === "document";
  const Icon = isDocument ? FileText : Upload;
  
  const getStatusBadge = () => {
    switch (item.status) {
      case "signed":
        return (
          <Badge variant="default" className="bg-success text-success-foreground">
            <CheckCircle className="w-3 h-3 mr-1" />
            Signed
          </Badge>
        );
      case "submitted":
      case "reviewed":
      case "approved":
        return (
          <Badge variant="default" className="bg-success text-success-foreground">
            <FileCheck className="w-3 h-3 mr-1" />
            Uploaded
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card className={cn(
      "p-3 flex items-center justify-between gap-3",
      "border-border/50 bg-card/50"
    )}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          isDocument 
            ? "bg-primary/10 text-primary" 
            : "bg-warning/10 text-warning"
        )}>
          <Icon className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {item.name || getDocumentTypeLabel(item.document_type)}
          </p>
          <p className="text-xs text-muted-foreground">
            {isDocument ? "Document to Sign" : "Document to Upload"}
          </p>
        </div>

        {getStatusBadge()}
      </div>

      {canRemove && onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </Card>
  );
}
