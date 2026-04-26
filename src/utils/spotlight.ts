import type { PauseSpotlight, PauseSpotlightRegion, PauseStop, RectanglePauseSpotlightRegion } from "../types";

export const DEFAULT_SPOTLIGHT_STYLE = {
  blur: 6,
  dimOpacity: 0.12,
  borderColor: "#facc15",
  borderWidth: 3,
  glow: true,
} as const;

export const STOP_EPSILON = 0.05;
const MIN_REGION_SIZE = 2;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function normalizeRectangleRegion(region: RectanglePauseSpotlightRegion): RectanglePauseSpotlightRegion | null {
  if (
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y) ||
    !Number.isFinite(region.width) ||
    !Number.isFinite(region.height)
  ) {
    return null;
  }

  const x = clamp(region.x, 0, 100);
  const y = clamp(region.y, 0, 100);
  const right = clamp(region.x + region.width, 0, 100);
  const bottom = clamp(region.y + region.height, 0, 100);
  const width = right - x;
  const height = bottom - y;

  if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null;

  return {
    type: "rectangle",
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
  };
}

export function normalizeSpotlight(spotlight: PauseSpotlight | undefined): PauseSpotlight | undefined {
  if (!spotlight || !Array.isArray(spotlight.regions)) return undefined;

  const regions = spotlight.regions
    .map((region): PauseSpotlightRegion | null => {
      switch (region.type) {
        case "rectangle":
          return normalizeRectangleRegion(region);
        default:
          return null;
      }
    })
    .filter((region): region is PauseSpotlightRegion => region !== null);

  if (regions.length === 0) return undefined;

  return {
    regions,
    showLabel: spotlight.showLabel,
    style: spotlight.style,
  };
}

export function normalizePauseStops(
  stops: PauseStop[],
  startTime: number,
  endTime: number,
  epsilon = STOP_EPSILON,
): PauseStop[] {
  const sorted = stops
    .filter((stop) => Number.isFinite(stop.time) && stop.time > startTime && stop.time < endTime)
    .map((stop) => ({
      time: round(stop.time),
      label: stop.label?.trim() || undefined,
      spotlight: normalizeSpotlight(stop.spotlight),
    }))
    .sort((a, b) => a.time - b.time);

  return sorted.filter((stop, index) => {
    const previous = sorted[index - 1];
    return !previous || Math.abs(stop.time - previous.time) > epsilon;
  });
}

export function getVideoContentRect(video: HTMLVideoElement): Rect {
  const bounds = video.getBoundingClientRect();
  const videoWidth = video.videoWidth || bounds.width;
  const videoHeight = video.videoHeight || bounds.height;

  if (videoWidth <= 0 || videoHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  }

  const videoAspect = videoWidth / videoHeight;
  const boundsAspect = bounds.width / bounds.height;

  if (boundsAspect > videoAspect) {
    const width = bounds.height * videoAspect;
    return {
      left: bounds.left + (bounds.width - width) / 2,
      top: bounds.top,
      width,
      height: bounds.height,
    };
  }

  const height = bounds.width / videoAspect;
  return {
    left: bounds.left,
    top: bounds.top + (bounds.height - height) / 2,
    width: bounds.width,
    height,
  };
}

export function getVideoContentBox(video: HTMLVideoElement): Rect {
  const bounds = video.getBoundingClientRect();
  const content = getVideoContentRect(video);
  return {
    left: content.left - bounds.left,
    top: content.top - bounds.top,
    width: content.width,
    height: content.height,
  };
}

export function pointerToVideoPoint(video: HTMLVideoElement, clientX: number, clientY: number): Point {
  const content = getVideoContentRect(video);
  return {
    x: round(clamp(((clientX - content.left) / content.width) * 100, 0, 100)),
    y: round(clamp(((clientY - content.top) / content.height) * 100, 0, 100)),
  };
}

export function createRectangleRegion(start: Point, end: Point): RectanglePauseSpotlightRegion | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  return normalizeRectangleRegion({ type: "rectangle", x, y, width, height });
}

export function regionToBox(region: RectanglePauseSpotlightRegion, contentBox: Rect): Rect {
  return {
    left: contentBox.left + (region.x / 100) * contentBox.width,
    top: contentBox.top + (region.y / 100) * contentBox.height,
    width: (region.width / 100) * contentBox.width,
    height: (region.height / 100) * contentBox.height,
  };
}
