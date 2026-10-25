import { Search, X } from "lucide-react";

interface ListFilterProps {
  value: string;
  onChange: (value: string) => void;
  /** Noun for the items, e.g. "text snippets". */
  label: string;
  total: number;
  shown: number;
  "data-testid"?: string;
}

/** Filter box shown above a list; Escape clears it. */
function ListFilter({ value, onChange, label, total, shown, "data-testid": testId = "list-filter" }: ListFilterProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className="flex flex-1 items-center gap-2 px-2.5 py-1.5 rounded focus-within:ring-2 focus-within:ring-[var(--color-accent)]"
        style={{ backgroundColor: "var(--color-surface-inset)", border: "1px solid var(--color-border)" }}
      >
        <Search size={13} aria-hidden="true" style={{ color: "var(--color-text-secondary)" }} />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value) {
              event.preventDefault();
              event.stopPropagation();
              onChange("");
            }
          }}
          placeholder={`Filter ${label}`}
          aria-label={`Filter ${label}`}
          className="flex-1 min-w-0 bg-transparent text-base outline-none"
          style={{ color: "var(--color-text)" }}
          data-testid={testId}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center rounded hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Clear filter"
            data-testid={`${testId}-clear`}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {value && (
        <span className="text-sm shrink-0" style={{ color: "var(--color-text-secondary)" }} aria-live="polite" data-testid={`${testId}-count`}>
          {shown} of {total}
        </span>
      )}
    </div>
  );
}

export function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="text-center py-8 text-base" style={{ color: "var(--color-text-secondary)" }} data-testid="list-no-matches">
      No matches for “{query}”.{" "}
      <button type="button" onClick={onClear} className="underline hover:opacity-80" style={{ color: "var(--color-accent)" }}>
        Clear filter
      </button>
    </div>
  );
}

export default ListFilter;
