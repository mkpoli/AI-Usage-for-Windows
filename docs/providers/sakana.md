# Sakana AI

Tracks Sakana AI Fugu usage from the Sakana AI console billing page.

## Setup (recommended: session token only)

The billing page is authenticated by a single cookie, `__Secure-authjs.session-token`. You do not need the full cookie header.

1. Sign in at `https://console.sakana.ai/billing` in a browser.
2. Open DevTools → Application (or Storage) → Cookies → `https://console.sakana.ai`.
3. Copy the **Value** of `__Secure-authjs.session-token`.
4. Set `SAKANA_SESSION_TOKEN` to that value, then restart AI Usage.
5. Enable the Sakana AI provider in AI Usage settings.

PowerShell example:

```powershell
[Environment]::SetEnvironmentVariable('SAKANA_SESSION_TOKEN', 'eyJhbGci...', 'User')
```

## Alternative: SAKANA_COOKIE

`SAKANA_COOKIE` still works and accepts several shapes. AI Usage extracts the session token and drops the rest (csrf-token and callback-url are not needed):

- a full `Cookie: a=b; c=d` header (with or without the leading `Cookie:`)
- `a=b; c=d` pairs on one or many lines
- a DevTools **Cookies table** paste, where each row is `name <TAB> value <TAB> domain ...`

When present, chunked session cookies (`__Secure-authjs.session-token.0`, `.1`, …) are preserved.

`SAKANA_SESSION_TOKEN` takes precedence over `SAKANA_COOKIE` when both are set.

AI Usage reads these variables from the process environment or the persisted Windows user/machine environment. A temporary shell variable is usually unavailable to a tray app launched from the Start menu.

## Data source

- **URL:** `https://console.sakana.ai/billing`
- **Auth:** the `__Secure-authjs.session-token` cookie via `SAKANA_SESSION_TOKEN` or `SAKANA_COOKIE`
- **5-hour usage:** parses the `5-hour` quota card percentage and reset timestamp
- **Weekly usage:** parses the `Weekly` quota card percentage and reset timestamp
- **Reset timezone:** server-rendered reset timestamps are interpreted as UTC

The Sakana public API supports Fugu chat and model requests. AI Usage reads quota windows from the console billing page, where the 5-hour and weekly limits are rendered.

## Errors

| Error | Meaning |
|-------|---------|
| `Missing Sakana credentials` | Neither `SAKANA_SESSION_TOKEN` nor `SAKANA_COOKIE` was configured. |
| `Sakana login required` | The session token expired or the request was redirected. |
| `Sakana billing fetch failed` | The billing page returned a non-200 response. |
| `Could not parse usage data` | The billing page markup is missing supported quota rows. |
