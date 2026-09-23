# MiMo

Tracks the Xiaomi MiMo Token Plan from the platform console.

> Reverse-engineered console API. May change without notice.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://platform.xiaomimimo.com`
- **Auth provider:** platform session cookies
- **Token store:** `~/.ai-usage/config.json` under `mimo.cookie`

The Token Plan meters a monthly window and a plan-wide token grant. A third bucket holds compensation tokens granted outside the plan, shown when the account has any.

## Setup

1. Sign in at [platform.xiaomimimo.com](https://platform.xiaomimimo.com).
2. Open DevTools (F12) → Network, and reload the page.
3. Click any request to that host, and copy the full **Cookie** request header.

The session is carried by `api-platform_serviceToken`, `userId`, `api-platform_slh`, and `api-platform_ph`. AI Usage sends the whole pasted header, so a cookie the platform adds later still goes through.

Add the cookies to `~/.ai-usage/config.json` (on Windows: `C:\Users\<you>\.ai-usage\config.json`):

```json
{
  "mimo": {
    "cookie": "api-platform_serviceToken=...; userId=...; api-platform_slh=...; api-platform_ph=..."
  }
}
```

Then restart AI Usage and enable MiMo in settings.

The same file holds proxy and other provider settings, so they can sit together:

```json
{
  "proxy": { "enabled": false, "url": "" },
  "mimo": {
    "cookie": "api-platform_serviceToken=...; userId=...; api-platform_slh=...; api-platform_ph=..."
  }
}
```

Accepted keys under `mimo`:

| Key | Meaning |
|---|---|
| `cookie` | The console `Cookie` header. Also accepts `sessionCookie` and `session_cookie`. A DevTools Cookies-table paste works too. |

## Alternative: environment variables

Environment variables take precedence over the config file:

- `MIMO_COOKIE` — the console `Cookie` header. Also accepts `MIMO_SESSION_COOKIE`.

PowerShell example:

```powershell
[Environment]::SetEnvironmentVariable('MIMO_COOKIE', 'api-platform_serviceToken=...; userId=...', 'User')
```

AI Usage reads these variables from the process environment or the persisted Windows user/machine environment. A temporary shell variable is usually unavailable to a tray app launched from the Start menu.

## Credential resolution order

1. `MIMO_COOKIE` (environment)
2. `MIMO_SESSION_COOKIE` (environment)
3. `~/.ai-usage/config.json` → `mimo.cookie` / `mimo.sessionCookie` / `mimo.session_cookie`

## Endpoints

### GET /api/v1/tokenPlan/usage

Returns the Token Plan windows.

#### Headers

| Header | Required | Value |
|---|---|---|
| Cookie | yes | platform session cookies |
| Accept | yes | `application/json` |

#### Example Response

```jsonc
{
  "code": 0,
  "message": "ok",
  "data": {
    "usage": {
      "percent": 0.42,
      "items": [
        { "name": "plan_total_token", "used": 128000000, "limit": 300000000, "percent": 0.4267 },
        { "name": "compensation_total_token", "used": 1000000, "limit": 5000000, "percent": 0.2 }
      ]
    },
    "monthUsage": {
      "percent": 0.25,
      "items": [
        { "name": "month_total_token", "used": 64000000, "limit": 256000000, "percent": 0.25 }
      ]
    }
  }
}
```

Item names the plugin reads:

| Name | Line | Meaning |
|---|---|---|
| `plan_total_token` | Plan | Tokens used of the plan grant |
| `compensation_total_token` | Bonus | Tokens granted outside the plan |
| `month_total_token` | Monthly | Tokens used in the current monthly window |

`percent` is a 0..1 fraction of the window consumed. When an item omits `percent`, the plugin computes it from `used` / `limit`.

### GET /api/v1/tokenPlan/detail

Returns the subscribed plan. Optional: when it fails, usage still reports and the plan label and renewal countdown are dropped.

#### Example Response

```jsonc
{
  "code": 0,
  "message": "ok",
  "data": {
    "planName": "Pro",
    "planCode": "pro:monthly",
    "currentPeriodEnd": "2026-10-11T00:00:00.000Z",
    "expired": false,
    "enableAutoRenew": true
  }
}
```

Used fields:

- `planName` — plan display name
- `currentPeriodEnd` — when the current plan period ends
- `expired` — whether the subscription has lapsed
- `enableAutoRenew` — whether the plan renews on its own

## Lines

| Line | Source | Scope |
|---|---|---|
| `Monthly` | `month_total_token` | Overview |
| `Plan` | `plan_total_token` | Overview |
| `Bonus` | `compensation_total_token`, when the grant is non-empty | Detail |
| `Tokens` | `plan_total_token` used and limit, abbreviated | Detail |
| `Status` | Shown when the subscription is expired or no usage is available | Detail |
| `Renewal` | Days until `currentPeriodEnd`, phrased as renews or ends | Detail |

The plan label is the `planName` from the detail call. The Plan bar carries the countdown to `currentPeriodEnd`. The monthly window and the compensation grant publish no reset timestamp, so those bars show neither a countdown nor a pace marker.

## Limitations

- The `tp-` Token Plan API key cannot read usage. The console endpoints accept session cookies only.
- Cookies are not refreshed. When the console session expires, re-copy the header.
- Per-model and token-level history is unavailable, matching what the console itself shows.
- The monthly window carries no reset timestamp in the API, so the bar is drawn without a countdown or a pace marker.

## Errors

| Error | Meaning |
|-------|---------|
| `Missing MiMo credentials` | No cookies were found in the environment or `~/.ai-usage/config.json`. |
| `MiMo login required` | The console session expired. Copy fresh cookies. |
| `MiMo request failed` | The console returned a non-2xx response. |
| `MiMo API error` | The console answered with a non-zero business code. |
| `Request failed. Check your connection.` | The request never reached the console. |
| `Usage response invalid. Try again later.` | The response was not JSON. |

A card that answers with no Token Plan shows a `No usage data` status badge rather than an error.
