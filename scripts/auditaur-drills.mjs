import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const appName = process.env.SNIPSY_AUDITAUR_APP ?? "snipsy";
const shouldStartApp = process.env.SNIPSY_AUDITAUR_DRILL_START_APP === "1";
const timeoutSeconds = process.env.SNIPSY_AUDITAUR_TIMEOUT_SECONDS ?? "120";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const reportDir = resolve(process.env.SNIPSY_AUDITAUR_DRILL_REPORT_DIR ?? "target/auditaur-drills");
const fixtureVideoPath = resolve("tests/fixtures/videos/smoke-1080p.mp4");
const drillProjectPath = resolve(
  process.env.SNIPSY_AUDITAUR_DRILL_PROJECT_PATH ??
    join(tmpdir(), `snipsy-auditaur-drill-${Date.now()}`),
);

mkdirSync(reportDir, { recursive: true });
rmSync(drillProjectPath, { recursive: true, force: true });
mkdirSync(drillProjectPath, { recursive: true });

const report = {
  appName,
  startedApp: shouldStartApp,
  drillProjectPath,
  platform: process.platform,
  startedAt: new Date().toISOString(),
  steps: [],
};
let wrappedAppProcess = null;
let activeDatabasePath = null;
let activeSessionId = null;
const drillStartedAtMs = Date.parse(report.startedAt);

function run(command, args, options = {}) {
  const label = options.label ?? `${command} ${args.join(" ")}`;
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  report.steps.push({
    label,
    status: result.status,
    allowedFailure: Boolean(options.allowFailure),
    stdout: result.stdout?.slice(0, 20_000) ?? "",
    stderr: result.stderr?.slice(0, 20_000) ?? "",
  });

  if (options.inherit) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (!options.allowFailure && result.status !== 0) {
    writeReport();
    process.exit(result.status ?? 1);
  }

  return result;
}

function start(command, args, options = {}) {
  const label = options.label ?? `${command} ${args.join(" ")}`;
  const child = spawn(command, args, {
    stdio: options.inherit ? "inherit" : "ignore",
  });

  report.steps.push({
    label,
    status: "started",
    pid: child.pid,
  });

  return child;
}

function stopWrappedApp() {
  if (wrappedAppProcess && !wrappedAppProcess.killed) {
    wrappedAppProcess.kill();
  }
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const reportPath = join(reportDir, "auditaur-drill-report.json");
  const serialized = JSON.stringify(report, null, 2);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${serialized}\n`);
  console.log(`Auditaur drill report: ${reportPath}`);
}

function rememberReadyMetadata(stdout) {
  try {
    const status = JSON.parse(stdout);
    activeDatabasePath = status.databasePath ?? status.app?.databasePath ?? activeDatabasePath;
    activeSessionId = status.sessionId ?? status.app?.sessionId ?? activeSessionId;
  } catch {
    // The calling step will fail separately if readiness did not produce usable JSON.
  }
}

function waitForAuditaurReady() {
  for (let attempt = 0; attempt < Number(timeoutSeconds); attempt += 1) {
    const result = run("auditaur", [
      "debug",
      "--app",
      appName,
      "--active",
      "--require-frontend",
      "--require-drive-bridge",
      "--json",
      "status",
    ], { label: `readiness status attempt ${attempt + 1}`, allowFailure: true });

    if (result.status === 0) {
      try {
        const status = JSON.parse(result.stdout);
        const startedAtMs = Date.parse(status.app?.startedAt ?? "");
        const isFreshWrapperApp = !shouldStartApp || startedAtMs >= drillStartedAtMs - 5_000;
        if (status.ready && isFreshWrapperApp) {
          rememberReadyMetadata(result.stdout);
          return;
        }
      } catch {
        // Keep waiting until Auditaur returns parseable readiness JSON.
      }
    }

    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 1000)"]);
  }

  writeReport();
  stopWrappedApp();
  process.exit(1);
}

function drive(command, args = [], options = {}) {
  const targetArgs = activeSessionId
    ? ["--session-id", activeSessionId]
    : ["--app", appName, "--active"];
  const bridgeTargetArgs = options.bridgeTarget === false
    ? []
    : ["--target", "auditaur-bridge"];

  return run("auditaur", [
    "drive",
    ...targetArgs,
    "--json",
    command,
    ...bridgeTargetArgs,
    ...args,
  ], options);
}

function parseDriveValue(result) {
  const payload = JSON.parse(result.stdout).payload;
  return payload?.value ?? payload?.result ?? payload?.jsonValue ?? payload;
}

function evaluate(expression, options = {}) {
  const result = drive("evaluate", ["--expression", expression], options);
  return parseDriveValue(result);
}

function recordSkip(label, reason) {
  report.steps.push({
    label,
    status: "skipped",
    reason,
  });
}

function recordInfo(label, details = {}) {
  report.steps.push({
    label,
    status: "info",
    details,
  });
}

function assertCondition(condition, label, details = {}) {
  report.steps.push({
    label,
    status: condition ? 0 : 1,
    details,
  });

  if (!condition) {
    writeReport();
    stopWrappedApp();
    process.exit(1);
  }
}

function assertMacCondition(condition, label, details = {}) {
  if (process.platform !== "darwin") {
    recordSkip(label, `macOS-only drill skipped on ${process.platform}.`);
    return;
  }

  assertCondition(condition, label, details);
}

function waitForSelector(selector, timeoutMs = 10_000) {
  drive("wait", ["--selector", selector, "--timeout-ms", String(timeoutMs)]);
}

function click(selector) {
  drive("click", ["--selector", selector]);
}

function fill(selector, value) {
  drive("fill", ["--selector", selector, "--value", value]);
}

function optionalClick(selector) {
  if (selectorExists(selector)) {
    click(selector);
    return true;
  }
  return false;
}

function selectorExists(selector) {
  const result = drive("evaluate", [
    "--expression",
    `document.querySelector(${JSON.stringify(selector)}) !== null`,
  ], { allowFailure: true, label: `selector probe ${selector}` });
  if (result.status !== 0) return false;

  try {
    return parseDriveValue(result) === true;
  } catch {
    return result.stdout.includes("true");
  }
}

function seedDrillProjectFiles() {
  const videosDir = join(drillProjectPath, "videos");
  mkdirSync(videosDir, { recursive: true });
  copyFileSync(fixtureVideoPath, join(videosDir, "smoke-1080p.mp4"));

  writeFileSync(join(drillProjectPath, "text-snippets.json"), `${JSON.stringify([
    {
      id: "drill-text-1",
      title: "Smoke Text",
      description: "Text snippet seeded by the Auditaur drill.",
      text: "console.log('snipsy drill');",
      hotkey: "CmdOrControl+Shift+1",
      delivery: "paste",
    },
  ], null, 2)}\n`);

  writeFileSync(join(drillProjectPath, "video-snippets.json"), `${JSON.stringify([
    {
      id: "drill-clip-1",
      title: "Smoke Clip",
      description: "Clip seeded by the Auditaur drill.",
      videoFile: "videos/smoke-1080p.mp4",
      startTime: 0.25,
      endTime: 4.75,
      hotkey: "CmdOrControl+Shift+2",
      speed: 1,
      endBehavior: "close",
      hideCursor: true,
      backgroundColor: "#000000",
      clickToPlay: false,
      muted: true,
      pauseStops: [
        {
          time: 1.5,
          label: "First region",
          spotlight: {
            regions: [
              { type: "rectangle", x: 12, y: 18, width: 34, height: 24 },
            ],
          },
        },
        {
          time: 3.2,
          label: "Second region",
          spotlight: {
            regions: [
              { type: "rectangle", x: 52, y: 42, width: 30, height: 28 },
            ],
          },
        },
      ],
    },
  ], null, 2)}\n`);

  report.seededProject = {
    fixtureVideoPath,
    projectPath: drillProjectPath,
    videoFile: "videos/smoke-1080p.mp4",
  };
}

function createSeededDrillProject() {
  rmSync(drillProjectPath, { recursive: true, force: true });

  optionalClick('button[data-testid="nav-home"][title="Home"]');
  waitForSelector('[data-testid="new-project"]');
  click('[data-testid="new-project"]');
  waitForSelector("#welcome-path");
  fill("#welcome-path", drillProjectPath);
  fill("#welcome-name", "Auditaur Drill Project");
  fill("#welcome-description", "Created by the Auditaur confidence drill.");
  click('[data-testid="create-project-submit"]');
  waitForSelector('[data-testid="sidebar"]');

  seedDrillProjectFiles();

  optionalClick('button[data-testid="nav-home"][title="Home"]');
  waitForSelector('[data-testid="recent-project"]');
  const openResult = evaluate(`(() => {
    const expectedPath = ${JSON.stringify(drillProjectPath)};
    const candidates = Array.from(document.querySelectorAll('[data-testid="recent-project"]'));
    const button = candidates.find((candidate) => candidate.innerText.includes(expectedPath));
    if (!button) {
      return { opened: false, count: candidates.length, paths: candidates.map((candidate) => candidate.innerText) };
    }

    button.click();
    return { opened: true, text: button.innerText };
  })()`, { label: "open seeded drill project from recent projects" });

  assertCondition(openResult?.opened === true, "open seeded drill project from recent projects", openResult);
  waitForSelector('[data-testid="sidebar"]');
}

function runClipEditorDrills() {
  optionalClick('[data-testid="nav-home"]');

  const openResult = evaluate(`(() => {
    const editButton =
      document.querySelector('[data-testid^="overview-edit-video-"]') ||
      document.querySelector('[data-testid^="video-edit-"]');
    if (!editButton) return { opened: false };
    editButton.click();
    return { opened: true, testId: editButton.getAttribute("data-testid") };
  })()`, { label: "open clip editor when available" });

  if (!openResult?.opened) {
    assertCondition(false, "open seeded clip editor", openResult);
  }

  waitForSelector('[data-testid="clip-editor"]');
  const closeLabel = evaluate(`document.querySelector('[data-testid="clip-cancel"]')?.textContent?.trim()`);
  assertCondition(closeLabel === "Close", "clip editor close action is labeled Close", { closeLabel });

  const scrubResult = evaluate(`(() => {
    const timeline = document.querySelector('[data-testid="clip-timeline"]');
    const video = document.querySelector('[data-testid="clip-editor-video"]');
    const playhead = document.querySelector('[data-testid="playhead-time"]');
    if (!timeline || !video) return { ok: false, reason: "missing timeline or video" };
    const rect = timeline.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const before = video.currentTime;
    const duration = video.duration || 1;
    const beforeFraction = before / duration;
    const targetFraction = beforeFraction > 0.5 ? 0.25 : 0.75;
    const startFraction = beforeFraction > 0.5 ? 0.75 : 0.25;
    timeline.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 501,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width * startFraction,
      clientY: y,
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 501,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width * targetFraction,
      clientY: y,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 501,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: rect.left + rect.width * targetFraction,
      clientY: y,
    }));
    return new Promise((resolve) => requestAnimationFrame(() => resolve({
      ok: Math.abs(video.currentTime - before) > 0.05,
      before,
      after: video.currentTime,
      duration,
      startFraction,
      targetFraction,
      playhead: playhead?.textContent?.trim(),
    })));
  })()`, { label: "timeline scrub advances video" });
  assertCondition(scrubResult?.ok === true, "timeline scrub advances video", scrubResult);

  const momentProbe = evaluate(`document.querySelector('[data-testid^="pause-stop-marker-"]') !== null`);
  if (momentProbe) {
    click('[data-testid="pause-stop-marker-0"]');
    waitForSelector('[data-testid="selected-moment-editor"]');
    const momentFilter = evaluate(`(() => {
      const panelText = document.querySelector('[data-testid="pause-stops-panel"]')?.innerText ?? "";
      const toggleText = document.querySelector('[data-testid="moments-show-all-toggle"]')?.textContent?.trim() ?? null;
      return {
        hasSelectedEditor: document.querySelector('[data-testid="selected-moment-editor"]') !== null,
        toggleText,
        panelText,
      };
    })()`, { label: "selected moment filter state" });
    assertCondition(
      momentFilter?.hasSelectedEditor === true && (!momentFilter.toggleText || momentFilter.toggleText === "Show all"),
      "timeline moment selection focuses selected moment",
      momentFilter,
    );

    const spotlightButtonExists = selectorExists('[data-testid="selected-moment-spotlight"]');
    if (spotlightButtonExists) {
      click('[data-testid="selected-moment-spotlight"]');
      waitForSelector('[data-testid="spotlight-editor-toolbar"]');
      const spotlightLayout = evaluate(`(() => {
        const toolbar = document.querySelector('[data-testid="spotlight-editor-toolbar"]');
        const video = document.querySelector('[data-testid="clip-editor-video"]');
        const surface = document.querySelector('[data-testid="spotlight-editor-surface"]');
        const overlay = document.querySelector('[data-testid^="editor-spotlight-region-"]');
        const toolbarAboveVideo = toolbar && video
          ? toolbar.getBoundingClientRect().bottom <= video.getBoundingClientRect().top + 1
          : false;
        const overlayInsideVideo = overlay && video
          ? (() => {
              const overlayRect = overlay.getBoundingClientRect();
              const videoRect = video.getBoundingClientRect();
              return overlayRect.left >= videoRect.left &&
                overlayRect.top >= videoRect.top &&
                overlayRect.right <= videoRect.right &&
                overlayRect.bottom <= videoRect.bottom;
            })()
          : true;
        return {
          hasToolbar: Boolean(toolbar),
          hasSurface: Boolean(surface),
          hasOverlay: Boolean(overlay),
          toolbarAboveVideo,
          overlayInsideVideo,
        };
      })()`, { label: "spotlight toolbar and region geometry" });
      assertCondition(
        spotlightLayout?.hasToolbar === true &&
          spotlightLayout?.hasSurface === true &&
          spotlightLayout?.toolbarAboveVideo === true &&
          spotlightLayout?.overlayInsideVideo === true,
        "spotlight toolbar does not cover video and regions align",
        spotlightLayout,
      );
    }
  } else {
    recordSkip("moment and spotlight drills", "The open clip has no timeline moments.");
  }

  const titleChanged = evaluate(`(() => {
    const input = document.querySelector('[data-testid="clip-title"]');
    if (!input) return false;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, \`\${input.value} drill\`);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`, { label: "mark clip editor dirty" });

  if (titleChanged) {
    click('[data-testid="clip-cancel"]');
    waitForSelector('[data-testid="discard-changes-dialog"]');
    const discardDialog = evaluate(`document.querySelector('[data-testid="discard-changes-dialog"]')?.innerText ?? ""`);
    assertCondition(
      discardDialog.includes("Discard changes?") &&
        discardDialog.includes("Keep editing") &&
        discardDialog.includes("Discard changes"),
      "close opens discard changes lightbox",
      { discardDialog },
    );
    click('[data-testid="confirm-dialog-cancel"]');
  }
}

function runMacCompatibilityDrills() {
  optionalClick('[data-testid="nav-home"]');

  const platformProbe = evaluate(`(() => ({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    hasPointerEvent: typeof PointerEvent !== "undefined",
    hasResizeObserver: typeof ResizeObserver !== "undefined",
    visibleText: document.body.innerText.slice(0, 500),
  }))()`, { label: "platform capability probe" });

  recordInfo("platform capability summary", {
    nodePlatform: process.platform,
    browserPlatform: platformProbe?.platform,
    maxTouchPoints: platformProbe?.maxTouchPoints,
    hasPointerEvent: platformProbe?.hasPointerEvent,
    hasResizeObserver: platformProbe?.hasResizeObserver,
  });

  assertCondition(platformProbe?.hasPointerEvent === true, "pointer events are available for timeline editing", platformProbe);
  assertCondition(platformProbe?.hasResizeObserver === true, "ResizeObserver is available for video region layout", platformProbe);

  const hotkeyText = evaluate(`document.querySelector('[data-testid="hotkey-overview"]')?.innerText ?? ""`, {
    label: "hotkey overview text",
  });
  assertMacCondition(
    !String(hotkeyText).includes("Ctrl+") && !String(hotkeyText).includes("Control+"),
    "macOS hotkey overview does not render Windows Control labels",
    { hotkeyText },
  );

  const demoButton = evaluate(`(() => {
    const button = document.querySelector('[data-testid="demo-mode-toggle"]');
    return {
      exists: Boolean(button),
      ariaLabel: button?.getAttribute("aria-label") ?? null,
      title: button?.getAttribute("title") ?? null,
    };
  })()`, { label: "demo mode toggle accessibility probe" });
  assertCondition(
    demoButton?.exists === true &&
      typeof demoButton?.ariaLabel === "string" &&
      demoButton.ariaLabel.length > 0,
    "demo mode toggle remains accessible for tray workflow",
    demoButton,
  );

  if (process.platform === "darwin") {
    const trayHint = evaluate(`document.querySelector('[data-testid="tray-hint"]')?.innerText ?? ""`, {
      label: "macOS tray hint text",
    });
    assertCondition(
      !String(trayHint).includes("taskbar") && !String(trayHint).includes("system tray"),
      "macOS tray hint avoids Windows taskbar wording",
      { trayHint },
    );
  } else {
    recordSkip("macOS tray wording check", `macOS-only drill skipped on ${process.platform}.`);
  }
}

function waitForAnySelector(selectors, timeoutMs = 10_000) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 500));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (selectors.some((selector) => selectorExists(selector))) return;
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 500)"]);
  }

  waitForSelector(selectors[0], 1);
}

function telemetryArgs() {
  if (activeDatabasePath) return ["--db", activeDatabasePath, "--json"];
  if (activeSessionId) return ["--session", activeSessionId, "--json"];
  return ["--json"];
}

const readinessArgs = [
  "debug",
  "--app",
  appName,
  "--active",
  "--require-frontend",
  "--require-drive-bridge",
  "--json",
];

if (shouldStartApp) {
  wrappedAppProcess = start("auditaur", [
    ...readinessArgs,
    "run",
    "--timeout-seconds",
    timeoutSeconds,
    "--",
    npmCommand,
    "run",
    "tauri",
    "dev",
  ], { label: "start app via auditaur debug run" });
  process.on("exit", stopWrappedApp);
  waitForAuditaurReady();
} else {
  const readiness = run("auditaur", [
    ...readinessArgs,
    "watch",
    "--until-ready",
    "--timeout-seconds",
    timeoutSeconds,
  ], { label: "attach readiness via auditaur debug watch", inherit: true });
  rememberReadyMetadata(readiness.stdout);
}

drive("inspect", [], { label: "drive bridge inspect", bridgeTarget: false });

waitForSelector("body");
drive("snapshot", [
  "--selector",
  "body",
  "--output",
  join(reportDir, "initial-snapshot.json"),
], { label: "initial DOM snapshot" });

waitForSelector("body");
drive("text", ["--selector", "body"], { label: "initial body text" });

createSeededDrillProject();

waitForSelector('[data-testid="sidebar"]');
waitForSelector('[data-testid="nav-text-snippets"]');
click('[data-testid="nav-text-snippets"]');
waitForAnySelector(['[data-testid="empty-state"]', '[data-testid="text-snippet-list"]']);

click('[data-testid="nav-videos"]');
waitForAnySelector(['[data-testid="no-videos"]', '[data-testid="video-list"]']);

click('[data-testid="nav-scripts"]');
waitForAnySelector(['[data-testid="script-empty-state"]', '[data-testid="script-list"]']);

runClipEditorDrills();
runMacCompatibilityDrills();

run("auditaur", ["ipc", ...telemetryArgs()], { label: "IPC telemetry" });
run("auditaur", ["traces", ...telemetryArgs()], { label: "trace telemetry" });
run("auditaur", ["timeline", ...telemetryArgs()], { label: "timeline telemetry" });
run("auditaur", ["errors", ...telemetryArgs()], { label: "error telemetry" });
run("auditaur", ["explain", ...telemetryArgs()], { label: "explain telemetry" });

stopWrappedApp();
writeReport();
