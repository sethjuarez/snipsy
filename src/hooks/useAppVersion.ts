import { useEffect, useState } from "react";

/** App version from Tauri, with a `-dev` suffix in development; "dev" in the browser. */
export function useAppVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__TAURI_INTERNALS__) {
      import("@tauri-apps/api/app")
        .then(({ getVersion }) => getVersion())
        .then((v) => setVersion(import.meta.env.DEV ? `${v}-dev` : v))
        .catch(() => setVersion("dev"));
    } else {
      setVersion("dev");
    }
  }, []);
  return version;
}
