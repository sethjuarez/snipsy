import type { PauseSpotlight } from "../types";
import {
  type Rect,
  isSpotlightBlurEnabled,
  isSpotlightDimEnabled,
  isSpotlightHaloEnabled,
  regionToBox,
  resolveSpotlightStyle,
} from "../utils/spotlight";
import { intersectRects } from "../utils/zoom";

interface SpotlightOverlayProps {
  spotlight: PauseSpotlight;
  contentBox: Rect;
  /** Visible viewport; when zoomed the content box is larger than the screen. */
  clipBox?: Rect;
  label?: string;
  selectedRegionIndex?: number | null;
  testIdPrefix?: string;
  showOutsideEffect?: boolean;
  onRegionClick?: (index: number) => void;
  onRegionMouseDown?: (index: number, event: React.MouseEvent) => void;
}

function buildOutsideMask(box: Rect, regions: Rect[]): string {
  const outer = `M0 0H${box.width}V${box.height}H0Z`;
  const holes = regions
    .map((region) => {
      const left = region.left - box.left;
      const top = region.top - box.top;
      const right = left + region.width;
      const bottom = top + region.height;
      return `M${left} ${top}H${right}V${bottom}H${left}Z`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}"><path fill="black" fill-rule="evenodd" d="${outer}${holes}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function SpotlightOverlay({
  spotlight,
  contentBox,
  clipBox,
  label,
  selectedRegionIndex,
  testIdPrefix = "spotlight",
  showOutsideEffect = true,
  onRegionClick,
  onRegionMouseDown,
}: SpotlightOverlayProps) {
  const style = resolveSpotlightStyle(spotlight);
  const blurEnabled = isSpotlightBlurEnabled(spotlight);
  const dimEnabled = isSpotlightDimEnabled(spotlight);
  const haloEnabled = isSpotlightHaloEnabled(spotlight);
  const backdropFilter = blurEnabled ? `blur(${style.blur}px)` : undefined;
  const regions = spotlight.regions
    .filter((region) => region.type === "rectangle")
    .map((region) => regionToBox(region, contentBox));

  if (regions.length === 0) return null;

  const effectBox = clipBox ? intersectRects(contentBox, clipBox) : contentBox;
  const outsideMask = effectBox ? buildOutsideMask(effectBox, regions) : null;
  const labelLeft = regions[0] && clipBox ? Math.max(clipBox.left + 8, regions[0].left) : regions[0]?.left ?? 0;

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: onRegionClick ? "auto" : "none", zIndex: 30 }}
      data-testid={`${testIdPrefix}-overlay`}
    >
      {showOutsideEffect && effectBox && outsideMask && (blurEnabled || dimEnabled) && (
        <div
          className="absolute"
          style={{
            left: effectBox.left,
            top: effectBox.top,
            width: effectBox.width,
            height: effectBox.height,
            backgroundColor: dimEnabled ? `rgba(0, 0, 0, ${style.dimOpacity})` : undefined,
            backdropFilter,
            WebkitBackdropFilter: backdropFilter,
            maskImage: outsideMask,
            WebkitMaskImage: outsideMask,
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
            pointerEvents: "none",
          }}
          data-testid={`${testIdPrefix}-outside-blur`}
          data-blur={blurEnabled ? "on" : "off"}
          data-dim={dimEnabled ? "on" : "off"}
        />
      )}

      {regions.map((region, index) => {
        const selected = selectedRegionIndex === index;
        return (
          <button
            key={index}
            type="button"
            aria-label={`Spotlight region ${index + 1}`}
            data-testid={`${testIdPrefix}-region-${index}`}
            data-halo={haloEnabled ? "on" : "off"}
            onMouseDown={(event) => {
              event.stopPropagation();
              onRegionMouseDown?.(index, event);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onRegionClick?.(index);
            }}
            className="absolute rounded-[10px]"
            style={{
              left: region.left,
              top: region.top,
              width: region.width,
              height: region.height,
              minWidth: 0,
              minHeight: 0,
              padding: 0,
              border: `${selected ? style.borderWidth + 1 : style.borderWidth}px solid ${style.borderColor}`,
              boxShadow: haloEnabled
                ? `0 0 0 1px rgba(255,255,255,0.45), 0 0 22px ${style.borderColor}, inset 0 0 18px rgba(250,204,21,0.18)`
                : undefined,
              background: "transparent",
              pointerEvents: onRegionClick ? "auto" : "none",
            }}
          />
        );
      })}

      {spotlight.showLabel !== false && label && regions[0] && (
        <div
          className="absolute px-2 py-1 rounded text-sm font-medium"
          style={{
            left: labelLeft,
            top: Math.max(8, regions[0].top - 34),
            color: "#111827",
            backgroundColor: style.borderColor,
            boxShadow: haloEnabled ? `0 0 18px ${style.borderColor}` : undefined,
            pointerEvents: "none",
          }}
          data-testid={`${testIdPrefix}-label`}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export default SpotlightOverlay;
