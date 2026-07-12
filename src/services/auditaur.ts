import { initAuditaur, type AuditaurClient } from "@auditaur/api";
import { convertFileSrc as rawConvertFileSrc, invoke as rawInvoke } from "@tauri-apps/api/core";

const serviceName = "snipsy";

let clientPromise: Promise<AuditaurClient | null> | null = null;

type SnipsyWindow = Window & { __IS_PLAYBACK?: boolean };

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getDriveBridgeConfig() {
  if (!import.meta.env.DEV || (window as SnipsyWindow).__IS_PLAYBACK) {
    return false;
  }

  return {
    windowLabel: "main",
    pollIntervalMs: 100,
  };
}

export function initializeAuditaur() {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }

  clientPromise ??= initAuditaur({
    serviceName,
    instrumentConsole: true,
    instrumentErrors: true,
    instrumentTauriInvoke: true,
    propagateTauriInvokeTraceContext: true,
    instrumentTauriEvents: true,
    captureFullPayloads: false,
    batchIntervalMs: 500,
    driveBridge: getDriveBridgeConfig(),
    onExportError(failure) {
      console.warn("Auditaur export failed", failure.error);
    },
  }).catch((error: unknown) => {
    console.warn("Auditaur initialization failed", error);
    return null;
  });

  return clientPromise;
}

export async function auditaurInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const client = await initializeAuditaur();
  if (client) {
    return client.invoke<T>(command, args);
  }
  return rawInvoke<T>(command, args);
}

export async function auditaurListen<T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): Promise<() => void> {
  const client = await initializeAuditaur();
  if (client) {
    return client.listen<T>(event, handler);
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, handler);
}

export function tauriFileSrc(path: string) {
  return rawConvertFileSrc(path);
}

export async function flushAuditaur() {
  const client = await clientPromise;
  await client?.flush();
}
