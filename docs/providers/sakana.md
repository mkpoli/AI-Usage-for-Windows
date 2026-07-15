# Sakana AI

Tracks Sakana AI Fugu usage from the Sakana AI console billing page.

## Setup

1. Sign in at `https://console.sakana.ai/billing` in a browser.
2. Copy the browser request `Cookie` header for that page.
3. Set `SAKANA_COOKIE` to the copied value, then restart AI Usage.
4. Enable the Sakana AI provider in AI Usage settings.

AI Usage reads `SAKANA_COOKIE` from the process environment or the persisted Windows user/machine environment. A temporary shell variable is usually unavailable to a tray app launched from the Start menu.

PowerShell example:

```powershell
[Environment]::SetEnvironmentVariable('SAKANA_COOKIE', 'session=...', 'User')
```

## Data source

- **URL:** `https://console.sakana.ai/billing`
- **Auth:** browser cookie header through `SAKANA_COOKIE`
- **5-hour usage:** parses the `5-hour` quota card percentage and reset timestamp
- **Weekly usage:** parses the `Weekly` quota card percentage and reset timestamp
- **Reset timezone:** server-rendered reset timestamps are interpreted as UTC

The Sakana public API supports Fugu chat and model requests. AI Usage reads quota windows from the console billing page, where the 5-hour and weekly limits are rendered.

## Errors

| Error | Meaning |
|-------|---------|
| `Missing SAKANA_COOKIE` | No cookie header was configured. |
| `Sakana login required` | The cookie expired or the request was redirected. |
| `Sakana billing fetch failed` | The billing page returned a non-200 response. |
| `Could not parse usage data` | The billing page markup is missing supported quota rows. |
