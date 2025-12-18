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
          className="cursor-pointer group relative overflow-hidden rounded-xl shadow-sm"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={fileUrl}
            alt={fileName}
            className="w-full max-h-[240px] object-cover"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-white drop-shadow-md" />
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
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/60 border border-border/50">
      <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {fileName}
        </p>
        {fileSize && (
          <p className="text-[11px] text-muted-foreground">
            {formatFileSize(fileSize)}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleDownload}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
