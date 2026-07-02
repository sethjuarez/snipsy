# Snipsy — Auditaur Integration Plan

Reference `README.md` for the product spec, data model, and architecture.
Reference `.github/copilot-instructions.md` for engineering principles and testing strategy.

## Current direction

Snipsy uses **Auditaur** as the full-app observability, trace, IPC, and drive platform. Frontend-only tests may still run without Tauri, but full-app confidence should come from Auditaur observing the real Tauri application rather than Playwright.

Auditaur should be used in two modes:

1. **Attach mode** for local debugging: start Snipsy normally, then attach Auditaur to the active app.
2. **Wrapper mode** for repeatable confidence drills: let the drill script wrap the normal Tauri dev command and clean up the spawned process tree afterward.

Do not use Playwright or CDP for Snipsy confidence workflows.

## Instrumentation requirements

### Frontend

- Initialize Auditaur at app startup.
- Route all Tauri command invocations through the frontend service abstraction.
- Use Auditaur invoke wrappers so frontend IPC spans and backend command spans can be correlated.
- Enable the Tauri-native drive bridge only for development/test sessions.
- Keep command payload capture conservative unless a specific drill requires payload inspection.

### Backend

- Register the Auditaur Tauri plugin and tracing layer.
- Instrument every Tauri command with Auditaur IPC trace continuation.
- Accept optional trace context in commands so frontend IPC traces can flow into Rust spans.
- Pass `None` for trace context only for internal Rust/test/hotkey-triggered calls where no frontend IPC context exists.
- Keep command errors explicit: Tauri commands return `Result<T, String>` and should not swallow failures.

### Capabilities

- Include `auditaur:default` in the default Tauri capability so frontend telemetry export and the development drive bridge can operate.

## Confidence workflow

### Baseline validation

Run:

```powershell
npm run test
```

This should build the React/Vite frontend and run the Rust unit tests.

### Auditaur readiness

For an already-running app:

```powershell
auditaur debug --app snipsy --active --require-frontend --require-drive-bridge --json watch --until-ready --timeout-seconds 120
```

Expected readiness stages:

- app discovery
- heartbeat
- telemetry database
- session
- window telemetry
- backend telemetry
- frontend telemetry
- drive bridge

### Auditaur drills

Run attach-mode drills against an already-running Snipsy:

```powershell
npm run test:e2e
```

Run wrapper-mode drills when the script should start and stop Snipsy:

```powershell
$env:SNIPSY_AUDITAUR_DRILL_START_APP="1"; npm run test:e2e
```

The drill should:

- require frontend telemetry and the drive bridge;
- capture a DOM snapshot;
- create or use a project depending on current app state;
- navigate core views through Auditaur drive;
- read IPC, traces, timeline, errors, and explain telemetry from the exact readiness session;
- write `target\auditaur-drills\auditaur-drill-report.json`;
- write `target\auditaur-drills\initial-snapshot.json`;
- avoid stale `--active` session races by pinning drive commands to the readiness session.

## Commit plan

Prefer splitting this work for review:

1. `feat: add Auditaur observability integration`
2. `test: replace Playwright e2e coverage with Auditaur drills`
3. `fix: resolve recent project nested button warning`
4. `docs: document Auditaur testing workflow`

`PLAN.md`, README updates, Copilot instructions, and other guidance updates belong in the docs commit.
