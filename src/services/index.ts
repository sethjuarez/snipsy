import type { BackendService } from "./backendService";
import { TauriBackendService } from "./tauriBackendService";
import { MockBackendService } from "./mockBackendService";

export type { BackendService };
export { TauriBackendService, MockBackendService };

export function createBackendService(): BackendService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).__TAURI_INTERNALS__) {
    return new TauriBackendService();
  }
  return new MockBackendService();
}
