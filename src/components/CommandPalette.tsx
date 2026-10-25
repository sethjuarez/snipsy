import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { AppCommand } from "../commands/catalog";
import { searchItems } from "../utils/search";
import Dialog from "./ui/Dialog";
import Kbd from "./ui/Kbd";

const MAX_RESULTS = 60;

interface CommandPaletteProps {
  commands: AppCommand[];
  onClose: () => void;
}

function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const results = useMemo(
    () => searchItems(commands, query, (command) => [command.title, command.group, command.detail, ...(command.keywords ?? [])]).slice(0, MAX_RESULTS),
    [commands, query],
  );

  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const run = (command: AppCommand | undefined) => {
    if (!command || command.disabledReason) return;
    onClose();
    command.run();
  };

  const move = (delta: number) => {
    if (results.length === 0) return;
    setActiveIndex((index) => (index + delta + results.length) % results.length);
  };

  const activeCommand = results[activeIndex];

  return (
    <Dialog title="Command palette" hideTitle placement="top" width={560} onClose={onClose} data-testid="command-palette">
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <Search size={15} style={{ color: "var(--color-text-secondary)" }} aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(-1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(activeCommand);
            }
          }}
          placeholder="Search snippets, clips, automations, and commands"
          className="flex-1 bg-transparent py-1 text-md outline-none"
          style={{ color: "var(--color-text)" }}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeCommand ? `${listId}-${activeIndex}` : undefined}
          aria-label="Search commands"
          data-testid="command-palette-input"
        />
      </div>
      {results.length === 0 ? (
        <p className="px-4 py-6 text-base text-center" style={{ color: "var(--color-text-secondary)" }} data-testid="command-palette-empty">
          Nothing matches "{query}".
        </p>
      ) : (
        <ul id={listId} role="listbox" aria-label="Commands" className="overflow-y-auto py-1">
          {results.map((command, index) => {
            const active = index === activeIndex;
            const disabled = Boolean(command.disabledReason);
            return (
              <li
                key={command.id}
                id={`${listId}-${index}`}
                ref={(node) => { optionRefs.current[index] = node; }}
                role="option"
                aria-selected={active}
                aria-disabled={disabled || undefined}
                onMouseMove={() => { if (!active) setActiveIndex(index); }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(command)}
                className="flex items-center gap-3 px-3 py-1.5 mx-1 rounded cursor-pointer"
                style={{
                  backgroundColor: active ? "var(--color-surface-inset)" : "transparent",
                  opacity: disabled ? 0.55 : 1,
                }}
                data-testid={`command-palette-option-${command.id}`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-base" style={{ color: "var(--color-text)" }}>{command.title}</span>
                  {(command.disabledReason || command.detail) && (
                    <span className="block truncate text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      {command.disabledReason ?? command.detail}
                    </span>
                  )}
                </span>
                {command.shortcut && <Kbd hotkey={command.shortcut} />}
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-secondary)" }}>{command.group}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-4 px-3 py-1.5 text-xs" style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }} aria-hidden="true">
        <span>↑↓ to move</span>
        <span>Enter to run</span>
        <span>Esc to close</span>
      </div>
    </Dialog>
  );
}

export default CommandPalette;
