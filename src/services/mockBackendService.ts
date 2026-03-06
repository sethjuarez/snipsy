import type { BackendService, SnippetHotkey } from "./backendService";
import type { ProjectData, Script, TextSnippet, VideoSnippet } from "../types";

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
  private _demoMode = false;
  private _scripts: Script[] = [
    {
      id: "sc-1",
      title: "Build Demo Script",
      description: "Opens terminal and runs build",
      steps: [
        { action: "wait", duration: 1000 },
        { action: "type", text: "npm run build", delay: 50 },
        { action: "keypress", key: "Enter" },
      ],
      outputVideo: "videos/build-demo.mp4",
    },
  ];

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

  async enterDemoMode(_hotkeys: SnippetHotkey[]): Promise<void> {
    this._demoMode = true;
  }

  async exitDemoMode(): Promise<void> {
    this._demoMode = false;
  }

  async isDemoMode(): Promise<boolean> {
    return this._demoMode;
  }

  async deliverText(
    _text: string,
    _method: string,
    _typeDelay?: number,
  ): Promise<void> {
    // Mock: no-op in test mode
  }

  async importVideo(
    _projectPath: string,
    _sourceFilePath: string,
  ): Promise<string> {
    return "videos/mock-video.mp4";
  }

  async getImportedVideos(_projectPath: string): Promise<string[]> {
    return ["videos/build-process.mp4", "videos/deploy-demo.mp4"];
  }

  async playVideo(
    _videoFile: string,
    _startTime: number,
    _endTime: number,
    _speed: number,
    _transitionActions?: import("../types").TransitionAction[],
  ): Promise<void> {
    // Mock: no-op in test mode
  }

  async closePlaybackWindow(): Promise<void> {
    // Mock: no-op in test mode
  }

  async saveScript(_projectPath: string, script: Script): Promise<void> {
    const index = this._scripts.findIndex((s) => s.id === script.id);
    if (index >= 0) {
      this._scripts[index] = structuredClone(script);
    } else {
      this._scripts.push(structuredClone(script));
    }
  }

  async loadScripts(_projectPath: string): Promise<Script[]> {
    return structuredClone(this._scripts);
  }

  async deleteScript(_projectPath: string, id: string): Promise<void> {
    this._scripts = this._scripts.filter((s) => s.id !== id);
  }
}
