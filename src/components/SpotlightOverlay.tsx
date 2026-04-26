import { useId } from "react";
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

function SpotlightOverlay({
  spotlight,
  contentBox,
  label,
  selectedRegionIndex,
  testIdPrefix = "spotlight",
  onRegionClick,
}: SpotlightOverlayProps) {
  const maskId = useId().replace(/:/g, "-");
  const style = { ...DEFAULT_SPOTLIGHT_STYLE, ...spotlight.style };
  const regions = spotlight.regions
    .filter((region) => region.type === "rectangle")
    .map((region) => regionToBox(region, contentBox));

  if (regions.length === 0) return null;

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: onRegionClick ? "auto" : "none", zIndex: 30 }}
      data-testid={`${testIdPrefix}-overlay`}
    >
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {regions.map((region, index) => (
              <rect
                key={index}
                x={region.left}
                y={region.top}
                width={region.width}
                height={region.height}
                rx="10"
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="black"
          opacity={style.dimOpacity}
          mask={`url(#${maskId})`}
        />
      </svg>

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

      {label && regions[0] && (
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
