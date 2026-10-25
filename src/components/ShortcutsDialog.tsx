import { ALL_SHORTCUTS } from "../commands/catalog";
import Dialog from "./ui/Dialog";
import Kbd from "./ui/Kbd";

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} data-testid="shortcuts-dialog">
      <div className="px-4 pb-4 overflow-y-auto">
        <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
          These work while Snipsy is focused. Your snippet hotkeys are separate and only listen during a demo.
        </p>
        <table className="w-full text-base">
          <tbody>
            {ALL_SHORTCUTS.map((item) => (
              <tr key={item.id} data-testid={`shortcut-${item.id}`} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                <td className="py-1.5" style={{ color: "var(--color-text)" }}>{item.title}</td>
                <td className="py-1.5 text-right"><Kbd hotkey={item.shortcut} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export default ShortcutsDialog;
