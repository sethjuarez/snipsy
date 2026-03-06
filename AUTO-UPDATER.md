# Auto-Updater — Snipsy

## Status: Deferred

The Tauri v2 built-in updater (`tauri-plugin-updater`) supports over-the-air updates via a static JSON manifest.

### When to Enable

Enable auto-updates when:
- Snipsy has a public user base requiring seamless updates.
- A hosting endpoint is set up for the update manifest (e.g., snipsy.dev or CrabNebula Cloud).

### How to Enable

1. Add `tauri-plugin-updater` to `Cargo.toml`:
   ```toml
   tauri-plugin-updater = "2"
   ```

2. Register the plugin in `lib.rs`:
   ```rust
   .plugin(tauri_plugin_updater::Builder::new().build())
   ```

3. Add updater config to `tauri.conf.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "endpoints": ["https://snipsy.dev/updates/{{target}}/{{arch}}/{{current_version}}"],
         "pubkey": "YOUR_PUBLIC_KEY_HERE"
       }
     }
   }
   ```

4. Generate signing keys:
   ```
   npx @tauri-apps/cli signer generate -w ~/.tauri/snipsy.key
   ```

5. Host the update manifest JSON at the configured endpoint.

### Current Approach

Users download new versions manually from GitHub Releases. The CI/CD pipeline (see `.github/workflows/release.yml`) attaches installers to each release.
