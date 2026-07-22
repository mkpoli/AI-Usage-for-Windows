Windows tray build of AI Usage. One pasted Sakana AI token now keeps the provider reporting for as long as the app keeps refreshing.

## Changed

- Sakana AI stores the rotated session token the console returns on every refresh and uses the newest one for the next request. The console extends the session's expiry each time, so with Auto Refresh on, the token you paste only has to be valid once. A rejected stored session falls back to the configured token, and pasting a new token into `~/.ai-usage/config.json` starts a new session chain.
- Plugins receive every value of repeated HTTP response headers, newline-joined. Before this, only the last `Set-Cookie` header reached a plugin.

## Install

Download and run either installer:

- `AI.Usage_0.4.0_x64-setup.exe` — NSIS installer
- `AI.Usage_0.4.0_x64_en-US.msi` — MSI installer

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
