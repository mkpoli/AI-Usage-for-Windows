# Grok

Tracks xAI Grok usage from the Grok web usage pool.

## Data source

- **Page:** `https://grok.com/?_s=usage`
- **Endpoint:** `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`
- **Protocol:** gRPC-Web protobuf
- **Auth:** grok.com browser cookies

The usage response contains a shared usage pool and per-product rows. AI Usage shows the shared pool and the `GROK_BUILD` product row.

## Setup

1. Sign in at `https://grok.com/?_s=usage` in a browser.
2. Open DevTools → Application or Storage → Cookies → `https://grok.com`.
3. Copy the grok.com cookie values needed for the usage page.
4. Add them to `~/.ai-usage/config.json`:

```json
{
  "grok": {
    "cookie": "name=value; another=value"
  }
}
```

A DevTools Cookies table paste also works. AI Usage converts it into a normal Cookie header.

Environment variable setup is also supported:

```powershell
[Environment]::SetEnvironmentVariable('GROK_COOKIE', 'name=value; another=value', 'User')
```

Config file setup is usually easier for a tray app launched from the Start menu.

## Lines

| Line | Source field | Scope |
|---|---|---|
| `Usage pool` | `config.creditUsagePercent` | Overview |
| `Grok Build` | `config.productUsage[]` where product is `GROK_BUILD` | Overview |
| `Period` | `config.currentPeriod` | Detail |

## Errors

| Error | Meaning |
|---|---|
| `Missing Grok credentials` | No cookie was found in `~/.ai-usage/config.json` or `GROK_COOKIE`. |
| `Grok login required` | The cookie expired or is missing the values required by grok.com. |
| `Grok usage fetch failed` | The usage endpoint returned an HTTP or gRPC error. |
| `Could not parse usage data` | The endpoint response shape changed or the binary frame was incomplete. |
