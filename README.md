# Snipsy

**Website & Docs:** [https://snipsy.dev](https://snipsy.dev)

A demoer's power tool for managing text and video snippets during live presentations. Snipsy lets you assign global hotkeys to pre-prepared text and video content so you can seamlessly insert code, trigger pre-recorded screen captures, and control playback speed — all while making it look like everything is happening live. It's built for presenters, demo authors, and tutorial creators, but is equally useful for anyone who wants quick hotkey-driven access to reusable snippets.

## Concepts

### Project

A **Project** is the top-level organizational unit in Snipsy. A project is stored as a folder on disk and contains all of its assets and configuration together. A project holds:

- **Text Snippets** — reusable blocks of text with assigned hotkeys.
- **Video Snippets** — pre-recorded screen capture clips with assigned hotkeys, playback speeds, and optional transition actions.
- **Automations** (Advanced mode) — ordered, reusable actions that can prepare a demo or open sites programmatically.

A user can have multiple projects (e.g., one per talk or demo). All snippet hotkeys within a project are global system-level hotkeys that are active whenever the project is in **demo mode**.

### Demo Mode

When a user activates demo mode for a project, all of that project's hotkeys become globally registered at the OS level. Pressing a hotkey from any application will trigger the associated snippet action. Demo mode is exited explicitly by the user (or via a dedicated hotkey).

## Features

### Text Snippets

- Each text snippet has a **title**, **description**, and the **text content**.
- Each text snippet has a globally assigned **hotkey**.
- When the hotkey is pressed (in demo mode), the text is delivered to whatever application currently has focus, at the current cursor position.
- The user can choose the delivery method per snippet:
  - **Fast-type**: Simulates keystrokes to type the text character by character (useful when you want it to look like you're typing live).
  - **Paste**: Inserts the text via the system clipboard (instant, useful for large blocks).

### Video Snippets

- Each video snippet references a **video file** (stored in the project folder) and defines a **time range** (start/end) within that file.
- Each video snippet has a **title**, **description**, **hotkey**, and **playback speed** (e.g., 1x, 2x, 3x).
- When the hotkey is pressed (in demo mode):
  1. The video plays **fullscreen with no UI controls** — no scrubber, no play/pause buttons, no window chrome. It looks like the action is happening live on the user's screen.
  2. The video plays at the configured speed.
  3. When playback completes, the fullscreen overlay disappears and the user is back where they left off.
- **Transition actions** (optional): A video snippet can define actions to execute *while the video is playing* or *just before the video ends*, so that the underlying desktop state matches what the video shows. For example:
  - A video shows a long-running build completing and then clicking a browser tab.
  - While the video plays, Snipsy executes an automation action underneath to click that same browser tab.
  - When the video overlay disappears, the real screen matches the final frame of the video — creating a seamless transition.

#### Importing Video

- A user can import one or more video files into a project.
- A timeline view (similar to video editing software) allows the user to scrub through imported video, select time ranges, and create video snippets from those ranges.
- Each snippet created from the timeline gets its own title, description, hotkey, speed, and optional transition actions.

### Automations

- A project can contain **automations** — ordered contribution groups that run repeatable setup actions.
- A contribution is an extensible action someone can add to an automation. Contributions run in group order, and each contribution is idempotent within a run.
- The first built-in contribution is `openSite`, which opens an `http://` or `https://` URL in the default browser.
- When an automation is executed, Snipsy:
  1. Runs each contribution group in order.
  2. Skips duplicate contribution idempotency keys that already ran in the same automation execution.
- Automations can be edited and re-run from the UI, global hotkeys, or Stream Deck buttons.
- Automations are stored as human-editable JSON files within the project folder.

## Data Model

### Project Folder Structure

Each project is a folder with the following layout:

```text
my-demo-project/
├── project.json          # Project metadata (name, description, settings)
├── text-snippets.json    # Array of text snippet definitions
├── video-snippets.json   # Array of video snippet definitions
├── automations/          # Automation definitions (Advanced mode)
│   ├── setup-build.json
│   └── deploy-flow.json
└── videos/               # Video asset files
    ├── build-process.mp4
    └── deploy-demo.mp4
```

All configuration is stored as **JSON files**, making projects human-readable, version-controllable, and editable by hand when needed.

### Text Snippet Schema

```json
{
  "id": "unique-id",
  "title": "Import Statement",
  "description": "Adds the React import to the top of the file",
  "text": "import React from 'react';",
  "hotkey": "Ctrl+Shift+1",
  "delivery": "fast-type",
  "typeDelay": 30
}
```

- `delivery`: `"fast-type"` or `"paste"`.
- `typeDelay` (optional, fast-type only): Milliseconds between simulated keystrokes.

### Video Snippet Schema

```json
{
  "id": "unique-id",
  "title": "Build Process",
  "description": "Shows the build completing in 3x speed",
  "videoFile": "videos/build-process.mp4",
  "startTime": 12.5,
  "endTime": 45.0,
  "hotkey": "Ctrl+Shift+2",
  "speed": 3.0,
  "pauseStops": [
    {
      "time": 18.5,
      "label": "Wait for presenter"
    }
  ],
  "transitionActions": [
    {
      "triggerAt": "end",
      "action": "click",
      "x": 350,
      "y": 40
    }
  ]
}
```

- `startTime` / `endTime`: Seconds within the video file.
- `speed`: Playback multiplier (1.0 = normal).
- `pauseStops` (optional): Source-video timestamps where playback pauses on the designated frame until the presenter clicks or presses Space. Stops still target the same frame when playback speed is changed.
- `transitionActions` (optional): Array of automation actions to execute during/at the end of playback for seamless transitions.

### Automation Schema (Advanced Mode)

```json
{
  "id": "unique-id",
  "title": "Setup Build Demo",
  "description": "Opens terminal and runs build command",
  "hotkey": "Ctrl+Shift+3",
  "contributionGroups": [
    {
      "id": "group-1",
      "title": "Sites",
      "contributions": [
        {
          "id": "open-docs",
          "kind": "openSite",
          "title": "Open docs",
          "url": "https://snipsy.dev"
        }
      ]
    }
  ]
}
```

Supported contribution kinds:

- `openSite` — Open an `http://` or `https://` URL in the default browser.

Open-site contributions are idempotent by URL within one automation run. If the same normalized URL appears in multiple groups, Snipsy opens it once and skips later duplicates.

## Architecture

### Framework

- **Tauri** (Rust-based, see: <https://tauri.app/start/>) for the desktop shell, system APIs, and backend logic.
- **React** (TypeScript) for the frontend UI, bundled via Vite.

### Key Rust Crates / Dependencies

| Concern | Technology | Purpose |
|---|---|---|
| Desktop shell | `tauri` | Window management, IPC, system tray, bundling |
| Global hotkeys | `global-hotkey` (or Tauri's built-in global shortcut API) | Register/unregister system-wide hotkeys |
| Input simulation | `enigo` | Simulate keyboard and mouse input for fast-type delivery and transition actions |
| Video playback | HTML `<video>` element + FFmpeg for transcoding | Fullscreen chromeless playback of video snippets |
| File system | `std::fs` + `serde_json` | Read/write project JSON files and manage video assets |
| Async runtime | `tokio` | Async operations for automation execution and file I/O |
| Observability | Auditaur | Local-first telemetry for frontend errors, console logs, Tauri events, IPC, traces, and full-app drive/smoke workflows |

### Frontend Stack

- **React 18+** with TypeScript.
- **React Router** for multi-window routing (main app vs playback window).
- **Zustand** for lightweight state management with selective subscriptions.
- **Vite** for dev server and production bundling.
- **Tailwind CSS v4** with a semantic design token system — typography scale (`text-2xs` through `text-heading`), radius, motion, and color tokens defined in `src/styles.css` and bridged via `@theme`.
- A custom timeline component for video clip editing with draggable playhead.
- **Accessibility**: ARIA attributes (`aria-current`, `aria-label`, `aria-modal`), global `focus-visible` styles, `prefers-reduced-motion` support, and focus trapping in modals via `useFocusTrap` hook.
- **Shared UI components**: `ErrorBoundary` (render error recovery), `ConfirmDialog` (styled replacement for `window.confirm()`), `EmptyState` (placeholder for empty lists).
- **Observability**: `@auditaur/api` captures frontend logs, errors, Tauri invokes, Tauri events, and development drive-bridge telemetry for Auditaur.

### Global Hotkey System

All hotkeys are **global OS-level shortcuts** registered through Tauri's global shortcut API (or the `global-hotkey` crate). The flow:

1. User opens a project and enters **demo mode**.
2. All hotkeys defined in that project's text snippets, video snippets, and automations are registered as global shortcuts.
3. When a global hotkey fires:
   - **Text snippet**: The Rust backend uses `enigo` to either simulate keystrokes (fast-type) or write to the system clipboard and simulate Ctrl+V (paste) in the currently focused application.
   - **Video snippet**: The Rust backend signals the frontend to open a frameless, fullscreen, always-on-top window that plays the video segment. Simultaneously, any transition actions are scheduled and executed via `enigo`.
   - **Automation**: The Rust backend runs contribution groups in order.
4. When demo mode is exited, all global shortcuts are unregistered.

### Video Playback System

Video playback uses a **dedicated frameless Tauri window**:

- The window is created as always-on-top, fullscreen, with no decorations (no title bar, no borders).
- The frontend renders a `<video>` element sized to fill the screen, with all default controls hidden.
- Playback starts at the snippet's `startTime`, plays at the configured `speed`, and stops at `endTime`.
- When playback completes, the window is closed, returning focus to whatever was underneath.
- If `transitionActions` are defined, they are executed by the Rust backend on a timed schedule relative to playback progress.

### Automation Execution

The automation engine runs entirely on the Rust backend:

1. The user triggers an automation run from the UI, a hotkey, or a Stream Deck button.
2. The backend runs contribution groups in stored order.
3. Contributions inside each group run in stored order.
4. Duplicate contribution idempotency keys are skipped within the same automation execution.

### Cross-Platform

- Tauri + React supports Windows, macOS, and Linux.
- `enigo` supports input simulation on all three platforms.
- FFmpeg is cross-platform.
- Global hotkey registration uses platform-native APIs (abstracted by Tauri/`global-hotkey`).
- Project folders are plain files on disk — fully portable across operating systems.
