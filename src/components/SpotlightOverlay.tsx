import type { PauseSpotlight } from "../types";
import { DEFAULT_SPOTLIGHT_STYLE, type Rect, regionToBox } from "../utils/spotlight";

interface SpotlightOverlayProps {
  spotlight: PauseSpotlight;
  contentBox: Rect;
  label?: string;
  selectedRegionIndex?: number | null;
  testIdPrefix?: string;
  onRegionClick?: (index: number) => void;
}

function buildOutsideMask(contentBox: Rect, regions: Rect[]): string {
  const outer = `M0 0H${contentBox.width}V${contentBox.height}H0Z`;
  const holes = regions
    .map((region) => {
      const left = region.left - contentBox.left;
      const top = region.top - contentBox.top;
      const right = left + region.width;
      const bottom = top + region.height;
      return `M${left} ${top}H${right}V${bottom}H${left}Z`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${contentBox.width}" height="${contentBox.height}" viewBox="0 0 ${contentBox.width} ${contentBox.height}"><path fill="black" fill-rule="evenodd" d="${outer}${holes}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function SpotlightOverlay({
  spotlight,
  contentBox,
  label,
  selectedRegionIndex,
  testIdPrefix = "spotlight",
  onRegionClick,
}: SpotlightOverlayProps) {
  const style = { ...DEFAULT_SPOTLIGHT_STYLE, ...spotlight.style };
  const regions = spotlight.regions
    .filter((region) => region.type === "rectangle")
    .map((region) => regionToBox(region, contentBox));

  if (regions.length === 0) return null;

  const outsideMask = buildOutsideMask(contentBox, regions);

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: onRegionClick ? "auto" : "none", zIndex: 30 }}
      data-testid={`${testIdPrefix}-overlay`}
    >
      <div
        className="absolute"
        style={{
          left: contentBox.left,
          top: contentBox.top,
          width: contentBox.width,
          height: contentBox.height,
          backgroundColor: `rgba(0, 0, 0, ${style.dimOpacity})`,
          backdropFilter: `blur(${style.blur}px)`,
          WebkitBackdropFilter: `blur(${style.blur}px)`,
          maskImage: outsideMask,
          WebkitMaskImage: outsideMask,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          pointerEvents: "none",
        }}
        data-testid={`${testIdPrefix}-outside-blur`}
      />

      {regions.map((region, index) => {
        const selected = selectedRegionIndex === index;
        return (
          <button
            key={index}
            type="button"
            aria-label={`Spotlight region ${index + 1}`}
            data-testid={`${testIdPrefix}-region-${index}`}
            onMouseDown={(event) => event.stopPropagation()}
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
              border: `${selected ? style.borderWidth + 1 : style.borderWidth}px solid ${style.borderColor}`,
              boxShadow: style.glow
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
            left: regions[0].left,
            top: Math.max(8, regions[0].top - 34),
            color: "#111827",
            backgroundColor: style.borderColor,
            boxShadow: style.glow ? `0 0 18px ${style.borderColor}` : undefined,
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
