# Code Signing — Snipsy

## Overview

Code signing ensures that Snipsy installers are trusted by the operating system and not flagged by SmartScreen (Windows) or Gatekeeper (macOS).

## Windows (Authenticode)

1. Obtain an EV or OV code signing certificate from a Certificate Authority (e.g., DigiCert, Sectigo).
2. Set the following environment variables (or GitHub Actions secrets):
   - `TAURI_SIGNING_PRIVATE_KEY` — Base64-encoded private key for Tauri's built-in updater signing.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — Password for the private key (if applicable).
3. For Authenticode signing of the `.exe` and NSIS installer, use `signtool`:
   ```
   signtool sign /f certificate.pfx /p <password> /tr http://timestamp.digicert.com /td sha256 /fd sha256 Snipsy_0.1.0_x64-setup.exe
   ```
4. In CI, store the `.pfx` as a base64-encoded GitHub secret and decode it before signing.

## macOS (Apple Developer)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a "Developer ID Application" certificate in Xcode or Apple Developer portal.
3. Set these environment variables:
   - `APPLE_CERTIFICATE` — Base64-encoded `.p12` certificate.
   - `APPLE_CERTIFICATE_PASSWORD` — Password for the `.p12` file.
   - `APPLE_SIGNING_IDENTITY` — e.g., `Developer ID Application: Your Name (TEAM_ID)`.
   - `APPLE_ID` — Apple ID email for notarization.
   - `APPLE_PASSWORD` — App-specific password for notarization.
   - `APPLE_TEAM_ID` — Your Apple Developer Team ID.
4. Tauri handles signing and notarization automatically when these environment variables are set during `tauri build`.

## Linux

- Code signing is optional for Linux distributions.
- For `.deb` packages, consider GPG-signing the repository.
- For AppImage, use `appimagetool --sign` if distributing outside package managers.

## GitHub Actions Secrets

Add the following secrets to your GitHub repository settings:

| Secret Name | Platform | Description |
|-------------|----------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | All | Tauri updater signing key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | All | Password for Tauri signing key |
| `WINDOWS_CERTIFICATE` | Windows | Base64-encoded `.pfx` certificate |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows | Password for the `.pfx` |
| `APPLE_CERTIFICATE` | macOS | Base64-encoded `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | macOS | Password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | macOS | Signing identity string |
| `APPLE_ID` | macOS | Apple ID for notarization |
| `APPLE_PASSWORD` | macOS | App-specific password |
| `APPLE_TEAM_ID` | macOS | Apple Developer Team ID |
