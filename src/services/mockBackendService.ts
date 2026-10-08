import type { BackendService, FfmpegStatus, SnippetHotkey } from "./backendService";
import type { ProjectData, Script, StreamDeckButton, TextSnippet, VideoSnippet } from "../types";
import { streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

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
      streamDeckIcon: { kind: "preset", value: "code", background: "#111827", foreground: "#38bdf8" },
    },
    {
      id: "ts-2",
      title: "Console Log",
      description: "Adds a console.log statement",
      text: "console.log('Hello, world!');",
      hotkey: "CmdOrControl+Shift+2",
      delivery: "paste",
      streamDeckIcon: { kind: "emoji", value: "📋", background: "#172554", foreground: "#bfdbfe" },
    },
    {
      id: "ts-3",
      title: "Function Template",
      description: "Creates a function template",
      text: "function example() {\n  // TODO: implement\n}",
      hotkey: "CmdOrControl+Shift+3",
      delivery: "fast-type",
      typeDelay: 20,
      streamDeckIcon: { kind: "preset", value: "terminal", background: "#052e16", foreground: "#86efac" },
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
      streamDeckIcon: { kind: "preset", value: "play", background: "#1e1b4b", foreground: "#c4b5fd" },
      pauseStops: [
        {
          time: 12.5,
          label: "Explain build output",
          spotlight: {
            regions: [
              { type: "rectangle", x: 18, y: 22, width: 38, height: 24 },
            ],
          },
        },
      ],
      transitionActions: [
        { triggerAt: "end", action: "click", x: 350, y: 40 },
      ],
    },
  ],
};

export class MockBackendService implements BackendService {
  private data: ProjectData = structuredClone(FIXTURE_PROJECT);
  private _demoMode = false;
  private _automations: Script[] = [
    {
      id: "sc-1",
      title: "Build Demo Script",
      description: "Opens terminal and runs build",
      hotkey: "CmdOrControl+Shift+5",
      contributionGroups: [
        {
          id: "group-1",
          title: "Setup",
          contributions: [
            { id: "open-docs", kind: "openSite", title: "Open docs", url: "https://snipsy.dev" },
          ],
        },
      ],
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
    _projectPath: string | null,
    _videoFile: string,
    _startTime: number,
    _endTime: number,
    _speed: number,
    _transitionActions?: import("../types").TransitionAction[],
    _targetMonitor?: string,
    _endBehavior?: string,
    _hideCursor?: boolean,
    _backgroundColor?: string,
    _clickToPlay?: boolean,
    _muted?: boolean,
    _pauseStops?: import("../types").PauseStop[],
  ): Promise<void> {
    // Mock: no-op in test mode
  }

  async showPlaybackWindow(): Promise<void> {
    // Mock: no-op in test mode
  }

  async closePlaybackWindow(): Promise<void> {
    // Mock: no-op in test mode
  }

  async saveAutomation(_projectPath: string, script: Script): Promise<void> {
    const index = this._automations.findIndex((s) => s.id === script.id);
    if (index >= 0) {
      this._automations[index] = structuredClone(script);
    } else {
      this._automations.push(structuredClone(script));
    }
  }

  async loadAutomations(_projectPath: string): Promise<Script[]> {
    return structuredClone(this._automations);
  }

  async deleteAutomation(_projectPath: string, id: string): Promise<void> {
    this._automations = this._automations.filter((s) => s.id !== id);
  }

  async runAutomation(_projectPath: string, _scriptId: string): Promise<string> {
    return "Automation completed";
  }

  async checkFfmpeg(): Promise<FfmpegStatus> {
    return {
      available: false,
      ffmpeg: {
        available: false,
        path: null,
        version: null,
        error: "FFmpeg is unavailable in frontend-only mode.",
      },
      ffprobe: {
        available: false,
        path: null,
        version: null,
        error: "FFprobe is unavailable in frontend-only mode.",
      },
    };
  }

  async setFfmpegPaths(
    _ffmpegExecutablePath: string | null,
    _ffprobeExecutablePath: string | null,
  ): Promise<FfmpegStatus> {
    return this.checkFfmpeg();
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

  async listMonitors(): Promise<import("../types").MonitorInfo[]> {
    return [
      { name: "Primary Monitor", width: 1920, height: 1080, x: 0, y: 0, scaleFactor: 1 },
      { name: "Secondary Monitor", width: 2560, height: 1440, x: 1920, y: 0, scaleFactor: 1 },
    ];
  }

  async captureMonitorPreview(_monitorName: string): Promise<string> {
    // Return a tiny 1x1 white JPEG as base64 for tests
    return "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=";
  }

  async setStreamDeckActiveProject(_projectPath: string | null): Promise<void> {}

  async listStreamDeckButtons(_projectPath: string): Promise<StreamDeckButton[]> {
    return [
      ...this.data.textSnippets.map((snippet) => ({
        id: snippet.id,
        title: snippet.title,
        snippetType: "text" as const,
        hotkey: snippet.hotkey,
        iconDataUrl: streamDeckIconToDataUrl(snippet.streamDeckIcon, snippet.title, "text"),
      })),
      ...this.data.videoSnippets.map((snippet) => ({
        id: snippet.id,
        title: snippet.title,
        snippetType: "video" as const,
        hotkey: snippet.hotkey,
        iconDataUrl: streamDeckIconToDataUrl(snippet.streamDeckIcon, snippet.title, "video"),
      })),
      ...this._automations.map((script) => ({
        id: script.id,
        title: script.title,
        snippetType: "automation" as const,
        hotkey: script.hotkey ?? "",
        iconDataUrl: streamDeckIconToDataUrl(script.streamDeckIcon, script.title, "automation"),
      })),
    ];
  }

  async triggerStreamDeckButton(
    _projectPath: string,
    snippetId: string,
    snippetType: "text" | "video" | "automation",
  ) {
    if (snippetType === "automation") {
      const script = this._automations.find((candidate) => candidate.id === snippetId);
      if (!script) throw new Error(`automation not found: ${snippetId}`);
      await this.runAutomation(_projectPath, snippetId);
      return {
        id: script.id,
        title: script.title,
        snippetType,
        status: "completed" as const,
      };
    }
    const snippets = snippetType === "text" ? this.data.textSnippets : this.data.videoSnippets;
    const snippet = snippets.find((candidate) => candidate.id === snippetId);
    if (!snippet) throw new Error(`${snippetType} snippet not found: ${snippetId}`);
    if (snippetType === "text") {
      const textSnippet = snippet as TextSnippet;
      await this.deliverText(textSnippet.text, textSnippet.delivery, textSnippet.typeDelay);
    } else {
      await this.playVideo(
        _projectPath,
        (snippet as VideoSnippet).videoFile,
        (snippet as VideoSnippet).startTime,
        (snippet as VideoSnippet).endTime,
        (snippet as VideoSnippet).speed,
        (snippet as VideoSnippet).transitionActions,
        (snippet as VideoSnippet).targetMonitor,
        (snippet as VideoSnippet).endBehavior,
        (snippet as VideoSnippet).hideCursor,
        (snippet as VideoSnippet).backgroundColor,
        (snippet as VideoSnippet).clickToPlay,
        (snippet as VideoSnippet).muted,
        (snippet as VideoSnippet).pauseStops,
      );
    }
    return {
      id: snippet.id,
      title: snippet.title,
      snippetType,
      status: "completed" as const,
    };
  }

}
