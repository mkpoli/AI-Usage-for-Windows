# Changelog

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
