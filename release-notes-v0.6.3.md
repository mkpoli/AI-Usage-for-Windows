Windows tray build of AI Usage. Rainmeter desktop widgets, one skin per provider, plus fixes that keep the widget's reset line inside its box.

## Added

- Rainmeter skins that show a provider's usage bar on the desktop, one skin per provider, in [`rainmeter/`](rainmeter/). They read the loopback API, so no credentials pass through Rainmeter. See [docs/rainmeter.md](docs/rainmeter.md).

- `GET /v1/rainmeter` and `GET /v1/rainmeter/<providerId>` on the local HTTP API, answering with flat `key=value` text in a fixed line order, which Rainmeter's regex-based reader needs. A known provider with no cached usage answers with the same keys and empty values, so a widget can tell a closed app from an unmeasured provider.

- Desktop Widgets in Settings, which opens and closes the local HTTP API. A busy port is reported in the panel and the choice is kept, so a freed port is picked up at the next launch.

## Changed

- The local HTTP API is switched on in Settings instead of through the `AI_USAGE_ENABLE_LOCAL_HTTP_API` environment variable. It stays off by default.

## Fixed

- The Rainmeter widget shows the reset countdown only when the limit actually resets, and keeps it hidden for providers without one.

- The Rainmeter widget box grows with its content, so the countdown line stays inside the black box with a small bottom margin instead of overflowing below it.

## Install

Download and run either installer:

- `AI.Usage_0.6.3_x64-setup.exe` — NSIS installer
- `AI.Usage_0.6.3_x64_en-US.msi` — MSI installer

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
