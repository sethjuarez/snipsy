import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PauseSpotlight, PauseSpotlightStyle } from "../types";
import SpotlightOverlay from "./SpotlightOverlay";

afterEach(cleanup);

const contentBox = { left: 0, top: 0, width: 400, height: 200 };

function renderOverlay(style?: PauseSpotlightStyle) {
  const spotlight: PauseSpotlight = {
    regions: [{ type: "rectangle", x: 10, y: 10, width: 20, height: 20 }],
    style,
  };
  return render(<SpotlightOverlay spotlight={spotlight} contentBox={contentBox} />);
}

describe("SpotlightOverlay effects", () => {
  it("dims and blurs outside regions by default", () => {
    renderOverlay();
    const outside = screen.getByTestId("spotlight-outside-blur");
    expect(outside.dataset.blur).toBe("on");
    expect(outside.dataset.dim).toBe("on");
    expect(outside.style.backgroundColor).toBe("rgba(0, 0, 0, 0.12)");
    expect(screen.getByTestId("spotlight-region-0").dataset.halo).toBe("on");
  });

  it("keeps blur without darkening when dim is off", () => {
    renderOverlay({ dimOpacity: 0 });
    const outside = screen.getByTestId("spotlight-outside-blur");
    expect(outside.dataset.blur).toBe("on");
    expect(outside.dataset.dim).toBe("off");
    expect(outside.style.backgroundColor).toBe("");
  });

  it("darkens without blur when blur is off", () => {
    renderOverlay({ blur: 0 });
    const outside = screen.getByTestId("spotlight-outside-blur");
    expect(outside.dataset.blur).toBe("off");
    expect(outside.dataset.dim).toBe("on");
  });

  it("restores default effects when toggles are re-enabled in memory", () => {
    renderOverlay({ blur: undefined, dimOpacity: undefined, glow: undefined });
    const outside = screen.getByTestId("spotlight-outside-blur");
    expect(outside.style.backgroundColor).toBe("rgba(0, 0, 0, 0.12)");
    expect(outside.style.backdropFilter).toBe("blur(6px)");
  });

  it("draws only the outline when every effect is off", () => {
    renderOverlay({ blur: 0, dimOpacity: 0, glow: false });
    expect(screen.queryByTestId("spotlight-outside-blur")).toBeNull();
    const region = screen.getByTestId("spotlight-region-0");
    expect(region.dataset.halo).toBe("off");
    expect(region.style.boxShadow).toBe("");
    expect(region.style.border).toContain("solid");
  });
});
