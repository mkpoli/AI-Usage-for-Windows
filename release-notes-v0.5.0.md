Windows tray build of AI Usage. Coding CLIs that live inside WSL can now be read from there.

## Added

- CLI Location, a Settings choice between the Windows user profile and any installed WSL distro. A CLI installed in WSL keeps its login in the distro's home, where a Windows-only lookup never finds it. With a distro selected, provider lookups resolve `~` through `\\wsl.localhost\<distro>` and fall back to Windows for anything the distro lacks, so Claude Code in WSL and Cursor on Windows work side by side. `~/.ai-usage` and `~/AppData` stay in the Windows profile. The section appears only on machines that have WSL.

## Changed

- Claude tells a signed-out account from a missing one. Claude Code empties both tokens in `~/.claude/.credentials.json` when a refresh is rejected, and that state now names the expired subscription session and points at the Windows terminal, since Claude Code keeps running on API billing and a login under WSL leaves the Windows credentials untouched.
- Token history no longer runs on the refresh path. Scanning a few gigabytes of transcripts takes about a minute, longer than the refresh interval, so `ccusage` runs on its own thread and each refresh reads the result of the last completed run, held for 30 minutes.

## Fixed

- The provider error icon keeps its size when the message wraps to several lines.

## Install

Download and run either installer:

- `AI.Usage_0.5.0_x64-setup.exe` — NSIS installer
- `AI.Usage_0.5.0_x64_en-US.msi` — MSI installer

Requires the Microsoft Edge WebView2 runtime, present on current Windows 11.
