import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { CheckCircle2, Download, ExternalLink, Keyboard, LayoutGrid, RefreshCw, Search, ShieldAlert } from "lucide-react";
import Dialog from "./ui/Dialog";
import Button from "./ui/Button";
import Kbd from "./ui/Kbd";
import StatusBadge from "./ui/StatusBadge";
import { useTheme, type ThemePreference } from "../hooks/useTheme";
import { useAppVersion } from "../hooks/useAppVersion";
import { useUpdateStore } from "../stores/updateStore";
import { DEMO_INTRO_SEEN_KEY } from "../utils/preflight";
import { filterSettingsSections, SETTINGS_SECTIONS, type SettingsSectionId } from "../utils/settings";

interface SettingsDialogProps {
  initialSection?: SettingsSectionId;
  /** Null when unknown. Always true off Windows. */
  elevated: boolean | null;
  onClose: () => void;
  onRelaunchAsAdmin: () => void;
  /** Omitted when no project is open. */
  onShowShortcuts?: () => void;
  /** Opens a project view; omitted when no project is open. */
  onNavigate?: (view: "stream-deck" | "hotkeys") => void;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Row({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
      <div className="min-w-0">
        <div className="text-base font-medium" style={{ color: "var(--color-text)" }}>{title}</div>
        {description && <div className="mt-0.5 text-sm" style={{ color: "var(--color-text-secondary)" }}>{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

function readDemoChecklist(): boolean {
  try {
    return localStorage.getItem(DEMO_INTRO_SEEN_KEY) !== "true";
  } catch {
    return true;
  }
}

function AppearanceSection() {
  const { preference, setPreference } = useTheme();
  // Radio group keyboard model: one tab stop, arrows move and select.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = THEME_OPTIONS.findIndex((option) => option.value === preference);
    const next = THEME_OPTIONS[(index + step + THEME_OPTIONS.length) % THEME_OPTIONS.length];
    setPreference(next.value);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <Row title="Theme" description="System follows your OS light or dark setting.">
      <div role="radiogroup" aria-label="Theme" onKeyDown={onKeyDown} className="inline-flex rounded" style={{ border: "1px solid var(--color-border)" }}>
        {THEME_OPTIONS.map((option) => {
          const checked = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              data-value={option.value}
              onClick={() => setPreference(option.value)}
              className="px-3 py-1 text-sm"
              style={{
                backgroundColor: checked ? "var(--color-accent)" : "transparent",
                color: checked ? "var(--color-text-on-accent)" : "var(--color-text)",
              }}
              data-testid={`settings-theme-${option.value}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Row>
  );
}

function DemoSection() {
  const [showChecklist, setShowChecklist] = useState(readDemoChecklist);
  const toggle = (next: boolean) => {
    try {
      if (next) localStorage.removeItem(DEMO_INTRO_SEEN_KEY);
      else localStorage.setItem(DEMO_INTRO_SEEN_KEY, "true");
    } catch {
      // Storage unavailable; the choice lasts until reload.
    }
    setShowChecklist(next);
  };
  return (
    <Row
      title="Show the checklist before starting a demo"
      description="Snipsy always asks when no hotkeys would be armed."
    >
      <input
        type="checkbox"
        checked={showChecklist}
        onChange={(event) => toggle(event.target.checked)}
        aria-label="Show the checklist before starting a demo"
        data-testid="settings-demo-checklist"
      />
    </Row>
  );
}

function PermissionsSection({ elevated, onRelaunchAsAdmin }: Pick<SettingsDialogProps, "elevated" | "onRelaunchAsAdmin">) {
  if (elevated === false) {
    return (
      <Row
        title="Not running as administrator"
        description="Windows needs admin rights to block your keyboard and mouse while Snipsy types, and to type into apps running as administrator."
      >
        <Button tone="primary" icon={<ShieldAlert size={12} />} onClick={onRelaunchAsAdmin} data-testid="settings-relaunch-admin">
          Restart as administrator
        </Button>
      </Row>
    );
  }
  return (
    <Row title="Input protection" description={elevated === null ? "Checking permissions…" : "Snipsy has the permissions it needs."}>
      {elevated && <StatusBadge tone="success" icon={<CheckCircle2 size={10} />} data-testid="settings-elevation-ok">Ready</StatusBadge>}
    </Row>
  );
}

function UpdatesSection() {
  const version = useAppVersion();
  const { update, checking, checkedAt, checkError, installing, installError, progress, checkForUpdate, install } = useUpdateStore();
  let status = "Not checked yet.";
  if (checking) status = "Checking…";
  else if (installError) status = "The update failed to install. Try again.";
  else if (update) status = `Version ${update.version} is available.`;
  else if (checkError) status = "Couldn't check for updates. Try again later.";
  else if (checkedAt) status = "You're up to date.";
  return (
    <>
      <Row title="Version" description={<span data-testid="settings-version">{version ? `v${version}` : "…"}</span>} />
      <Row title="Updates" description={<span data-testid="settings-update-status">{installing ? progress : status}</span>}>
        {update ? (
          <Button tone="primary" icon={<Download size={12} />} disabled={installing} onClick={() => void install()} data-testid="settings-update-install">
            Download &amp; install
          </Button>
        ) : (
          <Button icon={<RefreshCw size={12} />} disabled={checking} onClick={() => void checkForUpdate()} data-testid="settings-update-check">
            Check for updates
          </Button>
        )}
      </Row>
    </>
  );
}

function StreamDeckSection({ onNavigate }: Pick<SettingsDialogProps, "onNavigate">) {
  return (
    <Row
      title="Stream Deck plugin"
      description="Install the Snipsy plugin from the release page, then add Snipsy keys in the Stream Deck app. Keys follow the open project."
    >
      {onNavigate && (
        <Button icon={<LayoutGrid size={12} />} onClick={() => onNavigate("stream-deck")} data-testid="settings-open-stream-deck">
          Preview keys
        </Button>
      )}
    </Row>
  );
}

function ShortcutsSection({ onShowShortcuts, onNavigate }: Pick<SettingsDialogProps, "onShowShortcuts" | "onNavigate">) {
  return (
    <>
      <Row title="In-app shortcuts" description={<>Work while Snipsy is focused. <Kbd hotkey="CmdOrControl+K" /> opens the command palette.</>}>
        {onShowShortcuts && (
          <Button icon={<Keyboard size={12} />} onClick={onShowShortcuts} data-testid="settings-show-shortcuts">
            View all
          </Button>
        )}
      </Row>
      <Row title="Demo hotkeys" description="Each snippet, clip, and automation has its own hotkey that works only during a demo.">
        {onNavigate && (
          <Button icon={<ExternalLink size={12} />} onClick={() => onNavigate("hotkeys")} data-testid="settings-open-hotkeys">
            Manage hotkeys
          </Button>
        )}
      </Row>
    </>
  );
}

/** App settings in sections, with search and deep links. */
function SettingsDialog({ initialSection = "appearance", elevated, onClose, onRelaunchAsAdmin, onShowShortcuts, onNavigate }: SettingsDialogProps) {
  const [selected, setSelected] = useState<SettingsSectionId>(initialSection);
  const [query, setQuery] = useState("");
  useEffect(() => setSelected(initialSection), [initialSection]);

  const matches = filterSettingsSections(query);
  const searching = query.trim().length > 0;
  const visible = searching ? matches : SETTINGS_SECTIONS.filter((section) => section.id === selected);

  const renderSection = (id: SettingsSectionId) => {
    switch (id) {
      case "appearance":
        return <AppearanceSection />;
      case "demo":
        return <DemoSection />;
      case "permissions":
        return <PermissionsSection elevated={elevated} onRelaunchAsAdmin={onRelaunchAsAdmin} />;
      case "updates":
        return <UpdatesSection />;
      case "stream-deck":
        return <StreamDeckSection onNavigate={onNavigate} />;
      case "shortcuts":
        return <ShortcutsSection onShowShortcuts={onShowShortcuts} onNavigate={onNavigate} />;
    }
  };

  return (
    <Dialog title="Settings" onClose={onClose} width={720} data-testid="settings-dialog">
      <div className="flex min-h-[340px] gap-4 px-4 pb-4">
        <nav className="flex w-44 shrink-0 flex-col gap-1" aria-label="Settings sections">
          <label className="mb-1 flex items-center gap-1.5 rounded px-2 py-1" style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}>
            <Search size={12} aria-hidden="true" style={{ color: "var(--color-text-secondary)" }} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--color-text)" }}
              data-testid="settings-search"
            />
          </label>
          {SETTINGS_SECTIONS.map((section) => {
            const current = !searching && section.id === selected;
            const dimmed = searching && !matches.includes(section);
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  setQuery("");
                  setSelected(section.id);
                }}
                aria-current={current ? "page" : undefined}
                className="rounded px-2 py-1 text-left text-base"
                style={{
                  backgroundColor: current ? "var(--color-surface-inset)" : "transparent",
                  color: current ? "var(--color-text)" : "var(--color-text-secondary)",
                  opacity: dimmed ? 0.45 : 1,
                  fontWeight: current ? 600 : 400,
                }}
                data-testid={`settings-nav-${section.id}`}
              >
                {section.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {visible.length === 0 && (
            <p className="py-8 text-center text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="settings-no-results">
              No settings match "{query}".
            </p>
          )}
          {visible.map((section) => (
            <section key={section.id} className="mb-4" aria-labelledby={`settings-heading-${section.id}`} data-testid={`settings-section-${section.id}`}>
              <h3 id={`settings-heading-${section.id}`} className="text-md font-semibold" style={{ color: "var(--color-text)" }}>{section.label}</h3>
              <p className="mb-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>{section.description}</p>
              {renderSection(section.id)}
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

export default SettingsDialog;
