# Snipsy Stream Deck Plugin

This is the Stream Deck plugin source package for Snipsy. It binds Stream Deck keys to Snipsy snippets by sending semantic `triggerButton` requests to the Snipsy control descriptor endpoint instead of replaying hotkeys.

## Development

```powershell
npm run build:streamdeck
npm run package:streamdeck
```

The build writes the bundled plugin entry point to:

```text
streamdeck-plugin/com.snipsy.streamdeck.sdPlugin/bin/plugin.mjs
```

The package command writes the installable Stream Deck plugin archive to:

```text
dist/streamdeck/Snipsy.streamDeckPlugin
```

The plugin discovers Snipsy through `stream-deck-control.json`, then uses the advertised native transport. On Windows, that transport is an owner/SYSTEM-only named pipe owned by the running Snipsy process. On macOS and Linux, Snipsy advertises an owner-only Unix domain socket.

## Current scope

- One keypad action: **Trigger Snipsy Snippet**.
- Property inspector can set a project path, refresh Snipsy buttons, and save a selected text/video snippet binding.
- Key press sends `triggerButton` through Snipsy's native IPC and shows Stream Deck alert/checkmark feedback.

The official Stream Deck plugin package targets Windows and macOS. The Snipsy backend transport also supports Linux for direct clients and future compatible surfaces.

## Install and smoke test

1. Run `npm run package:streamdeck`.
2. Open `dist/streamdeck/Snipsy.streamDeckPlugin` with Stream Deck.
3. Start Snipsy and open the project you want to control.
4. Add **Trigger Snipsy Snippet** to a Stream Deck key.
5. In the property inspector, enter the Snipsy project path, refresh, choose a snippet, and save.
6. Press the key. Text snippets should deliver through Snipsy; video snippets should open the Snipsy playback window.

Expected key states:

| State | Meaning |
| --- | --- |
| `Bind in Snipsy` | The key has no saved project/snippet binding yet. |
| `Open Snipsy` | Snipsy is not running or has not published its descriptor. |
| `Snipsy Offline` | Snipsy is running but the native transport is unavailable. |
| `Stale Binding` | The saved snippet no longer exists in that project. |
| `Project? Missing` | The saved project path no longer points at a readable Snipsy project. |
| `Snipsy Busy` | Another Stream Deck-triggered snippet is still executing. |
| `Update Snipsy` | The plugin and app protocol/transport versions are incompatible. |
