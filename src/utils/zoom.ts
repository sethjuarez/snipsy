import type { PauseZoom } from "../types";
import type { Rect } from "./spotlight";

export const ZOOM_MIN_SCALE = 1.25;
export const ZOOM_MAX_SCALE = 6;
export const ZOOM_DEFAULT_SCALE = 2;
export const ZOOM_SCALE_STEP = 0.25;
export const ZOOM_DEFAULT_DURATION_MS = 400;
export const ZOOM_MAX_DURATION_MS = 2000;

export interface Size {
  width: number;
  height: number;
}

/** Uniform scale + translation, applied with `transform-origin: 0 0`. */
export interface ZoomTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export const IDENTITY_ZOOM_TRANSFORM: ZoomTransform = { scale: 1, translateX: 0, translateY: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

export function clampZoomScale(scale: number): number {
  return roundTo(clamp(scale, ZOOM_MIN_SCALE, ZOOM_MAX_SCALE), 2);
}

export function normalizeZoom(zoom: PauseZoom | undefined | null): PauseZoom | undefined {
  if (!zoom || typeof zoom !== "object") return undefined;
  const { x, y, scale } = zoom;
  if (![x, y, scale].every((value) => typeof value === "number" && Number.isFinite(value))) return undefined;

  const normalized: PauseZoom = {
    x: roundTo(clamp(x, 0, 100), 3),
    y: roundTo(clamp(y, 0, 100), 3),
    scale: clampZoomScale(scale),
  };
  if (typeof zoom.durationMs === "number" && Number.isFinite(zoom.durationMs)) {
    const durationMs = Math.round(clamp(zoom.durationMs, 0, ZOOM_MAX_DURATION_MS));
    if (durationMs !== ZOOM_DEFAULT_DURATION_MS) normalized.durationMs = durationMs;
  }
  return normalized;
}

export function createZoom(x: number, y: number, scale = ZOOM_DEFAULT_SCALE): PauseZoom {
  return normalizeZoom({ x, y, scale })!;
}

export function zoomDurationMs(zoom: PauseZoom | undefined): number {
  return zoom?.durationMs ?? ZOOM_DEFAULT_DURATION_MS;
}

export function zoomSignature(zoom: PauseZoom | undefined): string {
  const normalized = normalizeZoom(zoom);
  if (!normalized) return "none";
  return JSON.stringify([normalized.x, normalized.y, normalized.scale, zoomDurationMs(normalized)]);
}

export function zoomsEqual(a: PauseZoom | undefined, b: PauseZoom | undefined): boolean {
  return zoomSignature(a) === zoomSignature(b);
}

/** `object-fit: contain` box for a video of `media` size inside `bounds`, relative to bounds. */
export function fitContain(bounds: Size, media: Size): Rect {
  if (media.width <= 0 || media.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { left: 0, top: 0, width: bounds.width, height: bounds.height };
  }
  const mediaAspect = media.width / media.height;
  if (bounds.width / bounds.height > mediaAspect) {
    const width = bounds.height * mediaAspect;
    return { left: (bounds.width - width) / 2, top: 0, width, height: bounds.height };
  }
  const height = bounds.width / mediaAspect;
  return { left: 0, top: (bounds.height - height) / 2, width: bounds.width, height };
}

/**
 * Untransformed content box of a `object-contain` video, relative to the element.
 * Uses layout sizes (clientWidth/Height), which ignore CSS transforms on ancestors.
 */
export function getUntransformedVideoContentBox(video: HTMLVideoElement): Rect {
  const bounds = { width: video.clientWidth, height: video.clientHeight };
  return fitContain(bounds, {
    width: video.videoWidth || bounds.width,
    height: video.videoHeight || bounds.height,
  });
}

function solveAxis(viewSize: number, contentStart: number, contentSize: number, pointPercent: number, scale: number) {
  const scaledSize = contentSize * scale;
  if (scaledSize <= viewSize) {
    return (viewSize - scaledSize) / 2 - scale * contentStart;
  }
  const point = contentStart + (pointPercent / 100) * contentSize;
  const centered = viewSize / 2 - scale * point;
  const min = viewSize - scale * (contentStart + contentSize);
  const max = -scale * contentStart;
  return clamp(centered, min, max) + 0;
}

/**
 * ZoomIt-style transform: magnify by `zoom.scale`, center the zoom point in the
 * viewport, and clamp so no empty space shows past the video edges.
 * `content` is the untransformed video content box relative to the viewport.
 */
export function computeZoomTransform(zoom: PauseZoom | undefined, viewport: Size, content: Rect): ZoomTransform {
  const normalized = normalizeZoom(zoom);
  if (!normalized || viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) {
    return IDENTITY_ZOOM_TRANSFORM;
  }
  const scale = normalized.scale;
  return {
    scale,
    translateX: solveAxis(viewport.width, content.left, content.width, normalized.x, scale),
    translateY: solveAxis(viewport.height, content.top, content.height, normalized.y, scale),
  };
}

export function applyZoomTransform(rect: Rect, transform: ZoomTransform): Rect {
  return {
    left: rect.left * transform.scale + transform.translateX,
    top: rect.top * transform.scale + transform.translateY,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale,
  };
}

export function zoomTransformCss(transform: ZoomTransform): string {
  const { scale, translateX, translateY } = transform;
  return `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`;
}

/** Portion of the video (percent rect) visible in `viewport` once zoomed. */
export function getZoomVisibleFrame(zoom: PauseZoom | undefined, viewport: Size, content: Rect) {
  const transform = computeZoomTransform(zoom, viewport, content);
  const toPercentX = (screenX: number) =>
    clamp((((screenX - transform.translateX) / transform.scale - content.left) / content.width) * 100, 0, 100);
  const toPercentY = (screenY: number) =>
    clamp((((screenY - transform.translateY) / transform.scale - content.top) / content.height) * 100, 0, 100);
  const left = toPercentX(0);
  const top = toPercentY(0);
  return {
    x: left,
    y: top,
    width: toPercentX(viewport.width) - left,
    height: toPercentY(viewport.height) - top,
  };
}

export function intersectRects(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
