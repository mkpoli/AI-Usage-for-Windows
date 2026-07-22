# Changelog

## Unreleased

### Fixed

- The in-app update check can now find and install releases: builds ship signed updater artifacts, each release publishes the `latest.json` the check reads, and the app verifies against this project's own signing key. Versions up to v0.4.0 need one manual install of this release; the app updates itself from then on.

## v0.4.0 - 2026-07-23

### Changed

- Sakana AI keeps the session alive by storing the rotated session token the console returns on each refresh, so a pasted token keeps working past its original expiry. If the stored session is rejected, the configured token is tried again; pasting a new token into `~/.ai-usage/config.json` replaces the stored session.
- Plugins now see every value of repeated HTTP response headers, newline-joined; previously only the last `Set-Cookie` header survived.

## v0.3.0 - 2026-07-20

### Added

- Qwen provider covering the Alibaba Qwen Token Plan's five-hour and weekly windows and the Coding Plan's five-hour, weekly, and monthly request quotas, plus the plan name and a renewal countdown. Works with both the international (`qwencloud.com`) and China (`qianwenai.com`) consoles, with console cookies read from `~/.ai-usage/config.json`. Bundled and disabled by default; enable it in Settings.
- A provider comparison in the README covering the metrics each provider reports, how each stores credentials, and what each cannot show.

### Changed

- Sakana AI's renewal line now counts down the days remaining instead of showing only the renewal date.
- Sakana AI now reads the subscription billing tab, which is the only one carrying the quota reset timestamps, so the 5-hour and weekly windows show when they reset.
- Kimi reports Moonshot's marketed tier name where it is known, showing `Allegretto` for `LEVEL_INTERMEDIATE`.
- The plan badge opens the provider's pricing page when one is known.
- The tray icon draws a bar for every enabled provider instead of stopping at four, and the tooltip lists as many providers as Windows will hold.

### Fixed

- The update check now points at this repository, so new installs can find releases.

## v0.2.1 - 2026-07-17

### Added

- Kimi Code provider covering session and weekly usage, with the plan derived from membership level. Bundled and disabled by default; enable it in Settings.

### Changed

- The tray icon now reflects a provider's tightest active limit: when Claude's weekly limit is exhausted, the tray reads full even while the 5-hour window still has room.

### Fixed

- Grok is restored to the default provider order, correcting the order shown on a fresh install.

## v0.2.0 - 2026-07-16

### Added

- Sakana AI (Fugu) provider covering 5-hour and weekly usage windows plus plan and subscription details, with the session token read from `~/.ai-usage/config.json`
- Grok provider covering the xAI plan, the shared usage pool, and Grok Build product usage
- Grok and Sakana AI are bundled and disabled by default; enable them in Settings

### Fixed

- Claude weekly limits now render each scoped model bucket instead of a single combined weekly line

## v0.1.2 - 2026-05-20

### Changed

- Antigravity quota rendering now preserves each visible model bucket instead of merging models into broad Gemini or Claude groups
- Antigravity documentation now reflects model-specific quota lines such as Gemini 3.5 Flash, Gemini 3.1 Pro, Claude 4.6, and GPT-OSS
- Gemini quota rendering now preserves model-specific Gemini 3.x bucket labels when Google exposes them, while older buckets still fall back to Pro and Flash
- Gemini documentation now clarifies that Gemini app compute-based limits and Gemini API token accounting are separate from Gemini CLI / Code Assist quota tracking
- Home Dashboard now includes Gemini 3.1 preview quota labels and Antigravity's current Gemini model quota labels
- Antigravity duplicate model labels are collapsed to a single quota line

## v0.1.1 - 2026-05-18

### Added

- GitHub Copilot provider support
- 1-minute auto refresh option and 1-minute default refresh interval

### Fixed

- Plugin enabled/disabled settings now persist across app restarts instead of re-enabling default providers during bootstrap

### Removed

- Google sign-in and mobile synchronization from the Windows settings screen
- Firebase client integration and sync-specific runtime configuration

## v0.1.0 - 2026-04-27

Initial Windows release of AI Usage.

### Added

- Windows tray-only app behavior with taskbar hidden
- Compact tray panel positioned above the Windows taskbar area
- Global shortcut support
- Start on login enabled by default
- Auto refresh default set to 5 minutes
- Bars-style tray icon
- Local HTTP API at `127.0.0.1:6736`
- Provider support for Claude, Codex, Gemini, Antigravity, and Cursor
- Default provider order: Claude, Codex, Gemini, Antigravity, Cursor
- Default enabled providers: Claude, Codex, Gemini, Antigravity
- Windows Credential Manager fallback for supported provider auth flows
- Windows SQLite state database support for Cursor and Antigravity
- Gemini CLI 0.39.x bundled OAuth client discovery

### Changed

- Rebranded distribution text and product assets to AI Usage
- Installer name and bundle product name set to AI Usage
- About dialog credits updated to Built by Yeoreum
- Help button now opens the repository root

### Fixed

- Right-clicking the tray icon no longer opens the panel, so the tray menu remains accessible
- Panel hides when the window loses focus
- Setup child PowerShell window handling remains hidden for user-facing install flows
