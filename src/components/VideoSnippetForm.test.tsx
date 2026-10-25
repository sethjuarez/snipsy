import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VideoSnippet } from "../types";
import VideoSnippetForm from "./VideoSnippetForm";

afterEach(cleanup);

describe("VideoSnippetForm", () => {
  it("keeps playback settings it does not edit when saving", () => {
    const snippet: VideoSnippet = {
      id: "clip-1",
      title: "Clip",
      description: "",
      videoFile: "videos/a.mp4",
      startTime: 0,
      endTime: 5,
      hotkey: "CmdOrControl+Shift+9",
      speed: 1,
      targetMonitor: "\\\\.\\DISPLAY2",
      endBehavior: "freeze",
      hideCursor: true,
      backgroundColor: "#112233",
      clickToPlay: true,
    };
    const onSave = vi.fn();
    render(<VideoSnippetForm snippet={snippet} onSave={onSave} />);
    fireEvent.submit(screen.getByTestId("video-snippet-form"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: "clip-1",
      targetMonitor: "\\\\.\\DISPLAY2",
      endBehavior: "freeze",
      hideCursor: true,
      backgroundColor: "#112233",
      clickToPlay: true,
    }));
  });
});
