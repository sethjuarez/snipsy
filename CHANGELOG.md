# Changelog

## [0.6.0](https://github.com/sethjuarez/snipsy/compare/v0.5.1...v0.6.0) (2026-03-07)


### Features

* add auto-updater UI with update indicator in title bar ([713c976](https://github.com/sethjuarez/snipsy/commit/713c9762b9f6ee22cd48f81e78caaed087d9f685))


### Documentation

* update AUTO-UPDATER.md to reflect active status ([b1ef295](https://github.com/sethjuarez/snipsy/commit/b1ef2950345258081813e816c2fd8e9cf8afbd96))

## [0.5.1](https://github.com/sethjuarez/snipsy/compare/v0.5.0...v0.5.1) (2026-03-07)


### CI/CD

* add libgbm-dev for Linux build ([1e54fcf](https://github.com/sethjuarez/snipsy/commit/1e54fcf09b7ddc5ed74c2948c4492b5ec0eb4187))

## [0.5.0](https://github.com/sethjuarez/snipsy/compare/v0.4.0...v0.5.0) (2026-03-07)


### Features

* add hide cursor option to video clips ([77c744a](https://github.com/sethjuarez/snipsy/commit/77c744a009d4a0d75fea7b47b2c76d2e109767b3))
* cursor visibility indicator on video snippet list ([3d442eb](https://github.com/sethjuarez/snipsy/commit/3d442eb95666566b43a5121d81003c0be39f2c9b))
* drag-and-drop reordering for text snippets ([ce802a0](https://github.com/sethjuarez/snipsy/commit/ce802a02ff2a593619e5c1b7c8fa8f8dc467094a))
* show version badge in status bar with -dev suffix in dev mode ([21562f7](https://github.com/sethjuarez/snipsy/commit/21562f73daac3b690a4931e19a4c7200f7d9dfdd))


### Bug Fixes

* recorder captures window context at click time, fixes scroll coalescing ([9ec7f71](https://github.com/sethjuarez/snipsy/commit/9ec7f71dc489f73f18bff0c5ebdc0e4ed3c9a22f))

## [0.4.0](https://github.com/sethjuarez/snipsy/compare/v0.3.0...v0.4.0) (2026-03-07)


### Features

* enhanced script data model with platform tagging, window-relative coords, and L3-forward schema ([3b4a133](https://github.com/sethjuarez/snipsy/commit/3b4a1339aa4e8c69d66ff6b19f2c792926f0827f))
* modifier combo replay, FFmpeg guard, and script polish ([5e1d1df](https://github.com/sethjuarez/snipsy/commit/5e1d1dfe242ecadb9989c1bb8930569035b12841))
* script recording infrastructure with rdev global input capture and recording UI ([b8bc2f4](https://github.com/sethjuarez/snipsy/commit/b8bc2f4fcbcce461bbbe74f7d85332c2a6d5fd30))
* window-relative coordinate replay and Replay & Record button ([4a86ba6](https://github.com/sethjuarez/snipsy/commit/4a86ba61e600a3fa43d417dc1910395e38d4f032))


### CI/CD

* add libpipewire-0.3-dev for rdev on Linux ([025648c](https://github.com/sethjuarez/snipsy/commit/025648c8a3f8553804d3ddc2fd0f3ffe80d6a956))

## [0.3.0](https://github.com/sethjuarez/snipsy/compare/v0.2.0...v0.3.0) (2026-03-07)


### Features

* add Lucide icons and folder browse dialog ([0d5ac6e](https://github.com/sethjuarez/snipsy/commit/0d5ac6eb60456b00b53c12a8c946a746a2c5b4dd))
* add Restart Snipsy button after FFmpeg install ([27f6a51](https://github.com/sethjuarez/snipsy/commit/27f6a511f8068d58ceb8ce64e044bf74cacc1b3f))
* admin elevation detection with relaunch-as-admin for focus protection ([d79a144](https://github.com/sethjuarez/snipsy/commit/d79a1440875e4c56337db69428c962adde65ee92))
* big play button on each clip for instant preview ([39d083b](https://github.com/sethjuarez/snipsy/commit/39d083b3cc37b8202bc75984b2f9df0b3a1581cf))
* BlockInput prevents focus steal during text delivery (AHK pattern) ([f7520b6](https://github.com/sethjuarez/snipsy/commit/f7520b6418b7aa12a684b0f76bacebfbb6a82613))
* clickable FFmpeg warnings with install helper dialog ([0d05859](https://github.com/sethjuarez/snipsy/commit/0d05859c5b430ee9bd8dbf885c3856292f24a94e))
* complete UI/UX overhaul with desktop app layout ([2d2f96a](https://github.com/sethjuarez/snipsy/commit/2d2f96aa2afa1a307102e3c1d9c38ab01d1f9fd4))
* cross-platform focus lock prevents text going to wrong window ([b0e6183](https://github.com/sethjuarez/snipsy/commit/b0e6183598940c45e008cb9462da4f2f88902a39))
* custom Snipsy app icon with snippet card design ([2733b96](https://github.com/sethjuarez/snipsy/commit/2733b963518aa37e6bb2cac3add31b97e5f53798))
* demo mode minimizes to system tray with glowing LIVE indicator ([366f320](https://github.com/sethjuarez/snipsy/commit/366f32007ee6aee0c56483d449e10a2b26ccaed5))
* edit video snippets in visual clip editor with pre-populated fields ([cf2a601](https://github.com/sethjuarez/snipsy/commit/cf2a601a8eafe299cf32f6682e727c0425f9708f))
* end behavior option — freeze on last frame or close window ([bebe5c9](https://github.com/sethjuarez/snipsy/commit/bebe5c9542ce4754cec27b1ed30d27b24fa22237))
* end handle previews video + target duration replaces speed buttons ([c8b1f1a](https://github.com/sethjuarez/snipsy/commit/c8b1f1a5622f7511305467abaedd27734ba3903d))
* frame-by-frame adjustment for clip start/end handles ([d45f010](https://github.com/sethjuarez/snipsy/commit/d45f01021cba47e5878c6119ce48f94047f8e73d))
* hold-to-repeat on frame-step buttons ([62b8e57](https://github.com/sethjuarez/snipsy/commit/62b8e57d3d3eebd898c768cdc53887d1de2f800f))
* monitor screenshot preview with refresh button ([3b17b8d](https://github.com/sethjuarez/snipsy/commit/3b17b8d7bbba09c2f56fbc5bc23e7af239ebbb6b))
* monitor selector dropdown in clip editor ([559ac55](https://github.com/sethjuarez/snipsy/commit/559ac55b6c8f55ae03f2929eb811b21023a5b630))
* navigate to clips list after save, fallback monitor on playback ([87ff907](https://github.com/sethjuarez/snipsy/commit/87ff9074b62db3a7375050d665e1b063d9eb3c59))
* Open Project directly launches folder picker ([ede064c](https://github.com/sethjuarez/snipsy/commit/ede064c1779d9d3b572cb821c590c856da1d2029))
* play video on selected monitor ([ef3c7b3](https://github.com/sethjuarez/snipsy/commit/ef3c7b34e8e44c1016b49876e13faadbee53065f))
* register OS-level global shortcuts for text snippet delivery ([3c5e898](https://github.com/sethjuarez/snipsy/commit/3c5e8982b4822e85a4de8e04bf1f58b500e02936))
* remove video with confirmation dialog and associated clip cleanup ([0d0d097](https://github.com/sethjuarez/snipsy/commit/0d0d097f5c26375c212ff2345ea18d6128723446))
* rich home screen with recent projects and auto-open ([81e81ef](https://github.com/sethjuarez/snipsy/commit/81e81efb311bedf1092263050f11c9493df1d2a0))
* video clip editor with thumbnail cards and timeline scrubber ([1e180b2](https://github.com/sethjuarez/snipsy/commit/1e180b2b30f590a4059a7d0d670355f7c0f35bdd))
* wire video snippet hotkeys to play video in demo mode ([f658471](https://github.com/sethjuarez/snipsy/commit/f658471579fc280caf900f5129e4540a09f688f8))


### Bug Fixes

* add pointer cursor for all interactive elements ([4b9fbb6](https://github.com/sethjuarez/snipsy/commit/4b9fbb6d277093571f828216b3ab01a677a1964e))
* add window control permissions and rewrite titlebar for Tauri ([450cf89](https://github.com/sethjuarez/snipsy/commit/450cf89a6b7d46da193f26113bd27a01d7f0855e))
* auto-restart app after FFmpeg install to pick up new PATH ([7ca2fd6](https://github.com/sethjuarez/snipsy/commit/7ca2fd6f7d429c96de1fd4a7beadf0c386dd374e))
* clip editor hotkey capture matches text snippet pattern ([66dec37](https://github.com/sethjuarez/snipsy/commit/66dec3735f5c3b30f3239f57432ebb9b29cb5f0a))
* detect FFmpeg from user PATH when running as admin ([5dfd4cf](https://github.com/sethjuarez/snipsy/commit/5dfd4cf5dd0ffe993f78986c9a3cf9cff24f18c5))
* enable asset protocol so thumbnails load in webview ([30eee97](https://github.com/sethjuarez/snipsy/commit/30eee9721a66bee74c84aa667426e7ca51b26a35))
* enable frameless window and fix titlebar click handling ([de9e5bd](https://github.com/sethjuarez/snipsy/commit/de9e5bd9fc83d87fca8dec1a69a3d434f5f1eedb))
* frame-step buttons now correctly update on each click ([60598cd](https://github.com/sethjuarez/snipsy/commit/60598cd129ab9ea47c46aa290379e483f3bf94a9))
* frame-step now pauses video, shows precise time, preloads for seeking ([d86f6db](https://github.com/sethjuarez/snipsy/commit/d86f6db2bf012e6d9b6ddd40d7e451a11debb35d))
* hide console window when relaunching as admin in dev mode ([254abd4](https://github.com/sethjuarez/snipsy/commit/254abd49031dfa857888c60a8bafb5eac8691595))
* hotkey capture uses physical key codes for Tauri compatibility ([d1fedf2](https://github.com/sethjuarez/snipsy/commit/d1fedf246ced0e67e761c9b54906a01c866712ea))
* persist imported videos by reading from disk on project load ([35969fe](https://github.com/sethjuarez/snipsy/commit/35969fe1db86636fd0f059b70a1ba64462860358))
* persist targetMonitor in Rust VideoSnippet model ([54a6212](https://github.com/sethjuarez/snipsy/commit/54a6212e19bef0968ffdf04042ca210b31999615))
* playback window fills screen without gaps ([64eface](https://github.com/sethjuarez/snipsy/commit/64efacef5416aa44fe995cd952f608a220c72938))
* playback window now loads video via asset protocol ([0df6a60](https://github.com/sethjuarez/snipsy/commit/0df6a601a358679afc086946d52cf9582d804646))
* release modifier keys before text delivery to prevent stuck Ctrl/Shift ([4d70154](https://github.com/sethjuarez/snipsy/commit/4d7015431613644fae541ee6f842942d84602008))
* replace red titlebar with pulsing red stop icon for demo mode ([1826f21](https://github.com/sethjuarez/snipsy/commit/1826f216b8f0bca1f0e411d2b0d3133539844292))
* titlebar drag and button clicks using cutready pattern ([b04bf97](https://github.com/sethjuarez/snipsy/commit/b04bf9798e5db630ff22ab980af9df007a63657e))
* video import opens native file picker dialog ([d24642d](https://github.com/sethjuarez/snipsy/commit/d24642d50ded16efd8af1d4cbe1f6c09be3eecf8))


### Miscellaneous

* remove dead code warning for PlayVideoParams ([70cd223](https://github.com/sethjuarez/snipsy/commit/70cd223923d0b9722a82de8f53b63a3670fe1c2b))


### Refactoring

* compact clip editor layout to maximize video space ([97c69b8](https://github.com/sethjuarez/snipsy/commit/97c69b871b86f9961770fe762521378a89c00079))
* switch video list from card grid to compact list layout ([2470c0c](https://github.com/sethjuarez/snipsy/commit/2470c0c1d79c2c363f651af58501ab66f7dd4258))

## [0.2.0](https://github.com/sethjuarez/snipsy/compare/v0.1.0...v0.2.0) (2026-03-06)


### Features

* configure auto-updater with GitHub Releases endpoint ([1f46aee](https://github.com/sethjuarez/snipsy/commit/1f46aeec643eaf801a9df61549bee378835b035c))
* demo mode Rust module with hotkey registration ([d26294e](https://github.com/sethjuarez/snipsy/commit/d26294e5d4b6b7b1f7783197496c6f513c06b1b9))
* demo mode toggle UI + Playwright test ([5be1260](https://github.com/sethjuarez/snipsy/commit/5be126091818748140fffd761e6b47c44a160668))
* FFmpeg integration + detection ([55b44ec](https://github.com/sethjuarez/snipsy/commit/55b44ec6412df0eaa50c5ea121300317c8e09fc0))
* frameless playback window Tauri command ([bd1ff5a](https://github.com/sethjuarez/snipsy/commit/bd1ff5a3443c5e6ed54f99e7c89dc60f2dce555d))
* frontend service abstraction layer ([2a4975d](https://github.com/sethjuarez/snipsy/commit/2a4975d9ccd62e67857cb70e39910688d695db3a))
* playback UI route + Playwright test ([f7ecf6e](https://github.com/sethjuarez/snipsy/commit/f7ecf6e5c956b94de902b46fce03c813846412b9))
* project I/O Tauri commands with integration tests ([e15a88e](https://github.com/sethjuarez/snipsy/commit/e15a88e06524e467e7e3d49dcf3da798a307729f))
* project store + routing ([4b4b4ad](https://github.com/sethjuarez/snipsy/commit/4b4b4ad863b474871882b291d16a6edeff125a26))
* Rust data model structs with serde + tests ([aca695b](https://github.com/sethjuarez/snipsy/commit/aca695bbda5a4ed9efee9fac6b28ec8f65908e6c))
* script CRUD — Rust commands + UI + tests ([301febc](https://github.com/sethjuarez/snipsy/commit/301febca1bb32c4df0d9ab630a0c080b38f19125))
* script execution engine ([97a78a6](https://github.com/sethjuarez/snipsy/commit/97a78a683e153242cfc13b75797f4f7679f0dde5))
* system tray integration ([b412078](https://github.com/sethjuarez/snipsy/commit/b412078589d5a26147bc39dfeaf6cb9ffaf46fa9))
* text delivery via enigo (fast-type + paste) ([a09dfe4](https://github.com/sethjuarez/snipsy/commit/a09dfe42d5291909f60ec63e8acd78d494361df6))
* text snippet create/edit form + Playwright tests ([47862dc](https://github.com/sethjuarez/snipsy/commit/47862dc8191790ca77ab69258c4fcaf9ee235bcb))
* text snippet delete + Playwright test ([99b2c6b](https://github.com/sethjuarez/snipsy/commit/99b2c6b9d59d1c4d90d23b9d49f31f5b8b79900a))
* text snippet list view + Playwright test ([3d0cd89](https://github.com/sethjuarez/snipsy/commit/3d0cd89df9476c799bee0e2988f2f1d7b953cce7))
* transition action execution engine ([eee6ad2](https://github.com/sethjuarez/snipsy/commit/eee6ad20a9c07da77ae4224ade1162fe656ea4a6))
* transition action UI + Playwright test ([2b9eb93](https://github.com/sethjuarez/snipsy/commit/2b9eb93418788f1cb42e80c99d6d9fa8e3c255f9))
* TypeScript type definitions ([7ee87e8](https://github.com/sethjuarez/snipsy/commit/7ee87e87a9bd075f9283aaae43facef8a9957ebc))
* video import Tauri command ([a0212e4](https://github.com/sethjuarez/snipsy/commit/a0212e46cef4832d80215b0b88c813eb65295676))
* video import UI + Playwright test ([6413aac](https://github.com/sethjuarez/snipsy/commit/6413aac2056da1e965fefa05f2167d34cd0e431a))
* video snippet CRUD + Playwright tests ([748f6e2](https://github.com/sethjuarez/snipsy/commit/748f6e22d6ed4cdc7c5b8e975210c62b086cf2db))
* video timeline component + Playwright test ([d9f9164](https://github.com/sethjuarez/snipsy/commit/d9f916492d3498bdae5a552187f04a66fab7e194))
* wire video hotkeys to playback window ([60bbf74](https://github.com/sethjuarez/snipsy/commit/60bbf748bc2f1243fb2513f4a472df91975a8820))


### Bug Fixes

* **ci:** correct release-please extra-files config ([bcf33e4](https://github.com/sethjuarez/snipsy/commit/bcf33e4f544e37cbe9577606d0c27f7b9c172d62))


### Miscellaneous

* add Tauri update signing pubkey and configure secrets ([b4b0358](https://github.com/sethjuarez/snipsy/commit/b4b0358d7e5628f4b53f4155ff37a319136a5338))


### Documentation

* code signing documentation ([b498688](https://github.com/sethjuarez/snipsy/commit/b498688c6636e7c7fe1226559c4abb73c304b648))


### Build

* add Playwright with smoke test ([9433cc8](https://github.com/sethjuarez/snipsy/commit/9433cc817a5e315d887529d57c1bce97c7ff17c8))
* add React Router + Zustand ([8204f8e](https://github.com/sethjuarez/snipsy/commit/8204f8e34fa2602bac24b034fd761e76990c9d14))
* add Rust test scaffold ([8da3cb7](https://github.com/sethjuarez/snipsy/commit/8da3cb7736401b6dfcfbe4b2251d516a2b02fe59))
* add Tailwind CSS v4 ([8077f28](https://github.com/sethjuarez/snipsy/commit/8077f288f419c981f3a94081618b25be97acc150))
* auto-updater configuration ([2959d03](https://github.com/sethjuarez/snipsy/commit/2959d03819742e526b7304f17ab3b40f78f3f156))
* bundle configuration ([5e31318](https://github.com/sethjuarez/snipsy/commit/5e31318348478e79b131c9b594594498b87744cb))
* CI/CD release pipeline ([54d7b25](https://github.com/sethjuarez/snipsy/commit/54d7b25ca4deb19ea5cdc35848410edd58ac59ed))
* scaffold Tauri v2 + React + TypeScript + Vite ([ca8d32f](https://github.com/sethjuarez/snipsy/commit/ca8d32f53608318616dee24737ad2460fa310055))


### CI/CD

* add sccache to CI workflow for faster Rust builds ([24bf1c6](https://github.com/sethjuarez/snipsy/commit/24bf1c679be1664f23a6bb7a0fd344b360211d80))
* match cutready workflow structure exactly ([c24eed4](https://github.com/sethjuarez/snipsy/commit/c24eed4a472bb98b0eac082437115be496ff9ab3))
* move tests to release workflows only, keep CI lightweight ([f33684b](https://github.com/sethjuarez/snipsy/commit/f33684b2e65508f02fad27a6bf65f97619e5e3d9))
* remove sccache from CI workflow for reliability ([2aff6a5](https://github.com/sethjuarez/snipsy/commit/2aff6a5a24f8e97805fc635164952e11e12375fb))
* rewrite CI/CD pipelines based on cutready patterns ([f35b831](https://github.com/sethjuarez/snipsy/commit/f35b83129f843268414f58039dd7d78df665319a))
