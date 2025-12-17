import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";

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

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
      setIsLoaded(true);
    }
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
      mediaRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

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
        crossOrigin="anonymous"
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        className={type === "video" ? "w-full max-h-[200px] rounded-lg mb-3" : "hidden"}
      />

      {/* Custom controls */}
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
    </div>
  );
}
