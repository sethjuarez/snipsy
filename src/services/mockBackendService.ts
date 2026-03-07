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

  private _importedVideos: import("../types").ImportedVideo[] = [
    { name: "build-process.mp4", relativePath: "videos/build-process.mp4", absolutePath: "/mock/project/videos/build-process.mp4", thumbnailPath: null },
    { name: "deploy-demo.mp4", relativePath: "videos/deploy-demo.mp4", absolutePath: "/mock/project/videos/deploy-demo.mp4", thumbnailPath: null },
  ];

  async importVideo(
    _projectPath: string,
    _sourceFilePath: string,
  ): Promise<string> {
    const name = `mock-video-${this._importedVideos.length + 1}.mp4`;
    this._importedVideos.push({
      name,
      relativePath: `videos/${name}`,
      absolutePath: `/mock/project/videos/${name}`,
      thumbnailPath: null,
    });
    return `videos/${name}`;
  }

  async getImportedVideos(_projectPath: string): Promise<import("../types").ImportedVideo[]> {
    return structuredClone(this._importedVideos);
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

  async runScript(_projectPath: string, _scriptId: string): Promise<string> {
    return "videos/mock-output.mp4";
  }

  async checkFfmpeg(): Promise<boolean> {
    return false; // Mock: FFmpeg not available in test mode
  }

  async installFfmpeg(): Promise<string> {
    return "FFmpeg installed successfully (mock).";
  }

  async activateDemoTray(): Promise<void> {
    // Mock: no-op in test mode
  }

  async deactivateDemoTray(): Promise<void> {
    // Mock: no-op in test mode
  }

  async isElevated(): Promise<boolean> {
    return true; // Mock: pretend elevated so UI doesn't show warning
  }

  async relaunchAsAdmin(): Promise<void> {
    // Mock: no-op in test mode
  }

  private _importCounter = 0;

  async selectVideoFile(): Promise<string | null> {
    // Mock: return a fake file path to allow testing the import flow
    this._importCounter++;
    return `/mock/videos/mock-video-${this._importCounter}.mp4`;
  }

  async deleteVideo(_projectPath: string, relativePath: string): Promise<void> {
    this._importedVideos = this._importedVideos.filter((v) => v.relativePath !== relativePath);
  }

  async getVideoFps(_videoPath: string): Promise<number> {
    return 30;
  }
}
