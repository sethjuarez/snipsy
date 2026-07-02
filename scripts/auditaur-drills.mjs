import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const appName = process.env.SNIPSY_AUDITAUR_APP ?? "snipsy";
const shouldStartApp = process.env.SNIPSY_AUDITAUR_DRILL_START_APP === "1";
const timeoutSeconds = process.env.SNIPSY_AUDITAUR_TIMEOUT_SECONDS ?? "120";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const reportDir = resolve(process.env.SNIPSY_AUDITAUR_DRILL_REPORT_DIR ?? "target/auditaur-drills");
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
  const result = drive(
    "evaluate",
    ["--expression", `document.querySelector(${JSON.stringify(selector)}) !== null`],
    { allowFailure: true, label: `selector probe ${selector}` },
  );
  if (result.status !== 0) return false;

  try {
    const payload = JSON.parse(result.stdout).payload;
    return payload === true ||
      payload?.value === true ||
      payload?.result === true ||
      payload?.jsonValue === true;
  } catch {
    return result.stdout.includes("true");
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

if (selectorExists('[data-testid="new-project"]')) {
  click('[data-testid="new-project"]');
  waitForSelector("#welcome-path");
  fill("#welcome-path", drillProjectPath);
  fill("#welcome-name", "Auditaur Drill Project");
  fill("#welcome-description", "Created by the Auditaur confidence drill.");
  click('[data-testid="create-project-submit"]');
}

waitForSelector('[data-testid="sidebar"]');
waitForSelector('[data-testid="nav-text-snippets"]');
click('[data-testid="nav-text-snippets"]');
waitForAnySelector(['[data-testid="empty-state"]', '[data-testid="text-snippet-list"]']);

click('[data-testid="nav-videos"]');
waitForAnySelector(['[data-testid="no-videos"]', '[data-testid="video-list"]']);

click('[data-testid="nav-scripts"]');
waitForAnySelector(['[data-testid="script-empty-state"]', '[data-testid="script-list"]']);

run("auditaur", ["ipc", ...telemetryArgs()], { label: "IPC telemetry" });
run("auditaur", ["traces", ...telemetryArgs()], { label: "trace telemetry" });
run("auditaur", ["timeline", ...telemetryArgs()], { label: "timeline telemetry" });
run("auditaur", ["errors", ...telemetryArgs()], { label: "error telemetry" });
run("auditaur", ["explain", ...telemetryArgs()], { label: "explain telemetry" });

stopWrappedApp();
writeReport();
