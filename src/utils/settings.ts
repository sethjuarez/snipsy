export type SettingsSectionId = "project" | "appearance" | "demo" | "permissions" | "updates" | "stream-deck" | "shortcuts";

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  description: string;
  keywords: string[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "project", label: "Project", description: "Name and description of the open project", keywords: ["rename", "name", "title", "description", "notes"] },
  { id: "appearance", label: "Appearance", description: "Light, dark, or match the system", keywords: ["dark", "light", "system", "color", "theme", "mode"] },
  { id: "demo", label: "Demo", description: "What happens when a demo starts", keywords: ["checklist", "confirm", "preflight", "present", "start"] },
  { id: "permissions", label: "Permissions", description: "Administrator rights for input protection", keywords: ["admin", "administrator", "elevation", "elevated", "uac", "input", "block"] },
  { id: "updates", label: "Updates", description: "Version and app updates", keywords: ["version", "upgrade", "install", "release", "check"] },
  { id: "stream-deck", label: "Stream Deck", description: "Trigger snippets from an Elgato Stream Deck", keywords: ["elgato", "plugin", "buttons", "keys", "icons"] },
  { id: "shortcuts", label: "Shortcuts", description: "In-app shortcuts and demo hotkeys", keywords: ["keyboard", "keys", "hotkeys", "palette", "conflicts"] },
];

/** Sections containing every word of the query; no fuzzy letter matching, which matches nearly everything here. */
export function filterSettingsSections(query: string): SettingsSection[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SETTINGS_SECTIONS.filter((section) => {
    const haystack = [section.label, section.description, ...section.keywords].join(" ").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
