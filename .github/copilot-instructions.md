# Snipsy — Engineering Principles & Copilot Instructions

Read `README.md` for the full product spec, data model, and architecture.

## Engineering Principles

1. **Test everything and ensure consistency.** Every feature must have tests. If you write code, write tests for it. If you change code, update or add tests. Never leave untested paths.

## Architecture

- **Tauri v2** (Rust backend) + **React** (TypeScript frontend) + **Vite** bundler.
- All project data is JSON files on disk (see README for schemas).
- Global hotkeys are OS-level via Tauri's global shortcut API.
- Input simulation via `enigo` crate.
- Video playback in a dedicated frameless Tauri window.
- App minimizes to **system tray** during demo mode so it's invisible to the audience.

## Tech Decisions

- **Tailwind CSS v4** — CSS-based config (`@import "tailwindcss"`).
- **React Router** — needed for multi-window routing (main app vs playback window); use for all views.
- **Zustand** — lightweight state management. Selective subscriptions, works outside React tree, no Provider nesting.
- **UUID v4** (`crypto.randomUUID()` in TS, `uuid` crate in Rust) — for all entity IDs.
- **Hotkey format** — users define hotkeys in the UI via a key capture widget. Stored in Tauri's accelerator format (e.g., `CmdOrControl+Shift+1`). The Rust backend normalizes platform differences.
- **Latest stable** Rust and Node.js versions.
- Use `npm` as package manager.

## File Conventions

- **Rust**: `snake_case` module and file names. One module per concern (e.g., `models.rs`, `commands.rs`, `demo.rs`, `delivery.rs`).
- **TypeScript**: `PascalCase` for component files, `camelCase` for everything else. Folder structure: `src/components/`, `src/services/`, `src/types/`, `src/stores/`, `src/routes/`.
- **Errors**: Tauri commands return `Result<T, String>`. Frontend shows toast notifications for user-facing errors.
- **Commits**: commit after each completed sub-step (e.g., 1.1, 1.2).

## Testing Strategy

### Two Testing Modes

The app must be testable in two distinct modes:

#### 1. Frontend-Only Mode (Playwright, no Tauri backend)

- Use **Playwright** to test the React UI in a browser.
- At startup, the test harness detects whether the Tauri backend (IPC/commands) is available.
- **If the backend is NOT running**, the UI hydrates itself with **test fixture data** — mock projects, text snippets, video snippets — so that all UI flows can be exercised and validated without a running Rust process.
- This means Tauri command calls must go through an abstraction layer (e.g., a service/adapter) that can be swapped to return mock data in test mode.
- **What to validate**: component rendering, form interactions, navigation, state management, timeline UI, hotkey capture widget, snippet CRUD flows.

#### 2. Full App Mode (Tauri + Playwright or equivalent)

- Run the full Tauri application (Rust backend + frontend).
- Use Playwright (connecting to the WebView) or Tauri's test utilities to **click on UI elements, fill forms, and trigger actions** inside the running app.
- **Read Rust backend output** (stdout/stderr logs) to validate that the full round trip works: UI action → Tauri command → Rust logic → side effect (file write, hotkey registration, etc.) → response back to UI.
- The test harness must be able to **control the whole app end-to-end**: open a project, create snippets, enter demo mode, trigger hotkeys, and verify results.
- **What to validate**: IPC round trips, file I/O (project save/load), global hotkey registration/unregistration, text delivery (fast-type and paste), video window lifecycle.

### Test Data & Fixtures

- Maintain a set of test project fixtures (JSON files) in a `tests/fixtures/` directory.
- Fixtures should cover: empty project, project with text snippets only, project with video snippets, project with scripts, edge cases (missing fields, large snippet counts).

### Abstraction Layer for Testability

All Tauri command invocations from the frontend must go through a **service layer** that can be swapped:

```
UI Component → Service Interface → TauriBackendService (production)
                                 → MockBackendService   (test / no backend)
```

The active implementation is selected at startup based on whether `window.__TAURI__` (or equivalent) is available.

