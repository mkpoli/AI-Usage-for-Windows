# CLI Location

Coding CLIs keep their logins under the home directory of whatever system they run on. A CLI
installed in WSL writes to the distro's home, which is a different place from the Windows user
profile — a `claude` login inside Ubuntu leaves `C:\Users\<you>\.claude` untouched, and the other
way round.

Settings offers **CLI Location** when at least one WSL distro is installed: the Windows user
profile, or any distro WSL reports. The setting is stored as `cliEnvironment` in the app's
`settings.json` (`windows`, or `wsl:<distro>`).

## What moves

With a distro selected, `~` in a provider's file lookups resolves to that distro's home, reached
through `\\wsl.localhost\<distro>`. Two roots stay in the Windows profile whatever the setting says:

| Path | Reads from |
|---|---|
| `~/.ai-usage/**` | Windows — the app's own config, including provider cookies and tokens |
| `~/AppData/**` | Windows — where Windows applications keep their state |
| everything else under `~` | the selected environment |

A path the distro does not have falls back to the Windows profile, so a mixed setup works without
further configuration: Claude Code and Codex inside WSL, Cursor and Antigravity on Windows.

Windows Credential Manager is a Windows facility and is read there in every case.

## Token history

`ccusage` reads a CLI's transcripts. With a distro selected it runs inside that distro, where those
files are local; running it from Windows would drag gigabytes across the 9p bridge.

A large history takes far longer than a refresh interval — around a minute for a few gigabytes — so
the query runs on its own thread and each refresh reads the answer from the last completed run.
Results are held for 30 minutes. Until the first run finishes, a provider card shows its API-based
lines and no token history.

## When a distro is gone

A distro that WSL cannot reach at startup, because it was renamed, exported, or unregistered, logs
a warning and reads the Windows profile instead. Picking it again in Settings returns the same
answer, and the stored setting follows what the app could actually reach.
