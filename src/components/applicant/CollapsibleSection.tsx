import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface CollapsibleSectionProps {
  sectionId: string;
  applicationId?: string;
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  sectionId,
  applicationId,
  title,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
  className,
}: CollapsibleSectionProps) {
  const storageKey = applicationId 
    ? `applicant_section_${sectionId}_${applicationId}` 
    : `applicant_section_${sectionId}`;

  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === "true" : defaultOpen;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(isOpen));
  }, [isOpen, storageKey]);

  return (
    <Card className={cn("bg-card border-border overflow-hidden", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-sm font-medium text-foreground">
                  {title}
                </CardTitle>
                {badge}
              </div>
              <ChevronDown 
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180"
                )} 
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default CollapsibleSection;
