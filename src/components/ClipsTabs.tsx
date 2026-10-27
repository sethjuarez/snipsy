import { Film, Video } from "lucide-react";
import SectionTabs from "./SectionTabs";
import type { AppView } from "./Sidebar";

export type ClipsTab = Extract<AppView, "video-snippets" | "videos">;

interface ClipsTabsProps {
  active: ClipsTab;
  clipCount: number;
  videoCount?: number;
  onChange: (view: ClipsTab) => void;
}

/** Switches between clips and the source videos they are cut from. */
function ClipsTabs({ active, clipCount, videoCount, onChange }: ClipsTabsProps) {
  return (
    <SectionTabs<ClipsTab>
      label="Clips sections"
      testId="clips-tabs"
      tabTestId="clips-tab"
      active={active}
      onChange={onChange}
      tabs={[
        { id: "video-snippets", label: "Clips", count: clipCount, Icon: Film },
        { id: "videos", label: "Source videos", count: videoCount, Icon: Video },
      ]}
    />
  );
}

export default ClipsTabs;