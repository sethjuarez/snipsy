import type { BackendService } from "./backendService";
import type { ProjectData, TextSnippet, VideoSnippet } from "../types";

const FIXTURE_PROJECT: ProjectData = {
  project: {
    name: "Demo Project",
    description: "A sample project for testing",
  },
  textSnippets: [
    {
      id: "ts-1",
      title: "React Import",
      description: "Adds the React import",
      text: "import React from 'react';",
      hotkey: "CmdOrControl+Shift+1",
      delivery: "fast-type",
      typeDelay: 30,
    },
    {
      id: "ts-2",
      title: "Console Log",
      description: "Adds a console.log statement",
      text: "console.log('Hello, world!');",
      hotkey: "CmdOrControl+Shift+2",
      delivery: "paste",
    },
    {
      id: "ts-3",
      title: "Function Template",
      description: "Creates a function template",
      text: "function example() {\n  // TODO: implement\n}",
      hotkey: "CmdOrControl+Shift+3",
      delivery: "fast-type",
      typeDelay: 20,
    },
  ],
  videoSnippets: [
    {
      id: "vs-1",
      title: "Build Process",
      description: "Shows the build completing",
      videoFile: "videos/build-process.mp4",
      startTime: 0,
      endTime: 30,
      hotkey: "CmdOrControl+Shift+4",
      speed: 2.0,
      transitionActions: [
        { triggerAt: "end", action: "click", x: 350, y: 40 },
      ],
    },
  ],
};

export class MockBackendService implements BackendService {
  private data: ProjectData = structuredClone(FIXTURE_PROJECT);

  async createProject(
    _path: string,
    name: string,
    description: string,
  ): Promise<ProjectData> {
    this.data = {
      project: { name, description },
      textSnippets: [],
      videoSnippets: [],
    };
    return structuredClone(this.data);
  }

  async openProject(_path: string): Promise<ProjectData> {
    return structuredClone(this.data);
  }

  async saveTextSnippets(
    _path: string,
    snippets: TextSnippet[],
  ): Promise<void> {
    this.data.textSnippets = structuredClone(snippets);
  }

  async saveVideoSnippets(
    _path: string,
    snippets: VideoSnippet[],
  ): Promise<void> {
    this.data.videoSnippets = structuredClone(snippets);
  }
}
