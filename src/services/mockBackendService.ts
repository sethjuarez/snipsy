import type { BackendService, DemoModeOptions, HotkeyIssue, SnippetHotkey } from "./backendService";
import { normalizeHotkey } from "../utils/hotkeys";
import type { ArchiveSummary, Project, ProjectData, ProjectImage, Script, StreamDeckButton, TextSnippet, VideoSnippet } from "../types";
import { streamDeckIconToDataUrl } from "../utils/streamDeckIcons";

const UNSUPPORTED_IMAGE = "Only PNG and JPEG images are supported.";

/** Mirrors the backend's file-name slugs, e.g. "Screenshot 10.30.12.png" → "screenshot-10-30-12". */
function mockImageSlug(nameHint: string): string {
  const fileName = nameHint.split(/[\\/]/).pop() ?? "";
  // Lowercase last: some non-ASCII letters, like the Kelvin sign, lowercase to ASCII.
  const slug = fileName
    .replace(/\.(png|jpe?g)$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 48)
    .replace(/-+$/, "")
    .toLowerCase();
  if (!slug) return "image";
  return /^(con|prn|aux|nul|com\d|lpt\d)$/.test(slug) ? `${slug}-image` : slug;
}

/** The backend sniffs file contents; the mock checks base64 signatures or file extensions instead. */
function mockImageExtension(source: { dataBase64: string } | { path: string }): "png" | "jpg" {
  if ("dataBase64" in source) {
    if (source.dataBase64.startsWith("iVBORw0KGgo")) return "png";
    if (source.dataBase64.startsWith("/9j/")) return "jpg";
  } else {
    if (/\.png$/i.test(source.path)) return "png";
    if (/\.jpe?g$/i.test(source.path)) return "jpg";
  }
  throw new Error(UNSUPPORTED_IMAGE);
}

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
          zoom: { x: 37, y: 34, scale: 2 },
        },
        {
          time: 20,
          label: "Zoom on status",
          zoom: { x: 85, y: 10, scale: 3.5, durationMs: 600 },
        },
      ],
      transitionActions: [
        { triggerAt: "end", action: "click", x: 350, y: 40 },
      ],
    },
  ],
};

interface MockArchive {
  data: ProjectData;
  images: ProjectImage[];
  imageSources: [string, string][];
}

export class MockBackendService implements BackendService {
  private data: ProjectData = structuredClone(FIXTURE_PROJECT);
  private _demoMode = false;
  private _keepAwake = false;
  private archives = new Map<string, MockArchive>();
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
    this._projectImages = [];
    this._imageSources = new Map();
    return structuredClone(this.data);
  }

  async openProject(_path: string): Promise<ProjectData> {
    return structuredClone(this.data);
  }

  async saveProject(_path: string, name: string, description: string): Promise<Project> {
    const project = { name: name.trim(), description: description.trim() };
    if (!project.name) throw new Error("Project name cannot be empty.");
    this.data = { ...this.data, project };
    return { ...project };
  }

  async exportProject(_projectPath: string, archivePath: string): Promise<ArchiveSummary> {
    const fileCount =
      3 + this._automations.length + this._importedVideos.length + this._projectImages.length;
    this.archives.set(archivePath, {
      data: structuredClone(this.data),
      images: structuredClone(this._projectImages),
      imageSources: [...this._imageSources],
    });
    return { path: archivePath, fileCount };
  }

  async importProject(archivePath: string, destinationPath: string): Promise<ArchiveSummary> {
    const archived = this.archives.get(archivePath);
    if (archived) {
      this.data = structuredClone(archived.data);
      this._projectImages = structuredClone(archived.images);
      this._imageSources = new Map(archived.imageSources);
    }
    return { path: destinationPath, fileCount: 3 };
  }

  async selectArchiveSavePath(defaultName: string): Promise<string | null> {
    return `/mock/exports/${defaultName}`;
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

  async enterDemoMode(hotkeys: SnippetHotkey[], options?: DemoModeOptions): Promise<HotkeyIssue[]> {
    this._demoMode = true;
    this._keepAwake = options?.keepAwake ?? false;
    // Mirror the backend: the first snippet keeps a combo, later ones are skipped.
    const owners = new Map<string, string>();
    const issues: HotkeyIssue[] = [];
    for (const { id, hotkey } of hotkeys) {
      const key = normalizeHotkey(hotkey);
      if (!key) continue;
      const kept = owners.get(key);
      if (kept) issues.push({ snippetId: id, hotkey, kind: "duplicate", detail: kept });
      else owners.set(key, id);
    }
    return issues;
  }

  async exitDemoMode(): Promise<void> {
    this._demoMode = false;
    this._keepAwake = false;
  }

  /** Test helper: whether the last live session asked to keep the machine awake. */
  get keepAwakeActive(): boolean {
    return this._keepAwake;
  }

  async isDemoMode(): Promise<boolean> {
    return this._demoMode;
  }

  async deliverText(
    _text: string,
    _method: string,
    _typeDelay?: number,
    _typoChance?: number,
    _typeVariation?: number,
    _projectPath?: string,
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

  async saveVideoThumbnail(
    _projectPath: string,
    relativePath: string,
    _jpegBase64: string,
  ): Promise<string> {
    const video = this._importedVideos.find((v) => v.relativePath === relativePath);
    if (!video) throw new Error(`Video not found: ${relativePath}`);
    const stem = video.name.replace(/\.[^.]+$/, "");
    video.thumbnailPath = `/mock/project/videos/thumbnails/${stem}.jpg`;
    return video.thumbnailPath;
  }

  private _projectImages: ProjectImage[] = [];
  /** Source (file path or base64 data) → stored key; stands in for the backend's byte comparison. */
  private _imageSources = new Map<string, string>();
  private _imageFileCounter = 0;

  async importImage(_projectPath: string, sourceFilePath: string): Promise<ProjectImage> {
    return this.storeMockImage(
      `path:${sourceFilePath}`,
      sourceFilePath,
      mockImageExtension({ path: sourceFilePath }),
    );
  }

  async importImageData(_projectPath: string, name: string, dataBase64: string): Promise<ProjectImage> {
    return this.storeMockImage(`data:${dataBase64}`, name, mockImageExtension({ dataBase64 }));
  }

  private storeMockImage(source: string, nameHint: string, extension: "png" | "jpg"): ProjectImage {
    const existing = this._projectImages.find((image) => image.key === this._imageSources.get(source));
    if (existing) return structuredClone(existing);
    const slug = mockImageSlug(nameHint);
    let key = `${slug}.${extension}`;
    for (let n = 2; this._projectImages.some((image) => image.key === key); n++) {
      key = `${slug}-${n}.${extension}`;
    }
    const image: ProjectImage = {
      key,
      absolutePath: `/mock/project/images/${key}`,
      width: 640,
      height: 360,
      bytes: 2048,
    };
    this._projectImages.push(image);
    this._imageSources.set(source, key);
    return structuredClone(image);
  }

  async listProjectImages(_projectPath: string): Promise<ProjectImage[]> {
    const sorted = [...this._projectImages].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return structuredClone(sorted);
  }

  async deleteProjectImage(_projectPath: string, key: string): Promise<void> {
    if (!this._projectImages.some((image) => image.key === key)) {
      throw new Error(`Image not found: ${key}`);
    }
    this._projectImages = this._projectImages.filter((image) => image.key !== key);
    for (const [source, stored] of this._imageSources) {
      if (stored === key) this._imageSources.delete(source);
    }
  }

  async selectImageFile(): Promise<string | null> {
    this._imageFileCounter++;
    return `/mock/images/mock-image-${this._imageFileCounter}.png`;
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
}
