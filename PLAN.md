# Snipsy — Implementation Plan

Reference `README.md` for the full product spec, data model, and schemas.
Reference `.github/copilot-instructions.md` for engineering principles and testing strategy.

Execute phases in order. Each phase must compile, pass tests, and be committed before moving to the next.

### Reference Project

If you get stuck on Tauri v2 setup, config, capabilities, Rust module structure, Playwright config, or any infrastructure question, consult the existing Tauri v2 project at **`D:\projects\cutready`**. It is a working Tauri v2 + React + TypeScript + Vite app with:

- `src-tauri/Cargo.toml` — Tauri v2 dependency setup, `lib` + `cdylib` + `staticlib` crate types.
- `src-tauri/tauri.conf.json` — full config with window definitions, security/CSP, asset protocol, bundle settings.
- `src-tauri/capabilities/default.json` — capability permissions (core, fs, dialog, global-shortcut, window-state, etc.).
- `src-tauri/build.rs` — standard `tauri_build::build()` build script.
- `src-tauri/src/main.rs` + `lib.rs` — `lib.rs` defines modules + `run()`, `main.rs` calls `lib::run()`.
- `vite.config.ts` — Vite config with `TAURI_DEV_HOST` handling and `src-tauri` ignored in watch.
- `tsconfig.json` — strict TypeScript config targeting ES2020.
- `playwright.config.ts` — Playwright config with `webServer` pointing to `npm run dev`, Chromium-only.
- `index.html` — standard Vite entry with `<script type="module" src="/src/main.tsx">`.
- `src/main.tsx` — shows how to detect `window.__TAURI_INTERNALS__` and install dev mocks when Tauri is absent.
- `src/services/`, `src/stores/`, `src/types/`, `src/components/` — folder structure to follow.

Use it as a living reference for file structure, config format, and patterns — but adapt naming and features for Snipsy.

### Prerequisites

Before starting, verify these are installed:

```
node --version   # must be >= 20
npm --version    # must be >= 10
rustc --version  # must be latest stable
cargo --version
```

If any are missing, install them before proceeding.

### Key Tech Decisions

- **Tailwind CSS v4** (CSS-based config)
- **React Router** for all view routing (main app + playback window)
- **Zustand** for state management
- **UUID v4** for entity IDs (`crypto.randomUUID()` in TS, `uuid` crate in Rust)
- **Hotkeys**: stored in Tauri accelerator format (`CmdOrControl+Shift+1`); Rust backend normalizes
- **System tray**: app minimizes to tray during demo mode
- **npm** as package manager, latest stable Rust + Node
- Commit after each completed sub-step

### Git Workflow

- Commit and push after each completed sub-step.
- The user's git config has commit signing enabled by default. Use `git -c commit.gpgsign=false commit` to bypass signing. Commits will be back-signed later.
- After every commit, push: `git push origin main`.
- Use **Conventional Commits** for semver compatibility:
  - `feat:` — new feature (minor version bump)
  - `fix:` — bug fix (patch version bump)
  - `build:` — build system / scaffold changes (no version bump)
  - `test:` — adding or updating tests (no version bump)
  - `docs:` — documentation only (no version bump)
  - `chore:` — maintenance (no version bump)
  - Add `!` after the type for breaking changes: `feat!:` (major version bump)

---

## Phase 1: Project Scaffold

Refs:

- Tauri v2 getting started: <https://tauri.app/start/>
- Tauri v2 config reference: <https://tauri.app/reference/config/>
- Tauri v2 create project: <https://tauri.app/start/create-project/>
- Vite: <https://vite.dev/guide/>
- Tailwind CSS v4 + Vite: <https://tailwindcss.com/docs/installation/vite>

### 1.1 Initialize Tauri v2 + React + TypeScript + Vite

The repo already has `README.md`, `PLAN.md`, and `.github/` — do NOT delete these.

Scaffold the Tauri app into the existing directory. Because `npm create tauri-app` is interactive, set it up manually:

1. Create a `.gitignore` with at minimum:

   ```
   node_modules/
   dist/
   src-tauri/target/
   ```

2. Initialize `package.json` if it doesn't exist: `npm init -y`.
3. Install Vite + React + TypeScript:

   ```
   npm install react react-dom
   npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react
   ```

4. Create the Vite config (`vite.config.ts`), `tsconfig.json`, `tsconfig.node.json`, `index.html`, and `src/main.tsx` + `src/App.tsx` matching a standard Vite React-TS template.
5. Initialize the Tauri v2 Rust backend. Since `npx tauri init` is interactive, create the `src-tauri/` directory structure manually:

   ```
   npm install -D @tauri-apps/cli@latest
   ```

   Then create these files by hand:
   - `src-tauri/Cargo.toml` — with `tauri` v2, `tauri-build` as build dependency.
   - `src-tauri/tauri.conf.json` — set `productName: "Snipsy"`, `identifier: "dev.snipsy.app"`, `build.devUrl: "http://localhost:5173"`, `build.frontendDist: "../dist"`.
   - `src-tauri/src/main.rs` (or `lib.rs` + `main.rs`) — minimal Tauri app entry point.
   - `src-tauri/build.rs` — standard Tauri build script.
   - `src-tauri/icons/` — generate default icons by running `npx tauri icon` (requires a source PNG at `app-icon.png`, create a 1024x1024 placeholder first), or copy the icon set from `D:\projects\cutready\src-tauri\icons\` and rename as needed.
6. Install Tauri JS API: `npm install @tauri-apps/api@latest`.
7. Add scripts to `package.json`:

   ```json
   "scripts": {
     "dev": "vite",
     "build": "tsc && vite build",
     "tauri": "tauri"
   }
   ```

8. Verify: `npm run dev` starts the Vite dev server. `npm run tauri dev` launches the Tauri window.
9. Commit and push: `git add -A && git -c commit.gpgsign=false commit -m "build: scaffold Tauri v2 + React + TypeScript + Vite" && git push origin main`.

### 1.2 Add Tailwind CSS v4

1. Install: `npm install -D tailwindcss @tailwindcss/vite`.
2. Add the Tailwind Vite plugin to `vite.config.ts`.
3. Replace CSS file contents with `@import "tailwindcss";`.
4. Add a Tailwind class to `App.tsx` (e.g., `<h1 className="text-3xl font-bold">Snipsy</h1>`).
5. Verify: `npm run dev` — the styled heading renders.
6. Commit: `git add -A && git -c commit.gpgsign=false commit -m "build: add Tailwind CSS v4" && git push origin main`.

### 1.3 Add React Router + Zustand

1. Install: `npm install react-router zustand`.
2. Set up a `BrowserRouter` in `src/main.tsx` with routes: `/` → `App`, `/playback` → placeholder `Playback` component.
3. Create `src/stores/projectStore.ts` with a Zustand store: `useProjectStore` with a `projectName: string | null` field.
4. Render `projectName` from the store in `App.tsx`.
5. Verify: `npm run dev` — root route renders, navigating to `/playback` renders the placeholder.
6. Commit: `git add -A && git -c commit.gpgsign=false commit -m "build: add React Router + Zustand" && git push origin main`.

### 1.4 Add Playwright

1. Install: `npm install -D @playwright/test`.
2. Run: `npx playwright install --with-deps chromium` (only Chromium needed for now).
3. Create `playwright.config.ts` with `webServer` pointing to `npm run dev` on port 5173.
4. Create `tests/smoke.spec.ts`: navigate to `/`, assert the page contains "Snipsy".
5. Verify: `npx playwright test` passes.
6. Commit: `git add -A && git -c commit.gpgsign=false commit -m "build: add Playwright with smoke test" && git push origin main`.

### 1.5 Add Rust test scaffold

1. Add a `#[cfg(test)]` module in `src-tauri/src/lib.rs` (or `main.rs`) with one trivial test.
2. Verify: `cd src-tauri && cargo test`.
3. Commit: `git add -A && git -c commit.gpgsign=false commit -m "build: add Rust test scaffold" && git push origin main`.

---

## Phase 2: Data Model & Service Layer

Refs:

- Tauri v2 commands (IPC): <https://tauri.app/develop/calling-rust/>
- Tauri v2 command reference: <https://tauri.app/reference/javascript/core/>
- serde: <https://serde.rs/>
- Zustand: <https://zustand.docs.pmnd.rs/>

### 2.1 Rust data types

In `src-tauri/src/`, create a `models.rs` module with serde-serializable structs matching the README schemas:

- `Project` — `{ name: String, description: String }`
- `TextSnippet` — `{ id, title, description, text, hotkey, delivery, type_delay? }`
- `VideoSnippet` — `{ id, title, description, video_file, start_time, end_time, hotkey, speed, transition_actions? }`
- `TransitionAction` — `{ trigger_at, action, x?, y? }`
- `Script` — `{ id, title, description, steps, output_video }`
- `ScriptStep` — enum covering launch, type, keypress, click, wait, scroll

Add `serde`, `serde_json`, and `uuid` (with `v4` feature) to `src-tauri/Cargo.toml`.

Add unit tests: round-trip serialize/deserialize each struct to/from JSON matching the README examples.

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: Rust data model structs with serde + tests" && git push origin main`.

### 2.2 TypeScript types

In `src/types/`, create mirrored TypeScript interfaces for all the above structs. Use the exact same field names (camelCase as shown in README schemas).

1. Verify: `npx tsc --noEmit`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: TypeScript type definitions" && git push origin main`.

### 2.3 Project I/O — Rust commands

In `src-tauri/src/`, create a `commands.rs` module with Tauri commands:

- `create_project(path, name, description)` — creates folder + `project.json` + empty `text-snippets.json` + empty `video-snippets.json`.
- `open_project(path)` — reads and returns project metadata + all snippets.
- `save_text_snippets(path, snippets)` — writes `text-snippets.json`.
- `save_video_snippets(path, snippets)` — writes `video-snippets.json`.

Register all commands in the Tauri builder. Add integration tests that create a temp dir, call the commands, and verify the resulting JSON files on disk.

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: project I/O Tauri commands with integration tests" && git push origin main`.

### 2.4 Frontend service abstraction

In `src/services/`, create:

- `BackendService` — TypeScript interface with methods matching the Tauri commands: `createProject()`, `openProject()`, `saveTextSnippets()`, `saveVideoSnippets()`.
- `TauriBackendService` — implementation that calls `@tauri-apps/api/core invoke()`.
- `MockBackendService` — implementation that operates on in-memory test fixture data.
- `createBackendService()` — factory that returns `TauriBackendService` if `window.__TAURI_INTERNALS__` exists, otherwise `MockBackendService`.

Write unit tests for `MockBackendService` to confirm it returns valid fixture data.

1. Verify: `npx tsc --noEmit` and `npx playwright test` (if tests added).
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: frontend service abstraction layer" && git push origin main`.

### 2.5 Test fixtures

Create `tests/fixtures/` with JSON files:

- `empty-project/` — `project.json` + empty snippet arrays.
- `text-only-project/` — `project.json` + 3 text snippets with varying delivery modes.
- `full-project/` — `project.json` + text snippets + video snippets.

These are used by both `MockBackendService` and Rust integration tests.

1. Verify: fixture JSON files are valid — `node -e "for (const f of require('fs').readdirSync('tests/fixtures', {recursive:true}).filter(f=>f.endsWith('.json'))) JSON.parse(require('fs').readFileSync('tests/fixtures/'+f))"` (no errors).
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "test: test fixture data" && git push origin main`.

---

## Phase 3: Text Snippet UI & CRUD

### 3.1 Project store & routing

- Expand the Zustand store (`useProjectStore`) to hold the currently open project, its text snippets, and video snippets.
- Wire it to the service layer via `createBackendService()`.
- Routes: `/` (welcome/open project), `/project` (project editor with snippet list), `/playback` (video overlay).
- On app mount, if no project is open, show a welcome/open-project screen.

1. Verify: `npm run dev` — root route shows welcome screen. `npx tsc --noEmit`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: project store + routing" && git push origin main`.

### 3.2 Text snippet list view

- Component that lists all text snippets (title, hotkey, delivery mode).
- Empty state when no snippets exist.
- Playwright test: renders mock fixture snippets in frontend-only mode.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: text snippet list view + Playwright test" && git push origin main`.

### 3.3 Text snippet create/edit form

- Form with fields: title, description, text content (multi-line), hotkey (key capture widget), delivery mode (fast-type/paste), type delay (if fast-type).
- Hotkey capture: a focused input that listens for a key combo and displays it in Tauri accelerator format (e.g., `CmdOrControl+Shift+1`).
- Save calls `saveTextSnippets()` through the service layer.
- Playwright tests: create a snippet, edit it, verify list updates.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: text snippet create/edit form + Playwright tests" && git push origin main`.

### 3.4 Text snippet delete

- Delete button with confirmation.
- Playwright test: delete a snippet, verify it's removed from the list.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: text snippet delete + Playwright test" && git push origin main`.

---

## Phase 4: Demo Mode & Text Delivery

Refs:

- Tauri v2 global shortcuts plugin: <https://tauri.app/plugin/global-shortcut/>
- Tauri v2 system tray: <https://tauri.app/learn/system-tray/>
- enigo crate: <https://docs.rs/enigo/latest/enigo/>

### 4.1 Demo mode toggle — Rust

In `src-tauri/src/`, create a `demo.rs` module:

- `enter_demo_mode(snippets)` — registers a global shortcut for each snippet's hotkey via Tauri's global shortcut API.
- `exit_demo_mode()` — unregisters all shortcuts.
- Maintain state tracking which shortcuts are active.
- On enter: minimize the main window to the **system tray** (Tauri's tray API). Show a tray icon with a context menu: "Exit Demo Mode", "Quit".
- On exit: restore the main window from tray, remove tray icon (or keep as preference).

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: demo mode Rust module with hotkey registration" && git push origin main`.

### 4.2 System tray — Rust

- Add Tauri's tray plugin to `Cargo.toml` and `tauri.conf.json` capabilities.
- Create tray icon with context menu items: "Exit Demo Mode", "Show Snipsy", "Quit".
- Tray click restores the main window.

1. Verify: `cd src-tauri && cargo build`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: system tray integration" && git push origin main`.

### 4.3 Text delivery — Rust

In `src-tauri/src/`, create a `delivery.rs` module:

- `deliver_text(text, method, type_delay)` — when a text snippet's hotkey fires:
  - `fast-type`: use `enigo` to simulate keystrokes, character by character, with `type_delay` ms between each.
  - `paste`: write `text` to the system clipboard, then simulate Ctrl+V (Cmd+V on macOS).
- Add `enigo` to `Cargo.toml`.
- Unit tests for delivery logic (mock or spy on enigo calls where possible).

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: text delivery via enigo (fast-type + paste)" && git push origin main`.

### 4.4 Demo mode toggle — Frontend

- A toggle button in the UI to enter/exit demo mode.
- Calls `enter_demo_mode` / `exit_demo_mode` Tauri commands via the service layer.
- Visual indicator showing demo mode is active.
- When demo mode is entered, the UI should inform the user the app will minimize to tray.
- Playwright test (frontend-only): verify the toggle button renders, mock service call is made.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: demo mode toggle UI + Playwright test" && git push origin main`.

### 4.5 End-to-end validation

- Full-app test: `npm run tauri dev`, open a project with text snippets, enter demo mode, verify Rust logs show hotkeys registered and tray icon created.
- This validates the round trip; actual hotkey firing + text delivery can be manually verified.

1. Verify: `npm run tauri build` compiles the full app without errors.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "test: demo mode end-to-end validation" && git push origin main`.

---

## Phase 5: Video Import & Snippets

Refs:

- Tauri v2 dialog plugin (file picker): <https://tauri.app/plugin/dialog/>
- Tauri v2 fs plugin: <https://tauri.app/plugin/file-system/>

### 5.1 Video import — Rust

- Tauri command `import_video(project_path, source_file_path)` — copies the video file into the project's `videos/` folder, returns the relative path.
- Integration test: copy a test video, verify it lands in the right folder.

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: video import Tauri command" && git push origin main`.

### 5.2 Video import — Frontend

- Import button that opens a file picker (Tauri dialog API, mocked in test mode).
- Displays imported videos in a list.
- Playwright test: mock service returns a video list, verify it renders.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: video import UI + Playwright test" && git push origin main`.

### 5.3 Timeline component

- A component that displays a video's timeline and lets the user select a start/end time range.
- For now, use the HTML `<video>` element with `currentTime` scrubbing and two range inputs (start/end).
- Playwright test: renders the timeline, can adjust start/end values.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: video timeline component + Playwright test" && git push origin main`.

### 5.4 Video snippet CRUD

- Create video snippet from a selected time range: title, description, hotkey, speed, start/end time.
- List, edit, delete — same pattern as text snippets.
- Saves through the service layer.
- Playwright tests for CRUD flow.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: video snippet CRUD + Playwright tests" && git push origin main`.

---

## Phase 6: Video Playback

Refs:

- Tauri v2 window management: <https://tauri.app/reference/javascript/api/namespacetauriwindow/>
- Tauri v2 multiwindow: <https://tauri.app/learn/window-customization/>
- Tauri v2 events: <https://tauri.app/develop/calling-rust/#events>

### 6.1 Frameless playback window — Rust

- Tauri command `play_video(video_file, start_time, end_time, speed)` — creates a new frameless, always-on-top, fullscreen Tauri window.
- The window URL points to a dedicated playback route in the frontend (e.g., `/playback`).
- Passes video params via URL query or Tauri window data.

1. Verify: `cd src-tauri && cargo build`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: frameless playback window Tauri command" && git push origin main`.

### 6.2 Playback UI — Frontend

- A `/playback` route that renders only a `<video>` element, no other UI.
- Reads params, sets `src`, `currentTime`, `playbackRate`.
- When playback reaches `endTime`, emits an event to close the window.
- Playwright test: playback component renders, video element has correct attributes.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: playback UI route + Playwright test" && git push origin main`.

### 6.3 Wire hotkeys to video playback

- When a video snippet's hotkey fires in demo mode, call `play_video` command.
- When playback ends, close the overlay window via Tauri.

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: wire video hotkeys to playback window" && git push origin main`.

---

## Phase 7: Transition Actions

### 7.1 Transition action execution — Rust

- Extend the `play_video` flow: accept `transition_actions` array.
- Schedule each action relative to playback time using `tokio` timers.
- Execute actions via `enigo` (click, type, keypress).
- Unit tests for scheduling logic.

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: transition action execution engine" && git push origin main`.

### 7.2 Transition action UI — Frontend

- In the video snippet editor, allow adding transition actions (trigger time, action type, params).
- Playwright test: add a transition action to a snippet, verify it persists.

1. Verify: `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: transition action UI + Playwright test" && git push origin main`.

---

## Phase 8: Scripted Capture (Advanced Mode)

### 8.1 Script CRUD — Rust & Frontend

- Tauri commands: `save_script(project_path, script)`, `load_scripts(project_path)`, `delete_script(project_path, id)`.
- Frontend: script list, create/edit form with step editor.
- Playwright tests for CRUD.

1. Verify: `cd src-tauri && cargo test` and `npx playwright test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: script CRUD — Rust commands + UI + tests" && git push origin main`.

### 8.2 Script execution engine — Rust

- Tauri command `run_script(project_path, script_id)`:
  - Spawns FFmpeg for screen recording.
  - Iterates script steps, executing each via `enigo` / `tokio::time::sleep`.
  - Stops FFmpeg, saves output video.
- Integration test: run a minimal script (just a wait step), verify a video file is produced.

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: script execution engine" && git push origin main`.

### 8.3 FFmpeg integration

- For MVP, require FFmpeg on PATH. Detect at app startup and show a warning if missing.
- Use `std::process::Command` to spawn and manage the FFmpeg process.
- Test: verify FFmpeg detection works (mock PATH in test).

1. Verify: `cd src-tauri && cargo test`.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "feat: FFmpeg integration + detection" && git push origin main`.

---

## Phase 9: Distribution & Packaging

> **Note**: This phase requires external credentials (code signing certs, GitHub secrets) and manual decisions (auto-updater yes/no). The CLI should complete what it can (9.1 bundle config, 9.4 CI workflow file) and commit documentation placeholders for 9.2 and 9.3. Do not block on missing secrets.

Ref: <https://tauri.app/distribute/>

### 9.1 Configure `tauri.conf.json` for bundling

- Set `version` in `tauri.conf.json` (single source of truth for app version).
- Configure bundle identifiers: `productName: "Snipsy"`, `identifier: "dev.snipsy.app"`.
- Configure per-platform bundle targets:
  - **Windows**: NSIS installer (`nsis`).
  - **macOS**: DMG (`dmg`) + App Bundle (`app`).
  - **Linux**: AppImage (`appimage`) + Debian package (`deb`).

1. Verify: `npm run tauri build` produces installable artifacts for the current platform.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "build: bundle configuration" && git push origin main`.

### 9.2 Code signing

- **Windows**: Configure signing certificate (Authenticode). Set `TAURI_SIGNING_PRIVATE_KEY` env var.
- **macOS**: Configure Apple Developer signing identity + notarization credentials.
- **Linux**: Optional GPG signing for packages.
- Document the required environment variables and secrets in a `SIGNING.md` or repo wiki.

1. Commit: `git add -A && git -c commit.gpgsign=false commit -m "docs: code signing documentation" && git push origin main`.

### 9.3 Auto-updater (optional)

- Tauri v2 has built-in updater support. Evaluate whether Snipsy needs over-the-air updates.
- If yes: configure the updater endpoint in `tauri.conf.json`, set up a static JSON manifest hosted at snipsy.dev (or use CrabNebula Cloud).
- If no: skip, users download new versions manually.

1. Commit (if applicable): `git add -A && git -c commit.gpgsign=false commit -m "build: auto-updater configuration" && git push origin main`.

### 9.4 CI/CD pipeline

- GitHub Actions workflow (`.github/workflows/release.yml`) to build + bundle on all three platforms (Windows, macOS, Linux) on every tag/release.
- Attach built artifacts to GitHub Releases.
- If code signing is configured, sign during CI.

1. Verify: push a tag, CI produces installers for all platforms.
2. Commit: `git add -A && git -c commit.gpgsign=false commit -m "build: CI/CD release pipeline" && git push origin main`.
