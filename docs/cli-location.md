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

Token history is off until you turn it on in Settings. The choice is `tokenHistory` in
`settings.json`, and the app reads it again on every launch.

Each run reads every Claude Code and Codex transcript. A large history takes many minutes and
several cores. With the switch off, a refresh starts no scan and the card leaves token lines out.
Turning the switch off stops a scan already running and drops the result it was holding. Turning it
on lets the next refresh start a run.

`ccusage` reads a CLI's transcripts. With a distro selected it runs only inside that distro, where
those files are local; running it from Windows would drag gigabytes across the 9p bridge and load
the whole machine. A run that fails there keeps the last answer on the card. A home override that
points into the Windows profile, such as `CODEX_HOME=C:\Users\you\.codex`, is read from Windows.

A large history takes far longer than a refresh interval — several minutes for a few gigabytes — so
the query runs on its own thread and each refresh reads the answer from the last completed run.
Results are held for 30 minutes, and a run inside a distro may take as long. Until the first run
finishes, a provider card shows its API-based lines and no token history.

## When a distro is gone

A distro that WSL cannot reach at startup, because it was renamed, exported, or unregistered, logs
a warning and reads the Windows profile instead. Picking it again in Settings returns the same
answer, and the stored setting follows what the app could actually reach.
