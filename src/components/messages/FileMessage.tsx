import { useState } from "react";
import { FileText, Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "./ImageLightbox";
import { cn } from "@/lib/utils";

interface FileMessageProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  isMine: boolean;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(type);
}

export function FileMessage({ fileUrl, fileName, fileType, fileSize, isMine }: FileMessageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = isImageType(fileType);

  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      window.open(fileUrl, "_blank");
    }
  };

  if (isImage) {
    return (
      <>
        <div 
          className="cursor-pointer group relative"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-white" />
          </div>
        </div>
        <ImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          imageUrl={fileUrl}
          fileName={fileName}
        />
      </>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      isMine ? "bg-primary/10 border-primary/20" : "bg-secondary/50 border-border"
    )}>
      <div className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center",
        isMine ? "bg-primary/20" : "bg-secondary"
      )}>
        <FileText className={cn(
          "h-5 w-5",
          isMine ? "text-primary" : "text-muted-foreground"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isMine ? "text-primary-foreground" : "text-foreground"
        )}>
          {fileName}
        </p>
        {fileSize && (
          <p className="text-xs text-muted-foreground">
            {formatFileSize(fileSize)}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={handleDownload}
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
