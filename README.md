# Snipsy

**Website & Docs:** [https://snipsy.dev](https://snipsy.dev)

A demoer's power tool for managing text and video snippets during live presentations. Snipsy lets you assign global hotkeys to pre-prepared text and video content so you can seamlessly insert code, trigger pre-recorded screen captures, and control playback speed — all while making it look like everything is happening live. It's built for presenters, demo authors, and tutorial creators, but is equally useful for anyone who wants quick hotkey-driven access to reusable snippets.

## Concepts

### Project

A **Project** is the top-level organizational unit in Snipsy. A project is stored as a folder on disk and contains all of its assets and configuration together. A project holds:

- **Text Snippets** — reusable blocks of text with assigned hotkeys.
- **Video Snippets** — pre-recorded screen capture clips with assigned hotkeys, playback speeds, and optional transition actions.
- **Automations** (Advanced mode) — ordered, reusable actions that can prepare a demo or open sites programmatically.

A user can have multiple projects (e.g., one per talk or demo). **Export project** (sidebar footer or command palette) zips the whole folder, videos included, into a .snipsy.zip; **Import Project** on the welcome screen unzips one into an empty folder and opens it. All snippet hotkeys within a project are global system-level hotkeys that are active whenever the project is in **demo mode**.

### Demo Mode

When a user activates demo mode for a project, all of that project's hotkeys become globally registered at the OS level. Pressing a hotkey from any application will trigger the associated snippet action. Demo mode is exited explicitly by the user (or via a dedicated hotkey). **Keep awake** (a checkbox beside Start, on by default) keeps the machine from sleeping while live and, on Windows, nudges the mouse 1px and back after 50s idle so presence (e.g. Teams) stays Available.

## Features

### Text Snippets

- Each text snippet has a **title**, **description**, and the **text content**.
- Each text snippet has a globally assigned **hotkey**.
- When the hotkey is pressed (in demo mode), the text is delivered to whatever application currently has focus, at the current cursor position.
- The user can choose the delivery method per snippet:
  - **Fast-type**: Simulates keystrokes to type the text character by character (useful when you want it to look like you're typing live).
  - **Paste**: Inserts the text via the system clipboard (instant, useful for large blocks).
- Fast-type can look more human. Both settings are re-randomized on every run, and the final text always matches the snippet:
  - **Typos**: Chance (0–20%) that a letter or digit is mistyped (nearby key, doubled, swapped, or skipped), then fixed with Backspace.
  - **Rhythm Variation**: How much (0–100%) key timing drifts, with short pauses after spaces and line breaks.
- Fast-type snippets can embed **images** with `{{image:<key>}}` (e.g. `{{image:logo.png}}`). Each image is pasted from the clipboard at that point; images are never humanized. Paste delivery can't include images.
  - Manage images on the **Images** tab under Snippets (import, copy reference, delete). In the snippet editor, **Insert image**, **Import image…**, or paste an image into the text to add it.
  - The editor and pre-demo checklist flag malformed, missing, or paste-mode references.
- Snippets can include **tokens** that Snipsy fills in when it delivers. Use **Insert token…** in the editor to add them:

  | Token | Becomes |
  | --- | --- |
  | `{{cursor}}` | Where the caret ends up after delivery (Snipsy presses Left). One per snippet. |
  | `{{var:<name>}}` | The value of a project variable (**Setup → Variables**). |
  | `{{date}}` / `{{date:<preset>}}` | Today's date. Presets: `short` (the default, locale short date), `long`, `month`, `weekday` (locale-aware), `iso` (`2025-03-14`), `us` (`03/14/2025`), `eu` (`14/03/2025`), `year`. |
  | `{{time}}` | The current time in the locale's short format. |
  | `{{clipboard}}` | The clipboard text from *before* Snipsy touched it. |
  | `{{random:<N>}}` | N (1–64) random lowercase letters and digits. The same `N` repeats the same value across snippets for the whole demo session; outside demo mode it's new on every run. |

  - Tokens must match exactly: lowercase, no spaces inside the braces. Anything else stays literal, so `{{ cursor }}`, `{{name}}`, `{{count}}`, JSX `style={{cursor:'pointer'}}`, and `${{ secrets.X }}` are typed as written.
  - A known token with a bad argument (an unknown date preset, an undefined variable, `{{random:0}}`) is an error. The editor and pre-demo checklist show it, and delivery refuses to start, so nothing is half-typed.
  - **Type literally** turns tokens off for a snippet. There's no escape syntax.
  - `{{cursor}}` counts characters after it, so editors that auto-indent or auto-close brackets can leave the caret in the wrong place. It can't come before an image.
- **Clipboard protection.** Paste delivery and pasted images use the clipboard. Snipsy saves the clipboard once per delivery and puts it back afterward (all formats on Windows; text and images elsewhere). If you copy something while Snipsy is delivering, your copy wins and nothing is restored. On Windows, Snipsy's own clipboard writes stay out of clipboard history (Win+V) and cloud sync.

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

- A project can contain **automations** — ordered steps (stored as contribution groups) that run repeatable setup actions.
- A contribution is an extensible action someone can add to an automation. Contributions run in group order, and each contribution is idempotent within a run.
- The first built-in contribution is `openSite`, which opens an `http://` or `https://` URL in the default browser.
- An Open site URL and title can use `{{var:<name>}}`, `{{date…}}`, `{{time}}`, and `{{random:N}}` (each action has an **Insert token** menu). `{{cursor}}`, `{{clipboard}}`, and `{{image:…}}` only work in snippet text and are flagged in the editor and pre-demo checklist.
- Before opening anything, a run resolves every token, inserting values as written (a value is never re-parsed), and checks that each resolved URL is still `http://` or `https://`. An undefined variable or a non-web URL fails the run with the step and action that caused it, and nothing opens.
- When an automation is executed, Snipsy:
  1. Runs each contribution group in order.
  2. Skips sites whose resolved URL already opened in the same automation execution.
- Automations can be edited and re-run from the UI, global hotkeys, or Stream Deck buttons.
- The editor reorders steps and actions with move buttons, insert-below, and drag and drop (pointer or keyboard), including moving actions between steps. Order in the editor is execution order.
- Automations are stored as human-editable JSON files within the project folder.

### Variables View

- **Setup → Variables** in the sidebar is the one place to edit project variables. The table shows each variable's name, value, description, and how many snippets and automations use it (hover for the list). Raw (**Type literally**) snippets don't count.
- Names that snippets or automations use but the project doesn't define are listed at the top with an **Add** button each, and the sidebar item shows a warning marker. When the pre-demo checklist finds an undefined variable, its **Open Variables** button comes here.
- The sidebar shows how many variables the project has.
- Stream Deck key titles, clip labels, and snippet, automation, and step names are display text and stay as written. Variables resolve in text Snipsy types and in Open site URLs and action titles when the automation runs.

### Hotkeys View

- **Hotkeys** in the sidebar lists every text snippet, clip, and automation with its hotkey and what demo mode will do with it: **Ready**/**Armed**, **Duplicate** (the first item listed wins), **Invalid**, **No hotkey** (or **Optional** for automations), or **Not registered** when the OS refused it during a live demo.
- **Change** captures a new hotkey in place (conflicts are rejected), **Remove** clears an automation's optional hotkey, and **Open** jumps to the item's editor. **Problems only** filters the list.

### Command Palette & Shortcuts

- Press **Ctrl/Cmd+K** (or the title-bar search) to jump anywhere, create items, start or stop a demo, and edit, play, or run any snippet, clip, or automation.
- **Ctrl/Cmd+/** lists in-app shortcuts. **Ctrl/Cmd+,** opens Settings, and **Ctrl/Cmd+S** saves the open editor.
- These only work while Snipsy is focused; snippet hotkeys stay global and only listen in demo mode.

### Settings

- The title-bar gear (or **Ctrl/Cmd+,**) opens Settings, with or without a project. Search filters its sections.
- **Project** (rename the open project or edit its description, also **Rename project** in the palette; project variables live in **Setup → Variables**), **Appearance** (System/Light/Dark theme), **Demo** (pre-demo checklist on or off; **Restore clipboard after paste**, on by default, and the **restore delay**, 100–5000 ms, default 500, which slow targets like browsers or remote sessions may need raised), **Permissions** (restart as administrator on Windows), **Updates** (version, check, install), **Stream Deck**, and **Shortcuts**.
- The title-bar shield, shown when Snipsy isn't elevated, opens Permissions.
- App-wide settings that the backend needs (clipboard restore) live in `settings.json` in Snipsy's app data folder, not in a project.

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
├── images/               # PNG/JPEG images embedded in text snippets
│   └── logo.png
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
  "typeDelay": 30,
  "typoChance": 3,
  "typeVariation": 40
}
```

- `raw` (optional): `true` types the text exactly as written, without filling in tokens. Omitted means tokens are filled in.

- `delivery`: `"fast-type"` or `"paste"`.
- `typeDelay` (optional, fast-type only): Milliseconds between simulated keystrokes.
- `typoChance` (optional, fast-type only): Percent chance (0–20) that a letter or digit is mistyped and corrected. Omitted means off.
- `typeVariation` (optional, fast-type only): Percent (0–100) that key timing drifts from `typeDelay`. Omitted means off.
- `shiftEnter` (optional, fast-type only): `true` types line breaks as Shift+Enter, so chat apps add a line instead of sending. Omitted means Enter.
- `text` may contain `{{image:<key>}}` references to files in `images/` (lowercase `a-z0-9-` name, `.png`/`.jpg`/`.jpeg`). Fast-type only.
- `text` may also contain the tokens listed under [Text Snippets](#text-snippets). Other `{{…}}` text is typed literally.

### Project Schema

```json
{
  "name": "Contoso keynote",
  "description": "Build 2025 demo",
  "tokenGrammar": 1,
  "variables": [
    { "name": "host", "value": "contoso.example.com", "description": "Demo tenant" }
  ]
}
```

- `variables` (optional): Values for `{{var:<name>}}`. Names are lowercase `a-z0-9`, `-`, or `_`, start with a letter or digit, are at most 64 characters, and must be unique. Values are inserted as written.
- `tokenGrammar` (optional): The token version the project was saved with. Snipsy warns in the pre-demo checklist when a project comes from a newer version. Unknown fields are kept when Snipsy saves.

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
      "label": "Wait for presenter",
      "zoom": { "x": 72, "y": 30, "scale": 2.5 }
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
  - `spotlight` (optional): Rectangle highlight regions (percent of the video frame) with optional style.
  - `zoom` (optional): ZoomIt-style magnification while paused. `x`/`y` pick the zoom point (percent of the video frame), which stays fixed on screen while the video grows around it (ZoomIt-style smart anchoring shifts it only as needed to avoid empty bars), `scale` sets magnification (1.25–6, default 2), and `durationMs` sets the ease in/out (0–2000, default 400). Playback pauses exactly on the moment, holds a still copy of that frame for a beat, then zooms the still (avoiding WebView2 video-layer artifacts). Edit it in the clip editor's **Zoom** mode: click or drag to pick the point, scroll or use the slider to zoom.
  - **Bulk import:** in the clip editor, click **Paste list** in Moments or press Ctrl+V outside a text field. Paste either **timecodes** (video-file times, e.g. `0:29 Setup`, `1:03:07`, `00:01:03:15` frames) or **section lengths** (e.g. `29 seconds`, `1 min 3 sec`, `1m3s`, `PT1M3S`), one per line or comma-separated. Section lengths are added up from the clip start, with a moment between each section; the last section runs to the clip end. The type is detected (unit words or a non-increasing list mean section lengths) and can be switched. Bullets, numbering, labels and ranges (`0:00-0:29 Intro`) are understood; unreadable or out-of-clip lines are flagged and skipped. Applying replaces all existing moments; until you save, leaving the editor with **Discard changes** restores them.
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
| Video playback | HTML `<video>` element; thumbnails captured in the webview, FPS read from MP4/MOV metadata (no FFmpeg) | Fullscreen chromeless playback of video snippets |
| File system | `std::fs` + `serde_json` | Read/write project JSON files and manage video assets |
| Project archives | `zip` | Export/import a project folder as a `.zip` (videos stored, JSON deflated, zip-slip guarded) |
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
4. Duplicate site URLs are skipped within the same automation execution.

### Cross-Platform

- Tauri + React supports Windows, macOS, and Linux.
- `enigo` supports input simulation on all three platforms.
- Video features need no external tools; FFmpeg is not required.
- Global hotkey registration uses platform-native APIs (abstracted by Tauri/`global-hotkey`).
- Project folders are plain files on disk — fully portable across operating systems.
