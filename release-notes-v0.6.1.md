Windows tray build of AI Usage. Z.ai now reports usage on credit-metered plans.

## Fixed

- Z.ai showed "No usage data" on GLM Coding Lite and any other credit-metered plan. Those accounts return their five-hour and weekly windows as `CREDIT_LIMIT` entries, while the provider only looked for the `TOKENS_LIMIT` shape, so it found the plan name but no usage. Both windows now render as credits spent against their allowance, and a plan that sends no web search quota omits that line instead of blanking the whole provider.

## Install

Download and run either installer:

- `AI.Usage_0.6.1_x64-setup.exe` — NSIS installer
- `AI.Usage_0.6.1_x64_en-US.msi` — MSI installer

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
