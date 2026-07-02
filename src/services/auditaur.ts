import { initAuditaur, type AuditaurClient } from "@auditaur/api";
import { invoke as rawInvoke } from "@tauri-apps/api/core";

const serviceName = "snipsy";

let clientPromise: Promise<AuditaurClient | null> | null = null;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
    driveBridge: import.meta.env.DEV
      ? {
          windowLabel: "main",
          pollIntervalMs: 100,
        }
      : false,
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

export async function flushAuditaur() {
  const client = await clientPromise;
  await client?.flush();
}
