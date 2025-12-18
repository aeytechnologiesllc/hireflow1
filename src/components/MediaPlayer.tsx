import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Loader2, AlertCircle, ExternalLink } from "lucide-react";

interface MediaPlayerProps {
  src: string;
  type?: "audio" | "video";
  className?: string;
}

export function MediaPlayer({ src, type = "audio", className }: MediaPlayerProps) {
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Force load on mount/src change
  useEffect(() => {
    if (mediaRef.current && src) {
      console.log("MediaPlayer: Loading src:", src);
      mediaRef.current.load();
    }
  }, [src]);

  // Loading timeout fallback - enable play button after 3s even if metadata not loaded
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isLoaded && !hasError) {
        console.log("MediaPlayer: Timeout fallback - enabling play button");
        setIsLoaded(true);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [isLoaded, hasError]);

  // Handle metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (mediaRef.current && !isLoaded) {
      const dur = mediaRef.current.duration;
      console.log("MediaPlayer: onLoadedMetadata - duration:", dur);
      if (isFinite(dur) && dur > 0) {
        setDuration(dur);
        setIsLoaded(true);
      }
    }
  }, [isLoaded]);

  // Backup: handle can play (more reliable for WebM)
  const handleCanPlay = useCallback(() => {
    if (mediaRef.current && !isLoaded) {
      const dur = mediaRef.current.duration;
      console.log("MediaPlayer: onCanPlay - duration:", dur);
      if (isFinite(dur) && dur > 0) {
        setDuration(dur);
        setIsLoaded(true);
      }
    }
  }, [isLoaded]);

  // Handle duration change (WebM files may update duration after initial load)
  const handleDurationChange = useCallback(() => {
    if (mediaRef.current) {
      const dur = mediaRef.current.duration;
      console.log("MediaPlayer: onDurationChange - duration:", dur);
      if (isFinite(dur) && dur > 0 && dur !== duration) {
        setDuration(dur);
        if (!isLoaded) setIsLoaded(true);
      }
    }
  }, [duration, isLoaded]);

  // Handle error
  const handleError = useCallback((e: React.SyntheticEvent<HTMLMediaElement, Event>) => {
    const error = e.currentTarget.error;
    console.error("MediaPlayer error:", error);
    setHasError(true);
    setErrorMessage(error?.message || "Failed to load media");
  }, []);

  // Handle time update - only update when playing and not seeking
  const handleTimeUpdate = useCallback(() => {
    if (mediaRef.current && isPlaying && !isSeeking) {
      setCurrentTime(mediaRef.current.currentTime);
    }
  }, [isPlaying, isSeeking]);

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (!mediaRef.current) return;
    
    if (isPlaying) {
      mediaRef.current.pause();
      setIsPlaying(false);
    } else {
      mediaRef.current.play().then(() => {
        // Duration may now be available after play starts
        const dur = mediaRef.current?.duration;
        if (dur && isFinite(dur) && dur > 0 && duration === 0) {
          console.log("MediaPlayer: Duration available on play:", dur);
          setDuration(dur);
        }
      }).catch(err => {
        console.error("MediaPlayer: Play failed:", err);
      });
      setIsPlaying(true);
    }
  }, [isPlaying, duration]);

  // Handle seeking via slider
  const handleSliderChange = useCallback((value: number[]) => {
    const newTime = value[0];
    setIsSeeking(true);
    setCurrentTime(newTime);
    
    if (mediaRef.current) {
      mediaRef.current.currentTime = newTime;
    }
  }, []);

  // Handle seek complete
  const handleSliderCommit = useCallback((value: number[]) => {
    const newTime = value[0];
    if (mediaRef.current) {
      mediaRef.current.currentTime = newTime;
    }
    // Small delay before re-enabling time updates
    setTimeout(() => setIsSeeking(false), 100);
  }, []);

  // Handle media ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (mediaRef.current) {
      mediaRef.current.currentTime = 0;
    }
  }, []);

  // Handle volume change
  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (mediaRef.current) {
      mediaRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (mediaRef.current) {
      if (isMuted) {
        mediaRef.current.volume = volume || 1;
        setIsMuted(false);
      } else {
        mediaRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  }, [isMuted, volume]);

  // Sync state on play/pause events from media element
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    media.addEventListener("play", handlePlay);
    media.addEventListener("pause", handlePause);

    return () => {
      media.removeEventListener("play", handlePlay);
      media.removeEventListener("pause", handlePause);
    };
  }, []);

  const MediaElement = type === "video" ? "video" : "audio";

  return (
    <div className={className}>
      {/* Hidden or visible media element */}
      <MediaElement
        ref={mediaRef as any}
        src={src}
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onLoadedData={handleCanPlay}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        className={type === "video" ? "w-full max-h-[200px] rounded-lg mb-3" : "hidden"}
      />

      {/* Error state */}
      {hasError && (
        <div className="flex flex-col items-center gap-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Could not load recording</span>
          </div>
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(src, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open in New Tab
          </Button>
        </div>
      )}

      {/* Custom controls - only show when no error */}
      {!hasError && (
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
        {/* Play/Pause button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          disabled={!isLoaded}
          className="h-10 w-10 shrink-0"
        >
          {!isLoaded ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>

        {/* Time display */}
        <span className="text-sm text-muted-foreground w-12 shrink-0">
          {formatTime(currentTime)}
        </span>

        {/* Progress slider */}
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
          disabled={!isLoaded}
          className="flex-1"
        />

        {/* Duration display */}
        <span className="text-sm text-muted-foreground w-12 shrink-0">
          {formatTime(duration)}
        </span>

        {/* Volume controls */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          className="h-8 w-8 shrink-0"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
        
        <Slider
          value={[isMuted ? 0 : volume]}
          max={1}
          step={0.1}
          onValueChange={handleVolumeChange}
          className="w-20"
        />
      </div>
      )}
    </div>
  );
}
