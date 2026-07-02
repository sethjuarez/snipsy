# Snipsy Scripts: Conditional Waits Handoff

This note captures the proposed next step for Snipsy's experimental scripts feature so the work can be resumed from another session or machine.

## Current scripts model

Scripts are an authoring tool for generating source videos. A script replays desktop actions, FFmpeg records the screen, and the resulting video can be used in Snipsy's normal clip workflow.

```text
script -> replay desktop actions -> FFmpeg records screen -> output video -> create video clips
```

The current runner is mostly timing-based. It executes steps sequentially and waits only when a fixed-duration step appears:

```json
{ "action": "wait", "duration": 1000 }
```

The recorder also inserts fixed `wait` steps when it detects gaps between user events. This works for controlled demos, but it is brittle for nondeterministic processes like app launches, builds, dev server startup, network calls, page loads, and animations.

## Goal

Add conditional waits so scripts advance when the environment reaches an expected state, rather than relying only on elapsed milliseconds.

The target model is:

```text
actions do things
waitFor steps observe the world until a condition is true or timeout
```

## Recommended MVP

Keep existing fixed waits:

```json
{ "action": "wait", "duration": 1000 }
```

Add a `waitFor` step:

```json
{
  "action": "waitFor",
  "condition": {
    "kind": "windowTitle",
    "contains": "Command Prompt"
  },
  "timeout": 5000,
  "interval": 100
}
```

Add a manual pause step for human-in-the-loop moments:

```json
{
  "action": "pause",
  "message": "Log into the app, then continue."
}
```

## MVP wait conditions

These should be enough to make generated demo videos substantially more reliable without turning Snipsy into a full RPA platform.

| Condition | Purpose |
| --- | --- |
| `windowTitle` | Wait for an app/window to be active or visible after launch/switching. |
| `fileExists` | Wait for builds, exports, downloads, or generated artifacts. |
| `http` | Wait for local dev servers or web apps to become ready. |
| `process` | Wait for apps, CLIs, background services, or command completion. |
| `pause` step | Human checkpoint for auth, 2FA, manual setup, flaky cloud steps, etc. |

Defer OCR/image matching until there is a concrete need. They add complexity around scaling, DPI, themes, false positives, platform differences, and screen region selection.

## Proposed TypeScript model

Current script types live in:

```text
src\types\index.ts
```

Extend `ScriptStep` roughly like this:

```ts
export type ScriptStep =
  | { action: "launch"; target: string }
  | { action: "type"; text: string; delay?: number }
  | { action: "keypress"; key: string }
  | { action: "click"; x: number; y: number; button?: MouseButton }
  | { action: "wait"; duration: number }
  | {
      action: "waitFor";
      condition: WaitCondition;
      timeout?: number;
      interval?: number;
    }
  | {
      action: "pause";
      message?: string;
    };

export type WaitCondition =
  | {
      kind: "windowTitle";
      contains: string;
    }
  | {
      kind: "fileExists";
      path: string;
    }
  | {
      kind: "http";
      url: string;
      status?: number;
    }
  | {
      kind: "process";
      name: string;
      state: "running" | "exited";
    };
```

Use these defaults:

```ts
timeout: 10000
interval: 250
```

## Proposed Rust model

Rust models live in:

```text
src-tauri\src\models.rs
```

Add variants to `ScriptStep`:

```rust
#[serde(rename = "waitFor", rename_all = "camelCase")]
WaitFor {
    condition: WaitCondition,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    interval: Option<u64>,
},

#[serde(rename = "pause")]
Pause {
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
},
```

Add a tagged condition enum:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WaitCondition {
    WindowTitle {
        contains: String,
    },
    FileExists {
        path: String,
    },
    Http {
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<u16>,
    },
    Process {
        name: String,
        state: ProcessWaitState,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ProcessWaitState {
    Running,
    Exited,
}
```

## Runner behavior

Script execution lives in:

```text
src-tauri\src\scripting.rs
```

Add handling to `execute_step`:

```rust
ScriptStep::WaitFor {
    condition,
    timeout,
    interval,
} => {
    wait_for(
        condition,
        timeout.unwrap_or(10_000),
        interval.unwrap_or(250),
    )
}

ScriptStep::Pause { message } => {
    pause_for_user(message)
}
```

The core polling loop:

```rust
fn wait_for(
    condition: &WaitCondition,
    timeout_ms: u64,
    interval_ms: u64,
) -> Result<(), String> {
    let started = std::time::Instant::now();

    loop {
        if evaluate_condition(condition)? {
            return Ok(());
        }

        if started.elapsed() >= std::time::Duration::from_millis(timeout_ms) {
            return Err(format!("Timed out waiting for condition: {:?}", condition));
        }

        std::thread::sleep(std::time::Duration::from_millis(interval_ms));
    }
}
```

Timeouts should fail loudly. If a condition is not met, stop the script and return a clear error. Do not continue blindly, because that creates misleading recordings.

## Condition implementation notes

### `windowTitle`

Use the existing dependency:

```rust
active_win_pos_rs::get_active_window()
```

Initial behavior can check the active window title:

```rust
Ok(active.title.contains(contains))
```

Later improvement: enumerate windows if needed. Current script replay already has limited active-window matching for window-relative coordinates.

### `fileExists`

Resolve paths carefully:

- If the path is absolute, use it directly.
- If the path is relative, resolve it relative to `project_path`.

This likely means `wait_for` needs access to `project_path`, or `evaluate_condition` accepts it.

Example:

```json
{
  "action": "waitFor",
  "condition": {
    "kind": "fileExists",
    "path": "dist\\index.html"
  },
  "timeout": 60000
}
```

### `http`

Add a small HTTP client dependency in Rust. `ureq` is likely enough for the MVP.

Recommended behavior:

- Default expected status is `200`.
- Treat connection errors as "not ready yet" until timeout.
- Invalid URLs should return an error.

Example:

```json
{
  "action": "waitFor",
  "condition": {
    "kind": "http",
    "url": "http://localhost:5173",
    "status": 200
  },
  "timeout": 30000,
  "interval": 500
}
```

### `process`

Use the `sysinfo` crate.

Examples:

```json
{ "kind": "process", "name": "node.exe", "state": "running" }
```

```json
{ "kind": "process", "name": "npm", "state": "exited" }
```

Be careful with platform naming differences:

- Windows may use `node.exe`.
- macOS/Linux may use `node`.

Start with exact process-name matching. Contains/regex matching can be added later if needed.

## UI changes

The script form lives in:

```text
src\components\ScriptForm.tsx
```

Add step editor support for:

- `Wait for condition`
- `Manual pause`

Suggested fields for `waitFor`:

| Field | Control |
| --- | --- |
| Action | Existing step action dropdown |
| Condition kind | Dropdown: Window title, File exists, HTTP, Process |
| Match value | Text/path/URL/process name input |
| Process state | Dropdown: running/exited, only for process |
| HTTP status | Number input, only for HTTP |
| Timeout | Number input, default `10000` |
| Poll interval | Number input, default `250`, possibly advanced |

Suggested field for `pause`:

| Field | Control |
| --- | --- |
| Message | Optional text input |

## Manual pause behavior

The runner is backend-driven, but the frontend should show a blocking prompt/dialog when a pause step is reached.

Product-quality flow:

1. Backend emits a Tauri event such as `script-pause-requested`.
2. Frontend shows a modal with the pause message and a Continue button.
3. Frontend invokes a command such as `continue_script`.
4. Backend blocks until continued.

If that is too much for the first implementation, defer `pause` until the event/continue flow can be built cleanly.

## Tests to add or update

Existing relevant tests:

```text
tests\scriptCrud.spec.ts
tests\scriptRecording.spec.ts
src-tauri\src\commands.rs tests
src-tauri\src\recorder.rs tests
src-tauri\src\scripting.rs tests
```

Add Rust tests for:

1. `fileExists` succeeds when a file exists.
2. `fileExists` times out/fails when a file does not exist.
3. `http` treats connection errors as retryable until timeout.
4. `windowTitle` evaluator is unit-tested via helper extraction/mocking if possible.
5. Serde round-trip for `waitFor` and `pause`.
6. Default timeout/interval behavior.
7. Timeout error message includes condition details.

Add Auditaur drive coverage for:

1. Script form can add `waitFor`.
2. Changing condition kind shows the correct fields.
3. Can save a script containing `waitFor`.
4. Can add and save a `pause` step.
5. Existing script CRUD tests still pass.

## Documentation updates

Update:

```text
docs\src\content\docs\features\scripts.mdx
README.md
```

Docs should clarify:

- FFmpeg records the output video.
- Scripts are for generating source videos.
- Fixed `wait` is still supported.
- `waitFor` is preferred for nondeterministic processes.
- Initial supported conditions: window title, file exists, HTTP, process.
- Manual pause supports human-in-the-loop steps.

Also fix stale docs:

- Current scroll implementation uses `delta`, not `direction`/`amount`.
- Current recorder does not record standalone cursor movement or drag yet.

## Suggested implementation order

1. Add shared model types in TypeScript and Rust.
2. Add Rust serde tests for the new schema.
3. Implement `wait_for` and `evaluate_condition` in `scripting.rs`.
4. Add `fileExists` first because it is simplest and easy to test.
5. Add `http`.
6. Add `windowTitle`.
7. Add `process`.
8. Add ScriptForm UI support.
9. Add Auditaur drive coverage.
10. Update docs.

## Design principle

Move scripts from:

```text
wait N milliseconds and hope
```

to:

```text
wait until the world is ready, or fail clearly
```

This makes generated demo videos more reliable while keeping scripts understandable and editable as JSON.
