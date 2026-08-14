Windows tray build of AI Usage. Z.ai joins the bundled providers.

## Added

- Z.ai provider for the GLM Coding plan. It reports the five-hour and weekly token windows, both of which the API returns as percentages, and the monthly quota of web search and reader calls, alongside the subscribed plan name. The API key comes from the `ZAI_API_KEY` environment variable, or `GLM_API_KEY`; store it as a Windows user variable so the tray app can read it. Bundled and disabled by default, so enable Z.ai in Settings after setting the key.

## Install

Download and run either installer:

- `AI.Usage_0.6.0_x64-setup.exe` — NSIS installer
- `AI.Usage_0.6.0_x64_en-US.msi` — MSI installer

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
