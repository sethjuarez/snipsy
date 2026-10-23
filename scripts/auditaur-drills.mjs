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
  if (!wrappedAppProcess) return;
  // On Windows, kill() only ends `auditaur run`, which may already have exited and
  // orphaned npm/vite/cargo/snipsy. Orphans keep their parent PID, so walk the tree.
  if (process.platform === "win32" && wrappedAppProcess.pid) {
    for (const pid of windowsDescendantPids(wrappedAppProcess.pid)) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }
  }
  if (!wrappedAppProcess.killed) wrappedAppProcess.kill();
  wrappedAppProcess = null;
}

function windowsDescendantPids(rootPid) {
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{n='CreatedMs';e={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress",
  ], { encoding: "utf8" });
  let processes;
  try {
    processes = [JSON.parse(result.stdout)].flat();
  } catch {
    return [rootPid];
  }
  // Ignore processes older than the drill so a reused PID can't match.
  const startedAt = drillStartedAtMs - 5_000;
  const createdAt = (p) => Number(p.CreatedMs);
  const pids = [rootPid];
  for (let i = 0; i < pids.length; i += 1) {
    for (const p of processes) {
      if (p.ParentProcessId === pids[i] && !pids.includes(p.ProcessId) && !(createdAt(p) < startedAt)) {
        pids.push(p.ProcessId);
      }
    }
  }
  return pids;
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
        {
          time: 4.2,
          label: "Zoom only",
          zoom: { x: 75, y: 30, scale: 2.5 },
        },
      ],
    },
    {
      id: "drill-zoom-playback-clip",
      title: "Zoom Playback Clip",
      description: "Clip used to validate ZoomIt-style zoom in the playback window.",
      videoFile: "videos/smoke-1080p.mp4",
      startTime: 0.25,
      endTime: 1.5,
      hotkey: "CmdOrControl+Shift+6",
      speed: 1,
      endBehavior: "close",
      hideCursor: true,
      backgroundColor: "#000000",
      clickToPlay: false,
      muted: true,
      pauseStops: [
        {
          time: 0.75,
          label: "Zoomed spotlight",
          spotlight: {
            regions: [
              { type: "rectangle", x: 70, y: 10, width: 20, height: 20 },
            ],
          },
          zoom: { x: 80, y: 20, scale: 3, durationMs: 300 },
        },
      ],
    },
    {
      id: "drill-playback-clip",
      title: "Fullscreen Playback Clip",
      description: "Short clip used to validate the playback window.",
      videoFile: "videos/smoke-1080p.mp4",
      startTime: 0.25,
      endTime: 1.25,
      hotkey: "CmdOrControl+Shift+3",
      speed: 1,
      endBehavior: "close",
      hideCursor: true,
      backgroundColor: "#000000",
      clickToPlay: false,
      muted: true,
      pauseStops: [],
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

    const autoOpenedSpotlight = selectorExists('[data-testid="spotlight-editor-toolbar"]');
    const spotlightButtonExists = autoOpenedSpotlight || selectorExists('[data-testid="selected-moment-spotlight"]');
    if (spotlightButtonExists) {
      if (!autoOpenedSpotlight) {
        click('[data-testid="selected-moment-spotlight"]');
      }
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

      const readSpotlightEffects = (label) => evaluate(`(() => {
        const blur = document.querySelector('[data-testid="spotlight-blur"]');
        const dim = document.querySelector('[data-testid="spotlight-dim"]');
        const halo = document.querySelector('[data-testid="spotlight-halo"]');
        const region = document.querySelector('[data-testid="editor-spotlight-region-0"]');
        return {
          hasToggles: Boolean(blur && dim && halo),
          blurChecked: blur?.checked ?? null,
          dimChecked: dim?.checked ?? null,
          haloChecked: halo?.checked ?? null,
          regionHalo: region?.getAttribute("data-halo") ?? null,
          regionShadow: region ? region.style.boxShadow : null,
        };
      })()`, { label });

      const defaultEffects = readSpotlightEffects("spotlight effect toggles default on");
      assertCondition(
        defaultEffects?.hasToggles === true &&
          defaultEffects.blurChecked === true &&
          defaultEffects.dimChecked === true &&
          defaultEffects.haloChecked === true &&
          (defaultEffects.regionHalo === null || defaultEffects.regionHalo === "on"),
        "spotlight blur, dim, and halo default on",
        defaultEffects,
      );

      click('[data-testid="spotlight-blur"]');
      click('[data-testid="spotlight-dim"]');
      click('[data-testid="spotlight-halo"]');
      const disabledEffects = readSpotlightEffects("spotlight effect toggles off");
      assertCondition(
        disabledEffects?.blurChecked === false &&
          disabledEffects.dimChecked === false &&
          disabledEffects.haloChecked === false &&
          (disabledEffects.regionHalo === null ||
            (disabledEffects.regionHalo === "off" && !disabledEffects.regionShadow)),
        "spotlight blur, dim, and halo can be disabled",
        disabledEffects,
      );

      click('[data-testid="spotlight-blur"]');
      click('[data-testid="spotlight-dim"]');
      click('[data-testid="spotlight-halo"]');
      const restoredEffects = readSpotlightEffects("spotlight effect toggles restored");
      assertCondition(
        restoredEffects?.blurChecked === true &&
          restoredEffects.dimChecked === true &&
          restoredEffects.haloChecked === true &&
          (restoredEffects.regionHalo === null || restoredEffects.regionHalo === "on"),
        "spotlight blur, dim, and halo can be re-enabled",
        restoredEffects,
      );

      runSpotlightEditFlowDrills();
      runZoomEditFlowDrills();
      runClipEditorZoomPreviewDrill();
    }
  } else {
    recordSkip("moment and spotlight drills", "The open clip has no timeline moments.");
  }

  const readUnsaved = (label) =>
    evaluate(`document.querySelector('[data-testid="clip-editor"]')?.getAttribute("data-unsaved") ?? null`, { label });
  const cleanAfterRevert = readUnsaved("clip editor clean after reverted edits");
  assertCondition(
    cleanAfterRevert === "false",
    "reverted spotlight edits leave the clip unchanged",
    { cleanAfterRevert },
  );

  optionalClick('[data-testid="clip-inspector-tab-clip"]');
  const setTitle = (append, label) => evaluate(`(() => {
    const input = document.querySelector('[data-testid="clip-title"]');
    if (!input) return false;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const next = ${append ? "input.value + ' drill'" : "input.value.replace(/ drill$/, '')"};
    descriptor?.set?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`, { label });
  const titleChanged = setTitle(true, "mark clip editor dirty");

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
    setTitle(false, "revert clip title");
    const cleanAfterTitleRevert = readUnsaved("clip editor clean after title revert");
    assertCondition(
      cleanAfterTitleRevert === "false",
      "reverting edits clears unsaved state",
      { cleanAfterTitleRevert },
    );
  }
}

function runTextSnippetSaveTrackingDrill() {
  if (!optionalClick('[data-testid="edit-drill-text-1"]')) {
    recordSkip("text snippet save tracking", "Seeded text snippet is not listed.");
    return;
  }
  waitForSelector('[data-testid="snippet-form"]');
  const readUnsaved = (label) =>
    evaluate(`document.querySelector('[data-testid="snippet-form"]')?.getAttribute("data-unsaved") ?? null`, { label });
  const setTitle = (append, label) => evaluate(`(() => {
    const input = document.querySelector('[data-testid="snippet-title"]');
    if (!input) return false;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const next = ${append ? "input.value + ' drill'" : "input.value.replace(/ drill$/, '')"};
    descriptor?.set?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`, { label });

  const initial = readUnsaved("text snippet initially clean");
  assertCondition(initial === "false", "opening a text snippet does not mark it unsaved", { initial });

  setTitle(true, "edit text snippet title");
  const dirty = readUnsaved("text snippet dirty after edit");
  assertCondition(dirty === "true", "editing a text snippet marks it unsaved", { dirty });

  setTitle(false, "revert text snippet title");
  const reverted = readUnsaved("text snippet clean after revert");
  assertCondition(reverted === "false", "reverting a text snippet edit clears unsaved state", { reverted });

  click('[data-testid="snippet-cancel"]');
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 500)"]);
  const closeState = evaluate(`({
    dialog: Boolean(document.querySelector('[data-testid="discard-changes-dialog"]')),
    form: Boolean(document.querySelector('[data-testid="snippet-form"]')),
  })`, { label: "text snippet close state" });
  assertCondition(
    closeState && !closeState.dialog && !closeState.form,
    "closing an unchanged text snippet does not prompt",
    { closeState },
  );
  if (closeState?.dialog) click('[data-testid="confirm-dialog-confirm"]');
}

function readSpotlightEditState(label) {
  return evaluate(`(() => {
    const toolbar = document.querySelector('[data-testid="spotlight-editor-toolbar"]');
    const halo = document.querySelector('[data-testid="spotlight-halo"]');
    return {
      editing: Boolean(toolbar),
      editingIndex: toolbar?.getAttribute("data-editing-index") ?? null,
      haloChecked: halo?.checked ?? null,
      dialog: document.querySelector('[data-testid="spotlight-exit-dialog"]') !== null,
    };
  })()`, { label });
}

function runSpotlightEditFlowDrills() {
  const startMarker = '[data-testid="timeline-start-marker"]';
  const marker0 = '[data-testid="pause-stop-marker-0"]';
  const marker1 = '[data-testid="pause-stop-marker-1"]';

  click(startMarker);
  const cleanExit = readSpotlightEditState("clean spotlight exit");
  assertCondition(
    cleanExit?.editing === false && cleanExit.dialog === false,
    "unchanged spotlight exits without prompting",
    cleanExit,
  );

  click(marker0);
  waitForSelector('[data-testid="spotlight-editor-toolbar"]');
  const reopened = readSpotlightEditState("spotlight reopened from timeline");
  assertCondition(
    reopened?.editing === true && reopened.editingIndex === "0",
    "clicking a spotlight marker opens spotlight edit mode",
    reopened,
  );

  const hasSecondSpotlight = evaluate(
    `document.querySelector('[data-testid="pause-stop-marker-1"][data-spotlight="true"]') !== null`,
    { label: "second spotlight marker probe" },
  );
  if (hasSecondSpotlight) {
    click('[data-testid="spotlight-halo"]');
    click(marker1);
    const switched = readSpotlightEditState("switch spotlight while dirty");
    assertCondition(
      switched?.editing === true && switched.editingIndex === "1" && switched.dialog === false,
      "clicking another spotlight switches edit mode without prompting",
      switched,
    );
    click(marker0);
    const kept = readSpotlightEditState("switched-away edits kept");
    assertCondition(
      kept?.editingIndex === "0" && kept.haloChecked === false,
      "switching spotlights keeps prior edits",
      kept,
    );
    const unsavedAfterSwitch = evaluate(
      `document.querySelector('[data-testid="clip-editor"]')?.getAttribute("data-unsaved") ?? null`,
      { label: "clip unsaved after spotlight edit" },
    );
    assertCondition(
      unsavedAfterSwitch === "true",
      "spotlight edits mark the clip unsaved",
      { unsavedAfterSwitch },
    );
  } else {
    recordSkip("spotlight switch drill", "The open clip has only one spotlight moment.");
  }

  const baselineHalo = readSpotlightEditState("dirty baseline")?.haloChecked;
  click('[data-testid="spotlight-halo"]');
  click(startMarker);
  waitForSelector('[data-testid="spotlight-exit-dialog"]');
  click('[data-testid="confirm-dialog-cancel"]');
  const keptEditing = readSpotlightEditState("keep editing spotlight");
  assertCondition(
    keptEditing?.editing === true && keptEditing.dialog === false && keptEditing.haloChecked === !baselineHalo,
    "keep editing leaves spotlight changes in place",
    keptEditing,
  );

  const keyPrompt = evaluate(`(() => {
    const timeline = document.querySelector('[data-testid="clip-timeline"]');
    timeline?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    return true;
  })()`, { label: "timeline arrow key while spotlight dirty" });
  if (keyPrompt) {
    waitForSelector('[data-testid="spotlight-exit-dialog"]');
    click('[data-testid="confirm-dialog-cancel"]');
    const afterKey = readSpotlightEditState("arrow key prompt kept editing");
    assertCondition(
      afterKey?.editing === true && afterKey.dialog === false,
      "timeline arrow keys prompt before leaving a changed spotlight",
      afterKey,
    );
  }

  click(startMarker);
  waitForSelector('[data-testid="spotlight-exit-dialog"]');
  click('[data-testid="confirm-dialog-secondary"]');
  const discarded = readSpotlightEditState("discard spotlight changes");
  assertCondition(discarded?.editing === false && discarded.dialog === false, "discard exits spotlight edit mode", discarded);
  click(marker0);
  waitForSelector('[data-testid="spotlight-editor-toolbar"]');
  const afterDiscard = readSpotlightEditState("spotlight after discard");
  assertCondition(afterDiscard?.haloChecked === baselineHalo, "discard restores the spotlight", afterDiscard);

  click('[data-testid="spotlight-halo"]');
  click(startMarker);
  waitForSelector('[data-testid="spotlight-exit-dialog"]');
  click('[data-testid="confirm-dialog-confirm"]');
  const saved = readSpotlightEditState("save spotlight changes");
  assertCondition(saved?.editing === false && saved.dialog === false, "save exits spotlight edit mode", saved);
  click(marker0);
  waitForSelector('[data-testid="spotlight-editor-toolbar"]');
  const afterSave = readSpotlightEditState("spotlight after save");
  assertCondition(afterSave?.haloChecked === !baselineHalo, "save keeps the spotlight changes", afterSave);

  if (afterSave?.haloChecked === false) {
    click('[data-testid="spotlight-halo"]');
    click(startMarker);
    optionalClick('[data-testid="confirm-dialog-confirm"]');
  }
}

function readZoomEditState(label) {
  return evaluate(`(() => {
    const toolbar = document.querySelector('[data-testid="spotlight-editor-toolbar"]');
    const point = document.querySelector('[data-testid="editor-zoom-point"]');
    const frame = document.querySelector('[data-testid="editor-zoom-frame"]');
    const video = document.querySelector('[data-testid="clip-editor-video"]');
    const markers = Array.from(document.querySelectorAll('[data-testid^="pause-stop-marker-"][data-zoom="true"]'))
      .map((marker) => marker.getAttribute("data-testid"));
    const pointRect = point?.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect();
    const inside = (rect) => Boolean(rect && videoRect &&
      rect.left >= videoRect.left - 1 && rect.right <= videoRect.right + 1 &&
      rect.top >= videoRect.top - 1 && rect.bottom <= videoRect.bottom + 1);
    return {
      editing: Boolean(toolbar),
      mode: toolbar?.getAttribute("data-editor-mode") ?? null,
      editingIndex: toolbar?.getAttribute("data-editing-index") ?? null,
      x: point ? Number(point.getAttribute("data-zoom-x")) : null,
      y: point ? Number(point.getAttribute("data-zoom-y")) : null,
      scaleLabel: document.querySelector('[data-testid="zoom-scale-label"]')?.textContent?.trim() ?? null,
      duration: document.querySelector('[data-testid="zoom-duration"]')?.value ?? null,
      pointInsideVideo: inside(pointRect),
      frameInsideVideo: inside(frameRect),
      frameWidth: frameRect?.width ?? null,
      videoWidth: videoRect?.width ?? null,
      dialog: document.querySelector('[data-testid="spotlight-exit-dialog"]') !== null,
      unsaved: document.querySelector('[data-testid="clip-editor"]')?.getAttribute("data-unsaved") ?? null,
      zoomMarkers: markers,
    };
  })()`, { label });
}

function runZoomEditFlowDrills() {
  const startMarker = '[data-testid="timeline-start-marker"]';
  const zoomMarker = '[data-testid="pause-stop-marker-2"]';
  if (!selectorExists('[data-testid="pause-stop-marker-2"][data-zoom="true"]')) {
    recordSkip("zoom edit drills", "The open clip has no seeded zoom-only moment.");
    return;
  }

  click(startMarker);
  optionalClick('[data-testid="confirm-dialog-secondary"]');

  click(zoomMarker);
  waitForSelector('[data-testid="editor-zoom-point"]');
  const opened = readZoomEditState("zoom moment opened from timeline");
  assertCondition(
    opened?.mode === "zoom" && opened.editingIndex === "2" && opened.x === 75 && opened.y === 30 &&
      opened.scaleLabel === "2.5×" && opened.duration === "400" &&
      opened.pointInsideVideo === true && opened.frameInsideVideo === true &&
      opened.unsaved === "false",
    "zoom-only marker opens zoom mode with the saved point, scale, and frame",
    opened,
  );
  assertCondition(
    typeof opened?.frameWidth === "number" && typeof opened?.videoWidth === "number" &&
      opened.frameWidth < opened.videoWidth * 0.5,
    "zoom frame previews the magnified region (2.5× shows ≤ 40% of the width)",
    opened,
  );
  drive("screenshot", ["--output", join(reportDir, "zoom-editor.png")], { label: "zoom editor screenshot", allowFailure: true });

  const pointerScript = (statements) => `(() => {
    const surface = document.querySelector('[data-testid="spotlight-editor-surface"]');
    const video = document.querySelector('[data-testid="clip-editor-video"]');
    if (!surface || !video) return { ok: false };
    const rect = video.getBoundingClientRect();
    const scale = Math.min(rect.width / (video.videoWidth || rect.width), rect.height / (video.videoHeight || rect.height));
    const width = (video.videoWidth || rect.width) * scale;
    const height = (video.videoHeight || rect.height) * scale;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    const at = (fx, fy) => ({ bubbles: true, cancelable: true, button: 0, clientX: left + width * fx, clientY: top + height * fy });
    ${statements}
    return { ok: true };
  })()`;
  // Separate evaluations so React commits the drag listeners between events.
  const down = evaluate(pointerScript(`surface.dispatchEvent(new MouseEvent("mousedown", at(0.2, 0.6)));`), { label: "zoom point mousedown" });
  const move = evaluate(pointerScript(`window.dispatchEvent(new MouseEvent("mousemove", at(0.25, 0.5)));
    window.dispatchEvent(new MouseEvent("mouseup", at(0.25, 0.5)));`), { label: "zoom point drag" });
  const wheel = evaluate(pointerScript(`surface.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120 }));`), { label: "zoom wheel" });
  const picked = { ok: down?.ok === true && move?.ok === true && wheel?.ok === true };
  assertCondition(picked?.ok === true, "zoom surface accepts point drag and wheel", picked);
  const edited = readZoomEditState("zoom edited");
  assertCondition(
    Math.abs((edited?.x ?? 0) - 25) < 0.5 && Math.abs((edited?.y ?? 0) - 50) < 0.5 &&
      edited.scaleLabel === "2.75×" && edited.unsaved === "true",
    "dragging moves the zoom point, the wheel zooms in, and the clip is marked unsaved",
    edited,
  );

  click(startMarker);
  waitForSelector('[data-testid="spotlight-exit-dialog"]');
  click('[data-testid="confirm-dialog-secondary"]');
  click(zoomMarker);
  waitForSelector('[data-testid="editor-zoom-point"]');
  const restored = readZoomEditState("zoom after discard");
  assertCondition(
    restored?.x === 75 && restored.y === 30 && restored.scaleLabel === "2.5×",
    "discard restores the saved zoom",
    restored,
  );

  click('[data-testid="pause-stop-marker-0"]');
  waitForSelector('[data-testid="spotlight-editor-toolbar"][data-editing-index="0"]');
  click('[data-testid="moment-editor-mode-zoom"]');
  waitForSelector('[data-testid="editor-zoom-point"]');
  const added = readZoomEditState("zoom added to spotlight moment");
  assertCondition(
    added?.mode === "zoom" && added.x === 29 && added.y === 30 && added.scaleLabel === "2×" && added.unsaved === "true",
    "adding zoom to a spotlight moment centers it on the highlight",
    added,
  );
  click('[data-testid="moment-editor-mode-spotlight"]');
  const backToHighlight = readZoomEditState("back to highlight mode");
  assertCondition(
    backToHighlight?.mode === "spotlight" && selectorExists('[data-testid="spotlight-halo"]'),
    "highlight mode returns spotlight controls",
    backToHighlight,
  );
  click(startMarker);
  waitForSelector('[data-testid="spotlight-exit-dialog"]');
  click('[data-testid="confirm-dialog-secondary"]');
  const discardedAdd = readZoomEditState("added zoom discarded");
  assertCondition(
    discardedAdd?.editing === false &&
      JSON.stringify(discardedAdd.zoomMarkers) === JSON.stringify(["pause-stop-marker-2"]) &&
      discardedAdd.unsaved === "false",
    "discarding a newly added zoom removes it and leaves the clip clean",
    discardedAdd,
  );
}

function runClipEditorZoomPreviewDrill() {
  if (!selectorExists('[data-testid="pause-stop-marker-2"][data-zoom="true"]')) {
    recordSkip("clip editor zoom preview", "The open clip has no seeded zoom-only moment.");
    return;
  }
  const readPreview = (label) => evaluate(`(() => {
    const editor = document.querySelector('[data-testid="clip-editor"]');
    const stage = document.querySelector('[data-testid="clip-editor-zoom-stage"]');
    const container = stage?.parentElement;
    const video = document.querySelector('[data-testid="clip-editor-video"]');
    const matrix = stage ? new DOMMatrixReadOnly(getComputedStyle(stage).transform) : null;
    const videoRect = video?.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    return {
      pauseActive: editor?.getAttribute("data-preview-pause-active") ?? null,
      zoomActive: stage?.getAttribute("data-zoom-active") ?? null,
      dataScale: stage ? Number(stage.getAttribute("data-zoom-scale")) : null,
      computedScale: matrix?.a ?? null,
      videoToContainerWidth: videoRect && containerRect ? videoRect.width / containerRect.width : null,
      time: video?.currentTime ?? null,
    };
  })()`, { label });

  click('[data-testid="timeline-start-marker"]');
  click('[data-testid="clip-preview"]');
  let state = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    state = readPreview("preview waiting for a pause stop");
    if (state?.pauseActive === "true") break;
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 250)"]);
  }
  assertCondition(state?.pauseActive === "true", "editor preview pauses at a moment", state);

  for (let attempt = 0; attempt < 4 && state?.zoomActive !== "true"; attempt += 1) {
    evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))`, {
      label: "preview jump to next moment",
    });
    state = readPreview("preview after jump");
  }
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 700)"]);
  const zoomed = readPreview("preview zoomed moment");
  assertCondition(
    zoomed?.zoomActive === "true" && Math.abs((zoomed.computedScale ?? 0) - 2.5) < 0.01 &&
      Math.abs((zoomed.videoToContainerWidth ?? 0) - 2.5) < 0.05,
    "editor preview zooms the video to the moment's scale",
    zoomed,
  );
  drive("screenshot", ["--output", join(reportDir, "zoom-preview.png")], { label: "zoom preview screenshot", allowFailure: true });

  evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))`, {
    label: "preview jump back to a non-zoom moment",
  });
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 300)"]);
  const unzoomed = readPreview("preview non-zoom moment");
  assertCondition(
    unzoomed?.zoomActive === "false" && Math.abs((unzoomed.computedScale ?? 0) - 1) < 0.01,
    "moments without zoom preview at 1×",
    unzoomed,
  );

  click('[data-testid="clip-preview"]');
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 300)"]);
  if (evaluate(`document.querySelector('[data-testid="clip-editor-video"]')?.paused === false`)) {
    click('[data-testid="clip-preview"]');
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

function runPlaybackWindowDrill() {
  optionalClick('[data-testid="nav-home"]');
  waitForSelector('[data-testid="overview-play-drill-playback-clip"]');
  click('[data-testid="overview-play-drill-playback-clip"]');
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 2500)"]);

  const ipcResult = run("auditaur", ["ipc", ...telemetryArgs(), "--limit", "80"], {
    label: "playback IPC telemetry",
  });
  const ipcRows = JSON.parse(ipcResult.stdout);
  const playVideoIpc = ipcRows.find((row) => row.command === "play_video");
  const showPlaybackIpc = ipcRows.find((row) => row.command === "show_playback_window");
  assertCondition(
    playVideoIpc?.status === "OK" && showPlaybackIpc?.status === "OK",
    "playback window opens through IPC",
    { playVideoIpc, showPlaybackIpc },
  );

  const logsResult = run("auditaur", ["logs", ...telemetryArgs(), "--limit", "200"], {
    label: "playback fullscreen logs",
  });
  const logs = JSON.parse(logsResult.stdout);
  const fullscreenLog = logs.find((row) => {
    const message = row.bodyJson?.message ?? row.body ?? "";
    return String(message).includes("Playback window created fullscreen");
  });
  assertCondition(
    Boolean(fullscreenLog),
    "playback window records fullscreen creation trace",
    { fullscreenLog },
  );
}

function runPlaybackZoomDrill() {
  optionalClick('[data-testid="nav-home"]');
  const playSelector = '[data-testid="overview-play-drill-zoom-playback-clip"]';
  waitForSelector(playSelector);
  click(playSelector);

  let zoomLog = null;
  for (let attempt = 0; attempt < 20 && !zoomLog; attempt += 1) {
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 500)"]);
    const logs = JSON.parse(run("auditaur", ["logs", ...telemetryArgs(), "--limit", "300"], {
      label: "playback zoom logs",
    }).stdout);
    zoomLog = logs
      .map((row) => String(row.bodyJson?.message ?? row.body ?? ""))
      .find((message) => message.includes("Playback zoom applied") && message.includes('"time":0.75'));
  }
  let details = null;
  try {
    details = zoomLog ? JSON.parse(zoomLog.slice(zoomLog.indexOf("{"), zoomLog.lastIndexOf("}") + 1)) : null;
  } catch {
    details = { raw: zoomLog };
  }
  const matrix = /matrix\(([^)]+)\)/.exec(details?.transform ?? "")?.[1]?.split(",").map(Number) ?? [];
  assertCondition(
    details?.scale === 3 && details.x === 80 && details.y === 20 &&
      Math.abs((matrix[0] ?? 0) - 3) < 0.01 && Math.abs((matrix[3] ?? 0) - 3) < 0.01 &&
      (matrix[4] ?? 0) < 0 && (matrix[5] ?? 1) <= 0,
    "playback window animates the stop's zoom to 3× toward the top-right point",
    { zoomLog, details, matrix },
  );
  // Smart anchoring: wherever the scaled video can fill an axis it must (no bars), and the point stays
  // fixed unless it had to move to pin the nearer edge.
  const axisOk = (axis, start, end, size) => {
    const c = details?.zoomedContent;
    if (!details?.anchor || !details?.anchorOnScreen || !c || !size) return false;
    const fills = c[end] - c[start] >= size - 1;
    if (fills && (c[start] > 1 || c[end] < size - 1)) return false;
    if (Math.abs(details.anchor[axis] - details.anchorOnScreen[axis]) < 1) return true;
    const pinnedEdge = details.anchor[axis] < size / 2 ? Math.abs(c[start]) < 1 : Math.abs(c[end] - size) < 1;
    return fills ? pinnedEdge : Math.abs((c[start] + c[end]) / 2 - size / 2) < 1;
  };
  assertCondition(
    axisOk("x", "left", "right", details?.viewport?.width) && axisOk("y", "top", "bottom", details?.viewport?.height),
    "zoom point stays fixed on screen unless shifted to avoid bars (smart anchoring, no drift)",
    { anchor: details?.anchor, anchorOnScreen: details?.anchorOnScreen, zoomedContent: details?.zoomedContent, viewport: details?.viewport },
  );
  assertCondition(
    details?.frozenFrame === true && details.videoVisibility === "hidden" && details.freezeFrameVisibility === "visible",
    "zoom animates a frozen canvas copy of the paused frame, not the live video layer",
    { frozenFrame: details?.frozenFrame, videoVisibility: details?.videoVisibility, freezeFrameVisibility: details?.freezeFrameVisibility },
  );
  assertCondition(
    details?.seeked === false && Math.abs(details?.stopDriftMs ?? Infinity) <= 50,
    "playback pauses on the zoom stop without seeking back (no jump before the freeze)",
    { stopDriftMs: details?.stopDriftMs, seeked: details?.seeked },
  );

  evaluate(`window.__TAURI_INTERNALS__?.invoke("close_playback_window").then(() => true, () => false)`, {
    label: "close zoomed playback window",
    allowFailure: true,
  });
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 750)"]);
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
runTextSnippetSaveTrackingDrill();

click('[data-testid="nav-videos"]');
waitForAnySelector(['[data-testid="no-videos"]', '[data-testid="video-list"]']);

click('[data-testid="nav-automations"]');
waitForAnySelector(['[data-testid="automation-empty-state"]', '[data-testid="automation-list"]']);

runClipEditorDrills();
runPlaybackWindowDrill();
runPlaybackZoomDrill();
runMacCompatibilityDrills();

run("auditaur", ["ipc", ...telemetryArgs()], { label: "IPC telemetry" });
run("auditaur", ["traces", ...telemetryArgs()], { label: "trace telemetry" });
run("auditaur", ["timeline", ...telemetryArgs()], { label: "timeline telemetry" });
run("auditaur", ["errors", ...telemetryArgs()], { label: "error telemetry" });
run("auditaur", ["explain", ...telemetryArgs()], { label: "explain telemetry" });

stopWrappedApp();
writeReport();
