# Snipsy Stream Deck Plugin

This is the Stream Deck plugin source package for Snipsy. It binds Stream Deck keys to Snipsy snippets by sending semantic `triggerButton` requests to the Snipsy control descriptor endpoint instead of replaying hotkeys.

## Development

```powershell
npm run build:streamdeck
```

The build writes the bundled plugin entry point to:

```text
streamdeck-plugin/com.snipsy.streamdeck.sdPlugin/bin/plugin.mjs
```

The plugin discovers Snipsy through `stream-deck-control.json`, then uses the advertised native transport. On Windows, that transport is an owner/SYSTEM-only named pipe owned by the running Snipsy process. On macOS and Linux, Snipsy advertises an owner-only Unix domain socket.

## Current scope

- One keypad action: **Trigger Snipsy Snippet**.
- Property inspector can set a project path, refresh Snipsy buttons, and save a selected text/video snippet binding.
- Key press sends `triggerButton` through Snipsy's native IPC and shows Stream Deck alert/checkmark feedback.

The official Stream Deck plugin package targets Windows and macOS. The Snipsy backend transport also supports Linux for direct clients and future compatible surfaces.
