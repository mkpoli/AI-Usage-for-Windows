Windows tray build of AI Usage. First release the app can install by itself: the in-app update check now finds releases, verifies them, and installs them.

## Fixed

- The in-app update check can now complete. Builds ship signed updater artifacts, each release publishes the `latest.json` the check reads, and the app verifies against this project's own signing key. Versions up to v0.4.0 need one manual install of this release; the app updates itself from then on.

## Install

Download and run either installer:

- `AI.Usage_0.4.1_x64-setup.exe` — NSIS installer
- `AI.Usage_0.4.1_x64_en-US.msi` — MSI installer

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
