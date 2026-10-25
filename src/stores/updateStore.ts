import { create } from "zustand";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

interface UpdateState {
  update: Update | null;
  checking: boolean;
  dismissed: boolean;
  /** When the last check finished, or null if none has. */
  checkedAt: number | null;
  /** Set when the last check failed. */
  checkError: string | null;
  installing: boolean;
  /** Set when the last install attempt failed; cleared on retry. */
  installError: string | null;
  progress: string;
  checkForUpdate: () => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  update: null,
  checking: false,
  dismissed: false,
  checkedAt: null,
  checkError: null,
  installing: false,
  installError: null,
  progress: "",

  checkForUpdate: async () => {
    if (get().checking) return;
    set({ checking: true });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = await check();
      set({ update: u?.available ? u : null, checkError: null });
    } catch (error) {
      // Network down, no releases, etc. Only surfaced in Settings.
      set({ checkError: String(error) });
    } finally {
      set({ checking: false, checkedAt: Date.now() });
    }
  },

  install: async () => {
    const { update, installing } = get();
    if (!update || installing) return;
    set({ installing: true, installError: null, progress: "Downloading..." });
    try {
      let downloaded = 0;
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            set({ progress: "Downloading..." });
            break;
          case "Progress":
            downloaded += event.data.chunkLength ?? 0;
            set({ progress: `${(downloaded / 1024 / 1024).toFixed(1)} MB` });
            break;
          case "Finished":
            set({ progress: "Installing..." });
            break;
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      set({ progress: "", installing: false, installError: String(error) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
