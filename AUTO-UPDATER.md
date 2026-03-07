# Auto-Updater — Snipsy

## Status: Active

The auto-updater is fully wired end-to-end using `tauri-plugin-updater`.

### How It Works

1. **On startup**, the app silently checks the GitHub Releases endpoint for a newer version.
2. If an update is available, a **download icon with a pulsing dot** appears in the title bar.
3. Clicking the icon opens a dropdown showing the **version number** and **release notes**.
4. The user clicks **"Download & Install"** to start the update — progress is shown inline (MB downloaded).
5. After installation completes, the app **automatically relaunches**.

### Architecture

| Layer | Component | Purpose |
|-------|-----------|---------|
| Rust | `tauri-plugin-updater` in `lib.rs` | Plugin initialization |
| Config | `tauri.conf.json` → `plugins.updater` | Endpoint, public key, install mode |
| Store | `src/stores/updateStore.ts` | Zustand store — check, track, dismiss |
| UI | `src/components/UpdateIndicator.tsx` | Title bar icon + dropdown |
| Startup | `src/App.tsx` | Calls `checkForUpdate()` on mount |
| CI | Release workflows | Signs artifacts with `TAURI_SIGNING_PRIVATE_KEY` |

### Configuration

The updater endpoint points to GitHub Releases:
```
https://github.com/sethjuarez/snipsy/releases/latest/download/latest.json
```

The `latest.json` manifest is generated automatically by `tauri-apps/tauri-action` during CI releases (with `createUpdaterArtifacts: true`).

### Signing

- **Public key** is stored in `tauri.conf.json`.
- **Private key** is stored as a GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY`).
- Local builds do not require the signing key — use `npm run tauri dev` for development.

### Testing

Playwright tests cover the update indicator UI in `tests/updateIndicator.spec.ts`:
- Hidden when no update available
- Visible with correct version/notes when update exists
- Dropdown opens/closes correctly
- Install progress display
