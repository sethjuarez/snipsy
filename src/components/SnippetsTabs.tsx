import { FileText, Image } from "lucide-react";
import SectionTabs from "./SectionTabs";
import type { AppView } from "./Sidebar";

export type SnippetsTab = Extract<AppView, "text-snippets" | "images">;

interface SnippetsTabsProps {
  active: SnippetsTab;
  snippetCount: number;
  imageCount?: number;
  onChange: (view: SnippetsTab) => void;
}

/** Switches between text snippets and the images they can embed. */
function SnippetsTabs({ active, snippetCount, imageCount, onChange }: SnippetsTabsProps) {
  return (
    <SectionTabs<SnippetsTab>
      label="Snippets sections"
      testId="snippets-tabs"
      tabTestId="snippets-tab"
      active={active}
      onChange={onChange}
      tabs={[
        { id: "text-snippets", label: "Snippets", count: snippetCount, Icon: FileText },
        { id: "images", label: "Images", count: imageCount, Icon: Image },
      ]}
    />
  );
}

export default SnippetsTabs;