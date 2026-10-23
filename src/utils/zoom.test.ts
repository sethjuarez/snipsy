import { describe, expect, it } from "vitest";
import { normalizePauseStops } from "./spotlight";
import {
  applyZoomTransform,
  computeZoomTransform,
  fitContain,
  getZoomVisibleFrame,
  IDENTITY_ZOOM_TRANSFORM,
  intersectRects,
  normalizeZoom,
  zoomDurationMs,
  zoomsEqual,
  zoomTransformCss,
} from "./zoom";

const viewport = { width: 1600, height: 900 };
const fullContent = { left: 0, top: 0, width: 1600, height: 900 };

describe("normalizeZoom", () => {
  it("clamps point and scale, rounds values", () => {
    expect(normalizeZoom({ x: -5, y: 140, scale: 20 })).toEqual({ x: 0, y: 100, scale: 6 });
    expect(normalizeZoom({ x: 33.33333, y: 50, scale: 1 })).toEqual({ x: 33.333, y: 50, scale: 1.25 });
  });

  it("rejects missing or non-finite values", () => {
    expect(normalizeZoom(undefined)).toBeUndefined();
    expect(normalizeZoom(null)).toBeUndefined();
    expect(normalizeZoom({ x: Number.NaN, y: 1, scale: 2 })).toBeUndefined();
    expect(normalizeZoom({ x: 1, y: 1, scale: Infinity })).toBeUndefined();
    expect(normalizeZoom({ x: "1", y: 1, scale: 2 } as never)).toBeUndefined();
  });

  it("omits the default duration and clamps custom durations", () => {
    expect(normalizeZoom({ x: 1, y: 1, scale: 2, durationMs: 400 })).toEqual({ x: 1, y: 1, scale: 2 });
    expect(normalizeZoom({ x: 1, y: 1, scale: 2, durationMs: 5000 })?.durationMs).toBe(2000);
    expect(normalizeZoom({ x: 1, y: 1, scale: 2, durationMs: -10 })?.durationMs).toBe(0);
    expect(zoomDurationMs(undefined)).toBe(400);
    expect(zoomDurationMs({ x: 1, y: 1, scale: 2, durationMs: 0 })).toBe(0);
  });

  it("compares zooms by normalized value", () => {
    expect(zoomsEqual({ x: 1, y: 1, scale: 2 }, { x: 1, y: 1, scale: 2, durationMs: 400 })).toBe(true);
    expect(zoomsEqual({ x: 1, y: 1, scale: 2 }, { x: 1, y: 1, scale: 2.5 })).toBe(false);
    expect(zoomsEqual(undefined, undefined)).toBe(true);
    expect(zoomsEqual(undefined, { x: 1, y: 1, scale: 2 })).toBe(false);
  });

  it("is applied by normalizePauseStops without touching spotlight", () => {
    const [stop] = normalizePauseStops([{ time: 2, zoom: { x: 120, y: 50, scale: 3 } }], 0, 10);
    expect(stop.zoom).toEqual({ x: 100, y: 50, scale: 3 });
    expect(stop.spotlight).toBeUndefined();
    const [plain] = normalizePauseStops([{ time: 2 }], 0, 10);
    expect(plain.zoom).toBeUndefined();
  });
});

describe("fitContain", () => {
  it("letterboxes and pillarboxes", () => {
    expect(fitContain({ width: 1600, height: 1200 }, { width: 1920, height: 1080 })).toEqual({
      left: 0, top: 150, width: 1600, height: 900,
    });
    expect(fitContain({ width: 2000, height: 900 }, { width: 1920, height: 1080 })).toEqual({
      left: 200, top: 0, width: 1600, height: 900,
    });
  });

  it("falls back to bounds when media size is unknown", () => {
    expect(fitContain({ width: 100, height: 50 }, { width: 0, height: 0 })).toEqual({
      left: 0, top: 0, width: 100, height: 50,
    });
  });
});

describe("computeZoomTransform", () => {
  it("returns identity without a zoom", () => {
    expect(computeZoomTransform(undefined, viewport, fullContent)).toEqual(IDENTITY_ZOOM_TRANSFORM);
  });

  it("anchors the zoom point so it stays fixed on screen", () => {
    const t = computeZoomTransform({ x: 50, y: 50, scale: 2 }, viewport, fullContent);
    expect(t).toEqual({ scale: 2, translateX: -800, translateY: -450 });
    const off = computeZoomTransform({ x: 75, y: 20, scale: 3 }, viewport, fullContent);
    expect(1200 * off.scale + off.translateX).toBeCloseTo(1200);
    expect(180 * off.scale + off.translateY).toBeCloseTo(180);
  });

  it("stays a pure zoom around the point at every step of a linear transition", () => {
    // CSS interpolates scale and translate with the same progress; the point must not drift.
    const end = computeZoomTransform({ x: 75, y: 20, scale: 3 }, viewport, fullContent);
    for (const p of [0.1, 0.25, 0.5, 0.9]) {
      const scale = 1 + p * (end.scale - 1);
      expect(1200 * scale + p * end.translateX).toBeCloseTo(1200);
      expect(180 * scale + p * end.translateY).toBeCloseTo(180);
    }
  });

  it("never reveals new empty space, even at the edges", () => {
    for (const [x, y] of [[0, 0], [100, 100], [3, 97]]) {
      const zoomed = applyZoomTransform(fullContent, computeZoomTransform({ x, y, scale: 3 }, viewport, fullContent));
      expect(zoomed.left).toBeLessThanOrEqual(0);
      expect(zoomed.top).toBeLessThanOrEqual(0);
      expect(zoomed.left + zoomed.width).toBeGreaterThanOrEqual(1600);
      expect(zoomed.top + zoomed.height).toBeGreaterThanOrEqual(900);
    }
  });

  it("anchors within letterboxed content", () => {
    // 16:9 video in a 4:3 window -> letterboxed (top bar of 150px).
    const content = { left: 0, top: 150, width: 1600, height: 900 };
    const view = { width: 1600, height: 1200 };
    const t = computeZoomTransform({ x: 25, y: 50, scale: 2 }, view, content);
    expect(400 * t.scale + t.translateX).toBe(400);
    expect(600 * t.scale + t.translateY).toBe(600);
    const zoomed = applyZoomTransform(content, t);
    expect(zoomed.top).toBeLessThanOrEqual(0);
    expect(zoomed.top + zoomed.height).toBeGreaterThanOrEqual(1200);
  });

  it("smart-anchors near a letterbox edge so no bars show", () => {
    const content = { left: 0, top: 150, width: 1600, height: 900 };
    const view = { width: 1600, height: 1200 };
    const t = computeZoomTransform({ x: 0, y: 0, scale: 2 }, view, content);
    const zoomed = applyZoomTransform(content, t);
    expect(zoomed.left).toBe(0); // full-width axis: still anchored at the point
    expect(zoomed.top).toBe(0); // anchor shifted just enough to remove the top bar
    expect(zoomed.top + zoomed.height).toBeGreaterThanOrEqual(1200);
  });

  it("keeps an axis centered while scaled content is still smaller than the viewport", () => {
    const content = { left: 700, top: 0, width: 400, height: 225 };
    const view = { width: 1800, height: 225 };
    const t = computeZoomTransform({ x: 0, y: 50, scale: 2 }, view, content);
    const zoomed = applyZoomTransform(content, t);
    expect(zoomed.left + zoomed.width / 2).toBe(900);
    expect(112.5 * t.scale + t.translateY).toBe(112.5);
  });

  it("produces a CSS matrix", () => {
    expect(zoomTransformCss({ scale: 2, translateX: -10, translateY: 5 })).toBe("matrix(2, 0, 0, 2, -10, 5)");
  });
});

describe("getZoomVisibleFrame", () => {
  it("is the full frame when unzoomed", () => {
    expect(getZoomVisibleFrame(undefined, viewport, fullContent)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("is a 1/scale window anchored at the point", () => {
    expect(getZoomVisibleFrame({ x: 50, y: 50, scale: 2 }, viewport, fullContent)).toEqual({
      x: 25, y: 25, width: 50, height: 50,
    });
    const edge = getZoomVisibleFrame({ x: 95, y: 5, scale: 4 }, viewport, fullContent);
    expect(edge.x).toBeCloseTo(71.25);
    expect(edge.y).toBeCloseTo(3.75);
    expect(edge.width).toBeCloseTo(25);
    expect(edge.height).toBeCloseTo(25);
  });
});

describe("intersectRects", () => {
  it("returns the overlap or null", () => {
    expect(intersectRects({ left: 0, top: 0, width: 10, height: 10 }, { left: 5, top: 5, width: 10, height: 10 }))
      .toEqual({ left: 5, top: 5, width: 5, height: 5 });
    expect(intersectRects({ left: 0, top: 0, width: 1, height: 1 }, { left: 2, top: 2, width: 1, height: 1 })).toBeNull();
  });
});
