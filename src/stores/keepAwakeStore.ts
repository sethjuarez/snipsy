import { create } from "zustand";
import { readKeepAwake, writeKeepAwake } from "../utils/keepAwake";

interface KeepAwakeState {
  keepAwake: boolean;
  setKeepAwake: (value: boolean) => void;
}

/** Shared "Keep awake" choice shown beside every Start button. */
export const useKeepAwakeStore = create<KeepAwakeState>((set) => ({
  keepAwake: readKeepAwake(),
  setKeepAwake: (value) => {
    writeKeepAwake(value);
    set({ keepAwake: value });
  },
}));