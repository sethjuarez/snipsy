import { create } from "zustand";

interface ProjectState {
  projectName: string | null;
  setProjectName: (name: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectName: null,
  setProjectName: (name) => set({ projectName: name }),
}));
