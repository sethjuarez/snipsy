import { useState, useRef, useEffect } from "react";

interface VideoTimelineProps {
  videoSrc: string;
  onRangeSelect: (start: number, end: number) => void;
  initialStart?: number;
  initialEnd?: number;
}

function VideoTimeline({
  videoSrc,
  onRangeSelect,
  initialStart = 0,
  initialEnd,
}: VideoTimelineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd ?? 0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (!initialEnd) {
        setEndTime(video.duration);
        onRangeSelect(initialStart, video.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [videoSrc, initialStart, initialEnd, onRangeSelect]);

  const handleStartChange = (value: number) => {
    const clamped = Math.min(value, endTime - 0.1);
    setStartTime(clamped);
    onRangeSelect(clamped, endTime);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const handleEndChange = (value: number) => {
    const clamped = Math.max(value, startTime + 0.1);
    setEndTime(clamped);
    onRangeSelect(startTime, clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3" data-testid="video-timeline">
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full rounded border border-gray-200"
        data-testid="timeline-video"
      />

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 w-16">Start</label>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={startTime}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            className="flex-1"
            data-testid="timeline-start"
          />
          <span className="text-sm text-gray-500 w-12 text-right font-mono">
            {formatTime(startTime)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 w-16">End</label>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={endTime}
            onChange={(e) => handleEndChange(Number(e.target.value))}
            className="flex-1"
            data-testid="timeline-end"
          />
          <span className="text-sm text-gray-500 w-12 text-right font-mono">
            {formatTime(endTime)}
          </span>
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <span>Current: {formatTime(currentTime)}</span>
        <span>
          Selection: {formatTime(startTime)} – {formatTime(endTime)} (
          {formatTime(endTime - startTime)})
        </span>
      </div>
    </div>
  );
}

export default VideoTimeline;
