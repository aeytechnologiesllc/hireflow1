import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";

interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  fileName?: string;
}

export function ImageLightbox({ open, onOpenChange, imageUrl, fileName }: ImageLightboxProps) {
  const isMobile = useIsMobile();
  
  const swipeProps = useSwipeGesture({
    onSwipeDown: () => onOpenChange(false),
  }, { threshold: 80 });

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "image";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      window.open(imageUrl, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 bg-background/95 backdrop-blur-sm border-border">
        <div className="relative pt-12">
          <div className="absolute top-2 left-2 z-10">
            <Button
              variant="secondary"
              size="icon"
              onClick={handleDownload}
              className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
          {isMobile ? (
            <motion.div
              {...swipeProps}
              className="touch-pan-y"
            >
              <img
                src={imageUrl}
                alt={fileName || "Image"}
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg pointer-events-none"
              />
            </motion.div>
          ) : (
            <img
              src={imageUrl}
              alt={fileName || "Image"}
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            />
          )}
          {isMobile && (
            <p className="text-center text-xs text-muted-foreground py-2">
              Swipe down to close
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
