import { forwardRef, useState, useRef, useCallback, useEffect, useMemo, useImperativeHandle } from "react";
import { Play, Pause, X, Keyboard, ChevronLeft, ChevronRight, Monitor, RefreshCw, MousePointerClick } from "lucide-react";
import { getBackend } from "../services";
import { isTauriRuntime, tauriFileSrc } from "../services/auditaur";
import SpotlightOverlay from "./SpotlightOverlay";
import { formatKeyCombo, validateHotkey, type HotkeyOwner } from "../utils/hotkeys";
import type { EndBehavior, ImportedVideo, MonitorInfo, PauseStop, RectanglePauseSpotlightRegion, VideoSnippet } from "../types";
import {
  DEFAULT_SPOTLIGHT_STYLE,
  STOP_EPSILON,
  createRectangleRegion,
  getVideoContentBox,
  normalizeHexColor,
  normalizePauseStops,
  normalizeSpotlight,
  pointerToVideoPoint,
  regionToBox,
  type Point,
} from "../utils/spotlight";

const backend = getBackend();
const MIN_SPOTLIGHT_REGION_SIZE = 2;
const SPOTLIGHT_COLOR_PRESETS = ["#facc15", "#38bdf8", "#34d399", "#fb7185", "#c084fc", "#fb923c"];

type SpotlightResizeHandle = "nw" | "ne" | "sw" | "se";
type PreviewNavigationStop =
  | { kind: "start"; time: number }
  | { kind: "pause"; time: number; pauseStop: PauseStop }
  | { kind: "end"; time: number };
type SpotlightManipulation =
  | {
      mode: "move";
      stopIndex: number;
      regionIndex: number;
      startPoint: Point;
      startRegion: RectanglePauseSpotlightRegion;
    }
  | {
      mode: "resize";
      stopIndex: number;
      regionIndex: number;
      handle: SpotlightResizeHandle;
      startPoint: Point;
      startRegion: RectanglePauseSpotlightRegion;
    };
type ClipInspectorTab = "clip" | "playback" | "moments";

// Hold-to-repeat: fires callback on mousedown, then repeats with acceleration.
// Uses a ref so the interval always calls the latest callback (avoids stale closures).
function useHoldRepeat(callback: () => void) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    stop();
    cbRef.current();
    // After 400ms delay, repeat every 80ms
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => cbRef.current(), 80);
    }, 400);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop };
}

function buildPreviewNavigationStops(
  stops: PauseStop[],
  startTime: number,
  endTime: number,
): PreviewNavigationStop[] {
  const pauseStops = normalizePauseStops(stops, startTime, endTime)
    .filter((stop) => stop.time > startTime + STOP_EPSILON && stop.time < endTime - STOP_EPSILON);

  return [
    { kind: "start", time: startTime },
    ...pauseStops.map((pauseStop): PreviewNavigationStop => ({
      kind: "pause",
      time: pauseStop.time,
      pauseStop,
    })),
    { kind: "end", time: endTime },
  ];
}

function isSamePreviewStop(a: PreviewNavigationStop, b: PreviewNavigationStop) {
  return a.kind === b.kind && Math.abs(a.time - b.time) <= STOP_EPSILON;
}

function getAdjacentPreviewStop(
  stops: PreviewNavigationStop[],
  currentTime: number,
  direction: -1 | 1,
  activeStop: PreviewNavigationStop | null,
) {
  if (stops.length === 0) return null;

  const activeIndex = activeStop
    ? stops.findIndex((stop) => isSamePreviewStop(stop, activeStop))
    : -1;
  if (activeIndex >= 0) {
    return stops[Math.max(0, Math.min(stops.length - 1, activeIndex + direction))] ?? null;
  }

  if (direction > 0) {
    return stops.find((stop) => stop.time > currentTime + STOP_EPSILON) ?? stops[stops.length - 1];
  }

  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index].time < currentTime - STOP_EPSILON) return stops[index];
  }
  return stops[0];
}

function getRemainingPreviewPauseStopsAfter(
  stops: PreviewNavigationStop[],
  time: number,
): PauseStop[] {
  return stops
    .filter((stop): stop is Extract<PreviewNavigationStop, { kind: "pause" }> =>
      stop.kind === "pause" && stop.time > time + STOP_EPSILON)
    .map((stop) => stop.pauseStop);
}

function getPreviewStopLabel(stop: PreviewNavigationStop | null) {
  if (!stop) return "";
  if (stop.kind === "start") return "clip start";
  if (stop.kind === "end") return "clip end";
  return stop.pauseStop.label || `pause at ${formatTime(stop.time, true)}`;
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

// Convert local file path to a URL the webview can load (only in Tauri context)
let convertFileSrc: ((path: string) => string) | null = null;
if (isTauriRuntime()) {
  convertFileSrc = tauriFileSrc;
}

interface ClipEditorProps {
  video: ImportedVideo;
  existingClip?: VideoSnippet;
  onSave: (clip: Omit<VideoSnippet, "id">) => void;
  onSaveStateChange?: (state: ClipEditorSaveState) => void;
  hotkeyOwners?: HotkeyOwner[];
}

export interface ClipEditorHandle {
  save: () => void;
}

export interface ClipEditorSaveState {
  canSave: boolean;
  readinessText: string;
  saveStatus: "idle" | "unsaved" | "saved";
}

function formatTime(seconds: number, precise = false): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (precise) {
    const ms = Math.floor((seconds % 1) * 100);
    return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  }
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(3));
}

function normalizeEditorRegion(region: RectanglePauseSpotlightRegion): RectanglePauseSpotlightRegion {
  const x = clampPercent(region.x);
  const y = clampPercent(region.y);
  const width = Math.min(100 - x, Math.max(MIN_SPOTLIGHT_REGION_SIZE, region.width));
  const height = Math.min(100 - y, Math.max(MIN_SPOTLIGHT_REGION_SIZE, region.height));
  return {
    type: "rectangle",
    x: roundPercent(x),
    y: roundPercent(y),
    width: roundPercent(width),
    height: roundPercent(height),
  };
}

function moveRegion(
  region: RectanglePauseSpotlightRegion,
  start: Point,
  current: Point,
): RectanglePauseSpotlightRegion {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return normalizeEditorRegion({
    ...region,
    x: Math.min(100 - region.width, Math.max(0, region.x + dx)),
    y: Math.min(100 - region.height, Math.max(0, region.y + dy)),
  });
}

function resizeRegion(
  region: RectanglePauseSpotlightRegion,
  start: Point,
  current: Point,
  handle: SpotlightResizeHandle,
): RectanglePauseSpotlightRegion {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  let left = region.x;
  let top = region.y;
  let right = region.x + region.width;
  let bottom = region.y + region.height;

  if (handle.includes("w")) left = clampPercent(left + dx);
  if (handle.includes("e")) right = clampPercent(right + dx);
  if (handle.includes("n")) top = clampPercent(top + dy);
  if (handle.includes("s")) bottom = clampPercent(bottom + dy);

  if (right - left < MIN_SPOTLIGHT_REGION_SIZE) {
    if (handle.includes("w")) left = right - MIN_SPOTLIGHT_REGION_SIZE;
    else right = left + MIN_SPOTLIGHT_REGION_SIZE;
  }
  if (bottom - top < MIN_SPOTLIGHT_REGION_SIZE) {
    if (handle.includes("n")) top = bottom - MIN_SPOTLIGHT_REGION_SIZE;
    else bottom = top + MIN_SPOTLIGHT_REGION_SIZE;
  }

  left = clampPercent(left);
  top = clampPercent(top);
  right = clampPercent(right);
  bottom = clampPercent(bottom);

  return normalizeEditorRegion({
    type: "rectangle",
    x: Math.min(left, right - MIN_SPOTLIGHT_REGION_SIZE),
    y: Math.min(top, bottom - MIN_SPOTLIGHT_REGION_SIZE),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  });
}

const ClipEditor = forwardRef<ClipEditorHandle, ClipEditorProps>(function ClipEditor(
  { video, existingClip, onSave, onSaveStateChange, hotkeyOwners = [] },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const previewStopsRef = useRef<PauseStop[]>([]);
  const spotlightManipulationCleanupRef = useRef<(() => void) | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(existingClip?.startTime ?? 0);
  const [endTime, setEndTime] = useState(existingClip?.endTime ?? 0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [activeHandle, setActiveHandle] = useState<"start" | "end">("start");
  const [frameDuration, setFrameDuration] = useState(1 / 30);
  const [targetDuration, setTargetDuration] = useState<string>("");

  // Derived: clip duration and computed speed
  const clipDuration = endTime - startTime;
  const targetSec = parseFloat(targetDuration);
  const computedSpeed = targetSec > 0 ? clipDuration / targetSec : 1;
  // Effective playback speed (target duration overrides 1× default)
  const effectiveSpeed = targetSec > 0 ? computedSpeed : 1;

  // Metadata fields
  const [title, setTitle] = useState(existingClip?.title ?? "");
  const [description, setDescription] = useState(existingClip?.description ?? "");
  const [hotkey, setHotkey] = useState(existingClip?.hotkey ?? "");
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [targetMonitor, setTargetMonitor] = useState(existingClip?.targetMonitor ?? "");
  const [endBehavior, setEndBehavior] = useState<EndBehavior>(existingClip?.endBehavior ?? "close");
  const [hideCursor, setHideCursor] = useState(existingClip?.hideCursor ?? true);
  const [backgroundColor, setBackgroundColor] = useState(existingClip?.backgroundColor ?? "#000000");
  const [clickToPlay, setClickToPlay] = useState(existingClip?.clickToPlay ?? false);
  const [muted, setMuted] = useState(existingClip?.muted !== false);
  const [pauseStops, setPauseStops] = useState<PauseStop[]>(existingClip?.pauseStops ?? []);
  const [activePreviewStop, setActivePreviewStop] = useState<PreviewNavigationStop | null>(null);
  const [editingSpotlightIndex, setEditingSpotlightIndex] = useState<number | null>(null);
  const [selectedSpotlightRegion, setSelectedSpotlightRegion] = useState<number | null>(null);
  const [drawingStart, setDrawingStart] = useState<Point | null>(null);
  const [draftRegion, setDraftRegion] = useState<RectanglePauseSpotlightRegion | null>(null);
  const [spotlightManipulation, setSpotlightManipulation] = useState<SpotlightManipulation | null>(null);
  const [monitorPreview, setMonitorPreview] = useState<string | null>(null);
  const [capturingPreview, setCapturingPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saved">("idle");
  const [inspectorTab, setInspectorTab] = useState<ClipInspectorTab>("clip");
  const hotkeyStatus = validateHotkey(hotkey, hotkeyOwners, existingClip?.id);

  const videoSrc = video.absolutePath && convertFileSrc
    ? convertFileSrc(video.absolutePath)
    : video.absolutePath;

  // Load available monitors
  useEffect(() => {
    backend.listMonitors()
      .then((mons) => {
        setMonitors(mons);
        if (!targetMonitor && mons.length > 0) setTargetMonitor(mons[0].name);
      })
      .catch(() => {});
  }, []);

  const capturePreview = useCallback((name: string) => {
    setCapturingPreview(true);
    backend.captureMonitorPreview(name)
      .then((b64) => setMonitorPreview(`data:image/jpeg;base64,${b64}`))
      .catch(() => setMonitorPreview(null))
      .finally(() => setCapturingPreview(false));
  }, []);

  // Detect FPS for frame-stepping
  useEffect(() => {
    if (video.absolutePath) {
      backend.getVideoFps(video.absolutePath)
        .then((fps) => { if (fps > 0) setFrameDuration(1 / fps); })
        .catch(() => {});
    }
  }, [video.absolutePath]);

  // Pre-compute target duration from existing clip speed
  useEffect(() => {
    if (existingClip && existingClip.speed !== 1) {
      const dur = existingClip.endTime - existingClip.startTime;
      setTargetDuration(Math.round(dur / existingClip.speed).toString());
    }
  }, [existingClip]);

  // Video event handlers
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onMeta = () => {
      setDuration(vid.duration);
      // Only default endTime to full duration for new clips
      if (!existingClip) setEndTime(vid.duration);
      // Seek to start of existing clip so it's visible
      if (existingClip) vid.currentTime = existingClip.startTime;
    };
    const onTime = () => {
      setCurrentTime(vid.currentTime);
      const nextStop = previewStopsRef.current[0];
      if (nextStop && vid.currentTime >= nextStop.time - STOP_EPSILON) {
        previewStopsRef.current = previewStopsRef.current.slice(1);
        vid.currentTime = nextStop.time;
        setCurrentTime(nextStop.time);
        vid.pause();
        setPlaying(false);
        setActivePreviewStop({ kind: "pause", time: nextStop.time, pauseStop: nextStop });
        return;
      }
      if (vid.currentTime >= endTime) {
        previewStopsRef.current = [];
        setActivePreviewStop(null);
        vid.pause();
        setPlaying(false);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    vid.addEventListener("loadedmetadata", onMeta);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    return () => {
      vid.removeEventListener("loadedmetadata", onMeta);
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
    };
  }, [endTime]);

  // Timeline drag handlers
  const getTimeFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const bar = timelineRef.current;
    if (!bar || duration <= 0) return null;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  }, [duration]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      const t = getTimeFromMouseEvent(e);
      if (t === null) return;
      if (dragging === "start") {
        const clamped = Math.min(t, endTime - 0.1);
        setStartTime(Math.max(0, clamped));
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, clamped);
      } else {
        const clamped = Math.max(t, startTime + 0.1);
        const val = Math.min(duration, clamped);
        setEndTime(val);
        if (videoRef.current) videoRef.current.currentTime = val;
      }
    };
    const onUp = () => setDragging(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, startTime, endTime, duration, getTimeFromMouseEvent]);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    const t = getTimeFromMouseEvent(e);
    if (t === null) return;
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  }, [getTimeFromMouseEvent]);

  const nudgeHandle = (handle: "start" | "end", direction: 1 | -1) => {
    const vid = videoRef.current;
    if (!vid || duration <= 0) return;
    // Pause so the seeked frame is visible
    if (!vid.paused) {
      vid.pause();
      setPlaying(false);
    }
    const step = frameDuration * direction;
    if (handle === "start") {
      const val = Math.max(0, Math.min(startTime + step, endTime - frameDuration));
      setStartTime(val);
      vid.currentTime = val;
      setCurrentTime(val);
    } else {
      const val = Math.min(duration, Math.max(endTime + step, startTime + frameDuration));
      setEndTime(val);
      vid.currentTime = val;
      setCurrentTime(val);
    }
  };

  const nudgePlayhead = (direction: 1 | -1) => {
    const vid = videoRef.current;
    if (!vid || endTime <= startTime) return;
    const minTime = startTime + frameDuration;
    const maxTime = endTime - frameDuration;
    if (minTime > maxTime) return;
    if (!vid.paused) {
      vid.pause();
      setPlaying(false);
    }
    const baseTime = Math.min(Math.max(currentTime, minTime), maxTime);
    const val = Math.min(maxTime, Math.max(minTime, baseTime + frameDuration * direction));
    vid.currentTime = val;
    setCurrentTime(val);
  };

  const setStartToPlayhead = () => {
    const val = Math.max(0, Math.min(currentTime, endTime - frameDuration));
    setStartTime(val);
    setActiveHandle("start");
  };

  const setEndToPlayhead = () => {
    const val = Math.min(duration, Math.max(currentTime, startTime + frameDuration));
    setEndTime(val);
    setActiveHandle("end");
  };

  const handleTimelineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudgeHandle(activeHandle, -1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nudgeHandle(activeHandle, 1);
    }
  };

  // Hold-to-repeat bindings for each frame-step button
  const holdStartBack = useHoldRepeat(() => { setActiveHandle("start"); nudgeHandle("start", -1); });
  const holdStartFwd  = useHoldRepeat(() => { setActiveHandle("start"); nudgeHandle("start", 1); });
  const holdEndBack   = useHoldRepeat(() => { setActiveHandle("end"); nudgeHandle("end", -1); });
  const holdEndFwd    = useHoldRepeat(() => { setActiveHandle("end"); nudgeHandle("end", 1); });
  const holdPlayheadBack = useHoldRepeat(() => nudgePlayhead(-1));
  const holdPlayheadFwd = useHoldRepeat(() => nudgePlayhead(1));
  const previewNavigationStops = useMemo(
    () => buildPreviewNavigationStops(pauseStops, startTime, endTime),
    [pauseStops, startTime, endTime],
  );

  const handlePreview = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (activePreviewStop) {
      setActivePreviewStop(null);
      previewStopsRef.current = getRemainingPreviewPauseStopsAfter(previewNavigationStops, activePreviewStop.time);
      vid.playbackRate = effectiveSpeed;
      vid.play();
    } else if (playing) {
      previewStopsRef.current = [];
      vid.pause();
    } else {
      previewStopsRef.current = getRemainingPreviewPauseStopsAfter(previewNavigationStops, startTime);
      setActivePreviewStop(null);
      vid.currentTime = startTime;
      vid.playbackRate = effectiveSpeed;
      vid.play();
    }
  }, [activePreviewStop, playing, previewNavigationStops, startTime, effectiveSpeed]);

  const jumpToPreviewStop = useCallback((direction: -1 | 1) => {
    if (!playing && !activePreviewStop) return;
    const vid = videoRef.current;
    if (!vid) return;

    const targetStop = getAdjacentPreviewStop(
      previewNavigationStops,
      currentTime,
      direction,
      activePreviewStop,
    );
    if (!targetStop) return;

    vid.pause();
    vid.currentTime = targetStop.time;
    previewStopsRef.current = getRemainingPreviewPauseStopsAfter(previewNavigationStops, targetStop.time);
    setCurrentTime(targetStop.time);
    setPlaying(false);
    setActivePreviewStop(targetStop);
  }, [activePreviewStop, currentTime, playing, previewNavigationStops]);

  const addPauseStop = useCallback(() => {
    const time = Math.min(Math.max(currentTime, startTime + frameDuration), endTime - frameDuration);
    if (!Number.isFinite(time) || time <= startTime || time >= endTime) return;
    setPauseStops((stops) => normalizePauseStops([...stops, { time }], startTime, endTime));
    setInspectorTab("moments");
  }, [currentTime, startTime, endTime, frameDuration]);

  const updatePauseStop = (index: number, field: "time" | "label", value: string | number) => {
    setPauseStops((stops) => {
      const updated = [...stops];
      updated[index] = {
        ...updated[index],
        [field]: field === "time" ? Number(value) : value,
      };
      return updated;
    });
  };

  const removePauseStop = (index: number) => {
    setPauseStops((stops) => stops.filter((_, i) => i !== index));
    if (editingSpotlightIndex === index) {
      setEditingSpotlightIndex(null);
      setSelectedSpotlightRegion(null);
    }
  };

  const startSpotlightEdit = (index: number) => {
    const stop = pauseStops[index];
    if (!stop) return;
    const vid = videoRef.current;
    if (vid) {
      vid.pause();
      vid.currentTime = stop.time;
      setCurrentTime(stop.time);
      setPlaying(false);
    }
    setEditingSpotlightIndex(index);
    setInspectorTab("moments");
    setSelectedSpotlightRegion(stop.spotlight?.regions.length ? 0 : null);
    setDrawingStart(null);
    setDraftRegion(null);
  };

  const finishSpotlightEdit = () => {
    setEditingSpotlightIndex(null);
    setSelectedSpotlightRegion(null);
    setDrawingStart(null);
    setDraftRegion(null);
    setSpotlightManipulation(null);
    setInspectorTab("moments");
  };

  const removeSpotlight = (index: number) => {
    setPauseStops((stops) => {
      const updated = [...stops];
      const stop = updated[index];
      if (!stop) return stops;
      updated[index] = { ...stop, spotlight: undefined };
      return updated;
    });
    finishSpotlightEdit();
  };

  const setSpotlightLabelVisible = (index: number, showLabel: boolean) => {
    setPauseStops((stops) => {
      const updated = [...stops];
      const stop = updated[index];
      if (!stop?.spotlight) return stops;
      updated[index] = {
        ...stop,
        spotlight: normalizeSpotlight({
          ...stop.spotlight,
          showLabel,
        }),
      };
      return updated;
    });
  };

  const setSpotlightColor = (index: number, color: string) => {
    const borderColor = normalizeHexColor(color);
    if (!borderColor) return;
    setPauseStops((stops) => {
      const updated = [...stops];
      const stop = updated[index];
      if (!stop?.spotlight) return stops;
      updated[index] = {
        ...stop,
        spotlight: normalizeSpotlight({
          ...stop.spotlight,
          style: {
            ...stop.spotlight.style,
            borderColor,
          },
        }),
      };
      return updated;
    });
  };

  const deleteSelectedSpotlightRegion = () => {
    if (editingSpotlightIndex === null || selectedSpotlightRegion === null) return;
    setPauseStops((stops) => {
      const updated = [...stops];
      const stop = updated[editingSpotlightIndex];
      const regions = stop?.spotlight?.regions;
      if (!stop || !regions) return stops;
      const nextRegions = regions.filter((_, index) => index !== selectedSpotlightRegion);
      updated[editingSpotlightIndex] = {
        ...stop,
        spotlight: normalizeSpotlight({
          regions: nextRegions,
          showLabel: stop.spotlight?.showLabel,
          style: stop.spotlight?.style,
        }),
      };
      return updated;
    });
    setSelectedSpotlightRegion(null);
  };

  const updateSpotlightRegion = (
    stopIndex: number,
    regionIndex: number,
    region: RectanglePauseSpotlightRegion,
  ) => {
    setPauseStops((stops) => {
      const updated = [...stops];
      const stop = updated[stopIndex];
      const spotlight = stop?.spotlight;
      if (!stop || !spotlight?.regions[regionIndex]) return stops;
      const regions = [...spotlight.regions];
      regions[regionIndex] = region;
      updated[stopIndex] = {
        ...stop,
        spotlight: normalizeSpotlight({
          regions,
          showLabel: spotlight.showLabel,
          style: spotlight.style,
        }),
      };
      return updated;
    });
  };

  const startSpotlightManipulation = (manipulation: SpotlightManipulation) => {
    spotlightManipulationCleanupRef.current?.();
    setSpotlightManipulation(manipulation);

    const onMove = (e: MouseEvent) => {
      const vid = videoRef.current;
      if (!vid) return;
      const point = pointerToVideoPoint(vid, e.clientX, e.clientY);
      const region = manipulation.mode === "move"
        ? moveRegion(manipulation.startRegion, manipulation.startPoint, point)
        : resizeRegion(
          manipulation.startRegion,
          manipulation.startPoint,
          point,
          manipulation.handle,
        );
      updateSpotlightRegion(manipulation.stopIndex, manipulation.regionIndex, region);
    };
    const onUp = () => {
      spotlightManipulationCleanupRef.current?.();
      spotlightManipulationCleanupRef.current = null;
      setSpotlightManipulation(null);
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    spotlightManipulationCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginSpotlightMove = (regionIndex: number, e: React.MouseEvent) => {
    if (editingSpotlightIndex === null || !videoRef.current) return;
    const region = pauseStops[editingSpotlightIndex]?.spotlight?.regions[regionIndex];
    if (!region || region.type !== "rectangle") return;
    e.preventDefault();
    setSelectedSpotlightRegion(regionIndex);
    startSpotlightManipulation({
      mode: "move",
      stopIndex: editingSpotlightIndex,
      regionIndex,
      startPoint: pointerToVideoPoint(videoRef.current, e.clientX, e.clientY),
      startRegion: region,
    });
  };

  const beginSpotlightResize = (
    regionIndex: number,
    handle: SpotlightResizeHandle,
    e: React.MouseEvent,
  ) => {
    if (editingSpotlightIndex === null || !videoRef.current) return;
    const region = pauseStops[editingSpotlightIndex]?.spotlight?.regions[regionIndex];
    if (!region || region.type !== "rectangle") return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedSpotlightRegion(regionIndex);
    startSpotlightManipulation({
      mode: "resize",
      stopIndex: editingSpotlightIndex,
      regionIndex,
      handle,
      startPoint: pointerToVideoPoint(videoRef.current, e.clientX, e.clientY),
      startRegion: region,
    });
  };

  const beginSpotlightDraw = (e: React.MouseEvent) => {
    if (editingSpotlightIndex === null || !videoRef.current || spotlightManipulation) return;
    if ((e.target as HTMLElement | null)?.closest("[data-spotlight-editor-interactive='true']")) return;
    e.preventDefault();
    setSelectedSpotlightRegion(null);
    setDrawingStart(pointerToVideoPoint(videoRef.current, e.clientX, e.clientY));
    setDraftRegion(null);
  };

  useEffect(() => {
    if (!drawingStart || editingSpotlightIndex === null) return;

    const onMove = (e: MouseEvent) => {
      const vid = videoRef.current;
      if (!vid) return;
      const point = pointerToVideoPoint(vid, e.clientX, e.clientY);
      setDraftRegion(createRectangleRegion(drawingStart, point));
    };
    const onUp = (e: MouseEvent) => {
      const vid = videoRef.current;
      if (!vid) return;
      const point = pointerToVideoPoint(vid, e.clientX, e.clientY);
      const region = createRectangleRegion(drawingStart, point);
      if (region) {
        setPauseStops((stops) => {
          const updated = [...stops];
          const stop = updated[editingSpotlightIndex];
          if (!stop) return stops;
          const regions = [...(stop.spotlight?.regions ?? []), region];
          updated[editingSpotlightIndex] = {
            ...stop,
            spotlight: normalizeSpotlight({
              regions,
              showLabel: stop.spotlight?.showLabel,
              style: stop.spotlight?.style,
            }),
          };
          setSelectedSpotlightRegion(regions.length - 1);
          return updated;
        });
      }
      setDrawingStart(null);
      setDraftRegion(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drawingStart, editingSpotlightIndex]);

  useEffect(() => () => spotlightManipulationCleanupRef.current?.(), []);

  const handleHotkeyCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = formatKeyCombo(e.nativeEvent);
    if (combo.includes("+") && !combo.endsWith("+")) {
      setHotkey(combo);
      setCapturingHotkey(false);
    }
  };

  const buildClipDraft = (): Omit<VideoSnippet, "id"> | null => {
    if (!title.trim() || hotkeyStatus.state !== "available" || endTime <= startTime) return null;
    const normalizedPauseStops = normalizePauseStops(pauseStops, startTime, endTime);
    return {
      title: title.trim(),
      description: description.trim(),
      videoFile: video.relativePath,
      startTime,
      endTime,
      speed: effectiveSpeed,
      hotkey,
      targetMonitor: targetMonitor || undefined,
      endBehavior,
      hideCursor,
      backgroundColor,
      clickToPlay,
      muted,
      pauseStops: normalizedPauseStops.length > 0 ? normalizedPauseStops : undefined,
    };
  };

  const handleSave = () => {
    const clip = buildClipDraft();
    if (!clip) return;
    onSave(clip);
    setSaveStatus("saved");
  };

  const canSave = Boolean(title.trim()) && hotkeyStatus.state === "available" && endTime > startTime;

  useEffect(() => {
    if (saveStatus === "saved") setSaveStatus("unsaved");
  }, [
    title,
    description,
    startTime,
    endTime,
    effectiveSpeed,
    hotkey,
    targetMonitor,
    endBehavior,
    hideCursor,
    backgroundColor,
    clickToPlay,
    muted,
    pauseStops,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s" || capturingHotkey) return;
      event.preventDefault();
      handleSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (capturingHotkey || (!playing && !activePreviewStop) || isEditableKeyboardTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        jumpToPreviewStop(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        jumpToPreviewStop(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePreviewStop, capturingHotkey, jumpToPreviewStop, playing]);

  const selectionLeft = duration > 0 ? (startTime / duration) * 100 : 0;
  const selectionWidth = duration > 0 ? ((endTime - startTime) / duration) * 100 : 100;
  const playheadPos = duration > 0 ? (currentTime / duration) * 100 : 0;
  const handleW = 8;
  const playheadMinTime = startTime + frameDuration;
  const playheadMaxTime = endTime - frameDuration;
  const canStepPlayhead = playheadMinTime <= playheadMaxTime;
  const canStepPlayheadBack = canStepPlayhead && currentTime > playheadMinTime;
  const canStepPlayheadFwd = canStepPlayhead && currentTime < playheadMaxTime;
  const editingSpotlightStop = editingSpotlightIndex !== null ? pauseStops[editingSpotlightIndex] : null;
  const editingSpotlight = editingSpotlightStop?.spotlight;
  const editingSpotlightColor =
    normalizeHexColor(editingSpotlight?.style?.borderColor) ?? DEFAULT_SPOTLIGHT_STYLE.borderColor;
  const videoContentBox = videoRef.current ? getVideoContentBox(videoRef.current) : null;
  const draftBox = draftRegion && videoContentBox ? regionToBox(draftRegion, videoContentBox) : null;
  const selectedSpotlightRegionData =
    selectedSpotlightRegion !== null ? editingSpotlight?.regions[selectedSpotlightRegion] : null;
  const selectedSpotlightRegionBox =
    selectedSpotlightRegionData && videoContentBox
      ? regionToBox(selectedSpotlightRegionData, videoContentBox)
      : null;
  const isPreviewActive = playing || activePreviewStop !== null;
  const previousPreviewStop = isPreviewActive
    ? getAdjacentPreviewStop(previewNavigationStops, currentTime, -1, activePreviewStop)
    : null;
  const nextPreviewStop = isPreviewActive
    ? getAdjacentPreviewStop(previewNavigationStops, currentTime, 1, activePreviewStop)
    : null;
  const canJumpPreviewBack =
    Boolean(previousPreviewStop) &&
    (activePreviewStop
      ? !isSamePreviewStop(previousPreviewStop!, activePreviewStop)
      : Math.abs(previousPreviewStop!.time - currentTime) > STOP_EPSILON);
  const canJumpPreviewForward =
    Boolean(nextPreviewStop) &&
    (activePreviewStop
      ? !isSamePreviewStop(nextPreviewStop!, activePreviewStop)
      : Math.abs(nextPreviewStop!.time - currentTime) > STOP_EPSILON);
  const readinessItems = [
    { label: "Name", ready: Boolean(title.trim()) },
    { label: "Hotkey", ready: hotkeyStatus.state === "available" },
    { label: "Range", ready: endTime > startTime },
  ];
  const inspectorTabs: Array<{ id: ClipInspectorTab; label: string; badge?: string }> = [
    { id: "clip", label: "Clip" },
    { id: "playback", label: "Playback" },
    { id: "moments", label: "Moments", badge: String(pauseStops.length) },
  ];
  const missingReadinessLabels = readinessItems.filter((item) => !item.ready).map((item) => item.label);
  const readinessText = canSave ? "Ready" : `Needs ${missingReadinessLabels.join(", ")}`;

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

  useEffect(() => {
    onSaveStateChange?.({ canSave, readinessText, saveStatus });
  }, [canSave, onSaveStateChange, readinessText, saveStatus]);

  return (
    <div
      className="flex flex-col h-full"
      data-testid="clip-editor"
      data-preview-pause-active={activePreviewStop ? "true" : "false"}
      data-preview-stop-kind={activePreviewStop?.kind ?? "none"}
    >
      <div className="flex flex-1 min-h-0 gap-3">
      {/* Video — fills all available space */}
      <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden" style={{ backgroundColor: "var(--color-surface)" }}>
        <video
          ref={videoRef}
          src={videoSrc}
          preload="auto"
          className="w-full h-full object-contain"
          data-testid="clip-editor-video"
        />
        {editingSpotlightIndex === null && activePreviewStop?.kind === "pause" && activePreviewStop.pauseStop.spotlight && videoContentBox && (
          <SpotlightOverlay
            spotlight={activePreviewStop.pauseStop.spotlight}
            contentBox={videoContentBox}
            label={activePreviewStop.pauseStop.label}
            testIdPrefix="preview-spotlight"
          />
        )}
        {editingSpotlightIndex !== null && videoContentBox && (
          <div
            className="absolute inset-0 cursor-crosshair"
            onMouseDown={beginSpotlightDraw}
            data-testid="spotlight-editor-surface"
          >
            {editingSpotlightStop?.spotlight && (
              <SpotlightOverlay
                spotlight={editingSpotlightStop.spotlight}
                contentBox={videoContentBox}
                label={editingSpotlightStop.label}
                selectedRegionIndex={selectedSpotlightRegion}
                onRegionClick={setSelectedSpotlightRegion}
                onRegionMouseDown={beginSpotlightMove}
                showOutsideEffect={false}
                testIdPrefix="editor-spotlight"
              />
            )}
            {selectedSpotlightRegion !== null && selectedSpotlightRegionBox && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: selectedSpotlightRegionBox.left,
                  top: selectedSpotlightRegionBox.top,
                  width: selectedSpotlightRegionBox.width,
                  height: selectedSpotlightRegionBox.height,
                  zIndex: 45,
                }}
              >
                {[
                  { handle: "nw", left: 0, top: 0, cursor: "nwse-resize" },
                  { handle: "ne", left: "100%", top: 0, cursor: "nesw-resize" },
                  { handle: "sw", left: 0, top: "100%", cursor: "nesw-resize" },
                  { handle: "se", left: "100%", top: "100%", cursor: "nwse-resize" },
                ].map(({ handle, left, top, cursor }) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={`Resize spotlight ${handle}`}
                    data-spotlight-editor-interactive="true"
                    data-testid={`editor-spotlight-resize-${handle}-${selectedSpotlightRegion}`}
                    className="absolute h-3 w-3 rounded-full border-2 border-white bg-yellow-300 shadow pointer-events-auto"
                    style={{
                      left,
                      top,
                      minWidth: 12,
                      minHeight: 12,
                      padding: 0,
                      transform: "translate(-50%, -50%)",
                      cursor,
                    }}
                    onMouseDown={(event) =>
                      beginSpotlightResize(
                        selectedSpotlightRegion,
                        handle as SpotlightResizeHandle,
                        event,
                      )
                    }
                  />
                ))}
              </div>
            )}
            {draftBox && (
              <div
                className="absolute rounded-[10px] pointer-events-none"
                style={{
                  left: draftBox.left,
                  top: draftBox.top,
                  width: draftBox.width,
                  height: draftBox.height,
                  border: `${DEFAULT_SPOTLIGHT_STYLE.borderWidth}px dashed ${DEFAULT_SPOTLIGHT_STYLE.borderColor}`,
                  boxShadow: `0 0 18px ${DEFAULT_SPOTLIGHT_STYLE.borderColor}`,
                  zIndex: 40,
                }}
                data-testid="editor-spotlight-draft"
              />
            )}
            <div
              className="absolute left-2 right-2 top-2 flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded text-xs"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
                zIndex: 50,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span className="mr-1 font-medium">
                {editingSpotlightStop?.label
                  ? `Spotlight: ${editingSpotlightStop.label}`
                  : `Spotlight at ${formatTime(editingSpotlightStop?.time ?? currentTime, true)}`}
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                {selectedSpotlightRegion === null ? "Draw a rectangle" : "Drag to move or resize"}
              </span>
              {editingSpotlight && editingSpotlight.regions.length > 1 && (
                <div
                  className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5"
                  style={{ backgroundColor: "var(--color-surface-inset)" }}
                  data-testid="spotlight-region-tabs"
                >
                  <span style={{ color: "var(--color-text-secondary)" }}>Regions</span>
                  {editingSpotlight.regions.map((_, regionIndex) => (
                    <button
                      key={regionIndex}
                      type="button"
                      className="min-w-5 rounded px-1 py-0.5"
                      style={{
                        backgroundColor:
                          selectedSpotlightRegion === regionIndex ? "var(--color-accent)" : "transparent",
                        color:
                          selectedSpotlightRegion === regionIndex
                            ? "var(--color-text-on-accent)"
                            : "var(--color-text)",
                      }}
                      onClick={() => setSelectedSpotlightRegion(regionIndex)}
                      data-testid={`spotlight-region-tab-${regionIndex}`}
                    >
                      {regionIndex + 1}
                    </button>
                  ))}
                </div>
              )}
              {editingSpotlight && (
                <>
                  <label
                    className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded"
                    style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
                    title="Shared by all spotlight regions for this pause stop"
                  >
                    Color
                    <input
                      type="color"
                      value={editingSpotlightColor}
                      onChange={(e) => setSpotlightColor(editingSpotlightIndex, e.target.value)}
                      className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      data-testid="spotlight-color"
                    />
                  </label>
                  <div className="flex items-center gap-1">
                    {SPOTLIGHT_COLOR_PRESETS.map((color, presetIndex) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Use spotlight color ${color}`}
                        className="h-5 w-5 rounded-full border"
                        style={{
                          minWidth: 20,
                          minHeight: 20,
                          backgroundColor: color,
                          borderColor: editingSpotlightColor === color ? "var(--color-text)" : "rgba(255,255,255,0.65)",
                          boxShadow: editingSpotlightColor === color ? `0 0 10px ${color}` : undefined,
                        }}
                        onClick={() => setSpotlightColor(editingSpotlightIndex, color)}
                        data-testid={`spotlight-color-preset-${presetIndex}`}
                      />
                    ))}
                  </div>
                  <label
                    className="flex items-center gap-1 px-2 py-0.5 rounded"
                    style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
                  >
                    <input
                      type="checkbox"
                      checked={editingSpotlight.showLabel !== false}
                      onChange={(e) => setSpotlightLabelVisible(editingSpotlightIndex, e.target.checked)}
                      className="accent-[var(--color-accent)]"
                      data-testid="spotlight-show-label"
                    />
                    Show label
                  </label>
                </>
              )}
              <button
                type="button"
                className="px-2 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
                onClick={() => setSelectedSpotlightRegion(null)}
                data-testid="spotlight-add-region"
              >
                Add region
              </button>
              <button
                type="button"
                className="px-2 py-0.5 rounded disabled:opacity-50"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)" }}
                disabled={selectedSpotlightRegion === null}
                onClick={deleteSelectedSpotlightRegion}
                data-testid="spotlight-delete-region"
              >
                Delete region
              </button>
              <button
                type="button"
                className="px-2 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" }}
                onClick={finishSpotlightEdit}
                data-testid="spotlight-done"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <aside
        className="w-88 shrink-0 rounded-lg p-3 overflow-y-auto"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        data-testid="clip-inspector"
      >
        <div className="space-y-4">
          <div
            className="grid gap-1 rounded-lg p-1"
            style={{
              backgroundColor: "var(--color-surface-inset)",
              gridTemplateColumns: `repeat(${inspectorTabs.length}, minmax(0, 1fr))`,
            }}
            role="tablist"
            aria-label="Clip inspector sections"
            data-testid="clip-inspector-tabs"
          >
            {inspectorTabs.map((tab) => {
              const active = inspectorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setInspectorTab(tab.id)}
                  className="flex min-w-0 items-center justify-center gap-1 rounded px-1.5 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: active ? "var(--color-accent)" : "transparent",
                    color: active ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
                  }}
                  data-testid={`clip-inspector-tab-${tab.id}`}
                >
                  <span className="truncate">{tab.label}</span>
                  {tab.badge && (
                    <span
                      className="shrink-0 rounded-full px-1.5 text-xs leading-4"
                      style={{
                        backgroundColor: active ? "color-mix(in srgb, var(--color-text-on-accent) 20%, transparent)" : "var(--color-surface)",
                        color: active ? "var(--color-text-on-accent)" : "var(--color-text-secondary)",
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {inspectorTab === "clip" && (
          <section className="space-y-2" data-testid="clip-details-section">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Clip details</h3>
            <div>
              <label htmlFor="clip-title" className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Name</label>
              <input
                id="clip-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Clip name"
                className="w-full px-2.5 py-1.5 rounded text-base"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                data-testid="clip-title"
              />
            </div>
            <div>
              <label htmlFor="clip-description" className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
              <input
                id="clip-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context"
                className="w-full px-2.5 py-1.5 rounded text-base"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                data-testid="clip-description"
              />
            </div>
            <div>
              <label htmlFor="clip-hotkey" className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Hotkey</label>
              <div className="flex items-center gap-1.5">
                <Keyboard size={12} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                <input
                  id="clip-hotkey"
                  type="text"
                  value={capturingHotkey ? "Press a key combo..." : hotkey}
                  readOnly
                  onFocus={() => setCapturingHotkey(true)}
                  onBlur={() => setCapturingHotkey(false)}
                  onKeyDown={handleHotkeyCapture}
                  placeholder="Click to capture hotkey"
                  className="w-full px-2 py-1.5 rounded font-mono text-base"
                  style={capturingHotkey
                    ? { backgroundColor: "var(--color-surface-inset)", border: "2px solid var(--color-accent)", color: "var(--color-text)" }
                    : { backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)", color: hotkey ? "var(--color-text)" : "var(--color-text-secondary)" }}
                  aria-describedby="clip-hotkey-status"
                  data-testid="clip-hotkey"
                />
              </div>
              <p
                id="clip-hotkey-status"
                className="mt-1 text-xs"
                style={{ color: hotkeyStatus.state === "available" ? "var(--color-success)" : hotkeyStatus.state === "empty" ? "var(--color-text-secondary)" : "var(--color-danger)" }}
                data-testid="clip-hotkey-status"
              >
                {hotkeyStatus.message}
              </p>
            </div>
          </section>
          )}

          {inspectorTab === "playback" && (
          <section className="space-y-2" data-testid="clip-playback-settings">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Playback settings</h3>
            {monitors.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="clip-monitor" className="block text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Target monitor</label>
                <div className="flex items-center gap-1.5">
                  {monitorPreview && (
                    <img
                      src={monitorPreview}
                      alt="Monitor preview"
                      className="h-8 rounded border"
                      style={{ borderColor: "var(--color-border)" }}
                      data-testid="monitor-preview"
                    />
                  )}
                  <Monitor size={12} style={{ color: "var(--color-text-secondary)" }} />
                  <select
                    id="clip-monitor"
                    value={targetMonitor}
                    onChange={(e) => {
                      setTargetMonitor(e.target.value);
                      setMonitorPreview(null);
                    }}
                    className="min-w-0 flex-1 px-2 py-1 rounded text-sm"
                    style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                    data-testid="clip-monitor"
                  >
                    {monitors.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.width}×{m.height})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => capturePreview(targetMonitor)}
                    disabled={capturingPreview}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded"
                    style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
                    title="Capture monitor preview"
                    aria-label="Capture monitor preview"
                    data-testid="monitor-refresh"
                  >
                    <RefreshCw size={11} className={capturingPreview ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>
            )}
            <div>
              <label htmlFor="clip-end-behavior" className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>When done</label>
              <select
                id="clip-end-behavior"
                value={endBehavior}
                onChange={(e) => setEndBehavior(e.target.value as EndBehavior)}
                className="w-full px-2 py-1 rounded text-sm"
                style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                data-testid="clip-end-behavior"
              >
                <option value="close">Close window</option>
                <option value="freeze">Freeze last frame</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={hideCursor} onChange={(e) => setHideCursor(e.target.checked)} className="accent-[var(--color-accent)]" data-testid="clip-hide-cursor" />
                Hide cursor
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={clickToPlay} onChange={(e) => setClickToPlay(e.target.checked)} className="accent-[var(--color-accent)]" data-testid="clip-click-to-play" />
                Click to play
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="accent-[var(--color-accent)]" data-testid="clip-muted" />
                Mute audio
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--color-text-secondary)" }}>
                Background
                <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-7 h-6 rounded cursor-pointer border-0 p-0" title="Letterbox / background color for playback" data-testid="clip-background-color" />
              </label>
            </div>
          </section>
          )}

          {inspectorTab === "moments" && (
          <section data-testid="pause-stops-panel">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Moments</h3>
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {pauseStops.length} moment{pauseStops.length === 1 ? "" : "s"}
              </span>
            </div>
            {pauseStops.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }} data-testid="pause-stops-empty">
                Move the playhead inside the clip and add a moment.
              </p>
            ) : (
              <div className="space-y-2" data-testid="pause-stops-list">
                {pauseStops.map((stop, index) => (
                  <div
                    key={`${stop.time}-${index}`}
                    className="space-y-2 rounded p-2"
                    style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
                    data-testid={`pause-stop-${index}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={Number(stop.time.toFixed(3))}
                        min={startTime}
                        max={endTime}
                        step={frameDuration}
                        onChange={(e) => updatePauseStop(index, "time", Number(e.target.value))}
                        className="w-20 px-1 py-0.5 rounded text-sm font-mono"
                        style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                        aria-label={`Pause stop ${index + 1} time`}
                        data-testid={`pause-stop-time-${index}`}
                      />
                      <button
                        onClick={() => {
                          const vid = videoRef.current;
                          if (vid) vid.currentTime = stop.time;
                          setCurrentTime(stop.time);
                        }}
                        className="px-2 py-0.5 rounded text-sm"
                        style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                        data-testid={`pause-stop-seek-${index}`}
                      >
                        Go
                      </button>
                      <button
                        onClick={() => removePauseStop(index)}
                        className="ml-auto px-1 text-sm"
                        style={{ color: "var(--color-danger)" }}
                        aria-label={`Remove pause stop ${index + 1}`}
                        data-testid={`remove-pause-stop-${index}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={stop.label ?? ""}
                      onChange={(e) => updatePauseStop(index, "label", e.target.value)}
                      placeholder="Label"
                      className="w-full px-1 py-0.5 rounded text-sm"
                      style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                      data-testid={`pause-stop-label-${index}`}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startSpotlightEdit(index)}
                        className="flex-1 px-2 py-0.5 rounded text-sm"
                        style={{
                          color: stop.spotlight ? "var(--color-text-on-accent)" : "var(--color-text)",
                          backgroundColor: stop.spotlight ? "var(--color-accent)" : "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                        }}
                        data-testid={`pause-stop-spotlight-${index}`}
                      >
                        {stop.spotlight ? `Edit spotlight (${stop.spotlight.regions.length})` : "Add spotlight"}
                      </button>
                      {stop.spotlight && (
                        <button
                          onClick={() => removeSpotlight(index)}
                          className="px-1 text-sm"
                          style={{ color: "var(--color-danger)" }}
                          aria-label={`Remove spotlight ${index + 1}`}
                          data-testid={`remove-spotlight-${index}`}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}

        </div>
      </aside>
      </div>

      {/* Controls below video */}
      <div className="shrink-0 mt-3 space-y-2.5">
        {/* Timeline with frame-step buttons */}
        <div className="flex items-center gap-1.5">
          {/* Start frame-step buttons */}
          <button
            {...holdStartBack}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="Start − 1 frame"
            aria-label="Start − 1 frame"
            data-testid="frame-back-start"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            {...holdStartFwd}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="Start + 1 frame"
            aria-label="Start + 1 frame"
            data-testid="frame-fwd-start"
          >
            <ChevronRight size={12} />
          </button>

          {/* Timeline bar */}
          <div
            ref={timelineRef}
            tabIndex={0}
            className="relative flex-1 h-7 rounded cursor-pointer select-none outline-none"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            onClick={handleTimelineClick}
            onKeyDown={handleTimelineKeyDown}
          >
          {/* Selection region */}
          <div
            className="absolute top-0 bottom-0 rounded"
            style={{
              left: `${selectionLeft}%`,
              width: `${selectionWidth}%`,
              backgroundColor: "var(--color-accent)",
              opacity: 0.25,
            }}
          />
          {/* Playhead */}
          <div
            className="absolute bottom-0 flex flex-col items-center pointer-events-none"
            style={{ left: `${playheadPos}%`, top: -6, transform: "translateX(-50%)" }}
          >
            {/* Arrow head */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "6px solid var(--color-danger, #ef4444)",
              }}
            />
            {/* Vertical line */}
            <div className="w-0.5 flex-1" style={{ backgroundColor: "var(--color-danger, #ef4444)" }} />
          </div>
          {/* Moment markers */}
          {pauseStops.map((stop, index) => {
            const left = duration > 0 ? (stop.time / duration) * 100 : 0;
            return (
              <div
                key={`${stop.time}-${index}`}
                className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20"
                style={{
                  left: `${left}%`,
                  backgroundColor: "var(--color-warning)",
                  transform: "translateX(-50%)",
                }}
                title={`Moment at ${formatTime(stop.time, true)}`}
                data-testid={`pause-stop-marker-${index}`}
              />
            );
          })}
          {/* Start handle */}
          <button
            type="button"
            aria-label="Drag clip start"
            className="absolute top-0 bottom-0 rounded-l cursor-col-resize z-10"
            style={{
              left: `calc(${selectionLeft}% - ${handleW / 2}px)`,
              width: handleW,
              backgroundColor: "var(--color-accent)",
              opacity: dragging === "start" ? 1 : 0.7,
              border: 0,
              padding: 0,
            }}
            onMouseDown={(e) => { e.stopPropagation(); setActiveHandle("start"); setDragging("start"); }}
            data-testid="clip-start"
          />
          {/* End handle */}
          <button
            type="button"
            aria-label="Drag clip end"
            className="absolute top-0 bottom-0 rounded-r cursor-col-resize z-10"
            style={{
              left: `calc(${selectionLeft + selectionWidth}% - ${handleW / 2}px)`,
              width: handleW,
              backgroundColor: "var(--color-accent)",
              opacity: dragging === "end" ? 1 : 0.7,
              border: 0,
              padding: 0,
            }}
            onMouseDown={(e) => { e.stopPropagation(); setActiveHandle("end"); setDragging("end"); }}
            data-testid="clip-end"
          />
          {/* Time labels on the bar */}
          <span
            className="absolute text-2xs font-mono pointer-events-none"
            style={{ left: 4, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
          >
            {formatTime(startTime, true)}
          </span>
          <span
            className="absolute text-2xs font-mono pointer-events-none"
            style={{ right: 4, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}
          >
            {formatTime(endTime, true)}
          </span>
          </div>

          {/* End frame-step buttons */}
          <button
            {...holdEndBack}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="End − 1 frame"
            aria-label="End − 1 frame"
            data-testid="frame-back-end"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            {...holdEndFwd}
            className="shrink-0 w-6 h-7 flex items-center justify-center rounded"
            style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
            title="End + 1 frame"
            aria-label="End + 1 frame"
            data-testid="frame-fwd-end"
          >
            <ChevronRight size={12} />
          </button>
        </div>

        {/* Row 1: Clip duration + target playback time + Preview */}
        <div className="flex items-center gap-3">
          <span className="text-sm shrink-0" style={{ color: "var(--color-text-secondary)" }}>
            Clip: {formatTime(clipDuration)}
          </span>
          <button
            type="button"
            onClick={setStartToPlayhead}
            disabled={currentTime >= endTime - frameDuration}
            className="px-2 py-1 rounded text-sm disabled:opacity-40"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            data-testid="set-start-to-playhead"
          >
            Set start
          </button>
          <button
            type="button"
            onClick={setEndToPlayhead}
            disabled={currentTime <= startTime + frameDuration}
            className="px-2 py-1 rounded text-sm disabled:opacity-40"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            data-testid="set-end-to-playhead"
          >
            Set end
          </button>
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>→</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Play in</span>
            <input
              type="text"
              value={targetDuration}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setTargetDuration(val);
              }}
              placeholder={`${Math.round(clipDuration)}s`}
              className="w-14 px-1.5 py-0.5 rounded text-sm text-center font-mono"
              style={{
                backgroundColor: "var(--color-surface-inset)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              data-testid="target-duration"
            />
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>s</span>
            {targetSec > 0 && (
              <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
                ({computedSpeed.toFixed(1)}×)
              </span>
            )}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => jumpToPreviewStop(-1)}
            disabled={!canJumpPreviewBack}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            title={previousPreviewStop ? `Previous preview stop: ${getPreviewStopLabel(previousPreviewStop)}` : "Start preview to jump between stops"}
            data-testid="preview-previous-stop"
          >
            <ChevronLeft size={11} /> Previous stop
          </button>
          <button
            onClick={handlePreview}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            data-testid="clip-preview"
          >
            {playing ? <Pause size={11} /> : <Play size={11} />}
            {activePreviewStop ? "Resume preview" : playing ? "Pause" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => jumpToPreviewStop(1)}
            disabled={!canJumpPreviewForward}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            title={nextPreviewStop ? `Next preview stop: ${getPreviewStopLabel(nextPreviewStop)}` : "Start preview to jump between stops"}
            data-testid="preview-next-stop"
          >
            Next stop <ChevronRight size={11} />
          </button>
          <div
            className="flex items-center gap-1 rounded px-1 py-0.5"
            style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
          >
            <button
              type="button"
              {...holdPlayheadBack}
              disabled={!canStepPlayheadBack}
              className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-40"
              style={{
                color: canStepPlayheadBack ? "var(--color-accent)" : "var(--color-text-secondary)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
              title={canStepPlayheadBack ? "Playhead - 1 frame" : "Playhead is at the first selectable frame"}
              aria-label="Playhead - 1 frame"
              data-testid="frame-back-playhead"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Playhead</span>
            <span
              className="min-w-14 text-center text-xs font-mono rounded px-1 py-0.5"
              style={{ color: "var(--color-accent)", backgroundColor: "var(--color-surface)" }}
              title={`Playhead at ${currentTime.toFixed(3)} seconds`}
              data-testid="playhead-time"
            >
              {formatTime(currentTime, true)}
            </span>
            <button
              type="button"
              {...holdPlayheadFwd}
              disabled={!canStepPlayheadFwd}
              className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-40"
              style={{
                color: canStepPlayheadFwd ? "var(--color-accent)" : "var(--color-text-secondary)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
              title={canStepPlayheadFwd ? "Playhead + 1 frame" : "Playhead is at the last selectable frame"}
              aria-label="Playhead + 1 frame"
              data-testid="frame-fwd-playhead"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <button
            onClick={addPauseStop}
            disabled={currentTime <= startTime || currentTime >= endTime}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--color-surface-inset)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            data-testid="add-pause-stop"
          >
            <MousePointerClick size={11} /> Add moment
          </button>
        </div>

      </div>
    </div>
  );
});

export default ClipEditor;
