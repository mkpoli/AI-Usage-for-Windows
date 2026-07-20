Windows tray build of AI Usage. Adds the Qwen provider, shows when Sakana AI's quota windows reset, and lets the tray cover every provider you have enabled.

## Added

- Qwen provider covering the Alibaba Qwen Token Plan's five-hour and weekly windows, and the Coding Plan's five-hour, weekly, and monthly request quotas, with the plan name and a renewal countdown. Both the international (`qwencloud.com`) and China (`qianwenai.com`) consoles are supported, selected with a `region` setting. Bundled and disabled by default; enable it in Settings and add your console cookies as described in the Qwen provider documentation.
- A provider comparison in the README covering what each provider reports, where each reads its credentials, and what each cannot show.

## Changed

- Sakana AI now reads the subscription billing tab, the only one carrying the quota reset timestamps, so the 5-hour and weekly windows show when they reset instead of leaving the reset blank.
- Sakana AI's renewal line counts down the days remaining rather than showing only the renewal date.
- Kimi shows Moonshot's marketed tier name where it is known, so `LEVEL_INTERMEDIATE` reads as `Allegretto`. Any other tier still shows the level reported by the API rather than a guessed name.
- The tray icon draws a bar for every enabled provider instead of stopping at four. The tooltip lists as many providers as the Windows tooltip buffer holds, and uses a shorter format to fit more of them.
- The plan badge opens the provider's pricing page.

## Fixed

- The update check pointed at a repository that no longer receives releases, so it never found a newer version. It now points at this repository. Existing installs carry the old address and need this version installed manually once.
- Captured logs redact the console CSRF token that the Qwen provider reads.

## Install

Download and run either installer:

- `AI.Usage_0.3.0_x64-setup.exe` — NSIS installer
- `AI.Usage_0.3.0_x64_en-US.msi` — MSI installer

Verify against `SHA256SUMS.txt` if you want to check the download.

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
