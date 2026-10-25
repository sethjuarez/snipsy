import { useKeepAwakeStore } from "../stores/keepAwakeStore";

interface KeepAwakeToggleProps {
  disabled?: boolean;
  testId: string;
}

/** "Keep awake" checkbox shown beside Start. */
export default function KeepAwakeToggle({ disabled, testId }: KeepAwakeToggleProps) {
  const keepAwake = useKeepAwakeStore((s) => s.keepAwake);
  const setKeepAwake = useKeepAwakeStore((s) => s.setKeepAwake);
  return (
    <label
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm"
      style={{ color: "var(--color-text-secondary)", opacity: disabled ? 0.6 : 1 }}
      title="While live, prevent sleep and the screen turning off. When you're idle, nudge the mouse 1px and back so Teams doesn't show you as Away."
    >
      <input
        type="checkbox"
        checked={keepAwake}
        disabled={disabled}
        onChange={(event) => setKeepAwake(event.target.checked)}
        data-testid={testId}
      />
      Keep awake
    </label>
  );
}