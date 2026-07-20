# Qwen

Tracks Alibaba Qwen subscription usage from the Qwen Cloud console.

Two subscriptions are covered. **Token Plan** reports a five-hour and a weekly window as percentages. **Coding Plan** reports five-hour, weekly, and billing-month request counts. The Token Plan is read first; the Coding Plan is used when no Token Plan is active.

## Regions

Qwen Cloud runs two separate deployments. Pick the one you sign in to:

| Region | Console | Setting |
|---|---|---|
| International | `home.qwencloud.com` | `intl` (default) |
| China | `platform-home.qianwenai.com` | `cn` |

An account on one deployment is not visible from the other. The China console is also reachable as `platform.qianwenai.com`, which is the marketing and sign-in host; usage is read from `platform-home.qianwenai.com`.

## Get your console cookies

The gateway is authenticated by your browser session, so AI Usage needs the cookies for the console you use.

1. Sign in at `https://platform-home.qianwenai.com/billing` (China) or `https://home.qwencloud.com/billing` (international).
2. Open DevTools (F12) → Network, and reload the page.
3. Click any request to that host, and copy the full **Cookie** request header.

Copy the whole header. The session spans several cookies and no single one authenticates the gateway. For the China console the cookies scoped to `.qianwenai.com` are the ones that matter — `login_qianwenai_ticket` carries the session, alongside `login_aliyunid_pk`, `login_aliyunid_csrf`, `cna`, `isg`, `sca`, `atpsida` and the `acw_tc` / `cdn_sec_tc` edge tokens. Cookies scoped to `.alibaba.com` belong to a different domain and are not sent to the gateway.

## Setup (recommended: config file)

Add the cookies to AI Usage's config file at `~/.ai-usage/config.json` (on Windows: `C:\Users\<you>\.ai-usage\config.json`). Create the file if it does not exist:

```json
{
  "qwen": {
    "cookie": "login_qianwenai_ticket=...; login_aliyunid_pk=...; cna=...",
    "region": "cn"
  }
}
```

Then restart AI Usage and enable the Qwen provider in settings.

This is the same config file used for proxy settings, so both can live together:

```json
{
  "proxy": { "enabled": false, "url": "" },
  "qwen": {
    "cookie": "login_qianwenai_ticket=...; cna=...",
    "region": "cn"
  }
}
```

Accepted keys under `qwen`:

| Key | Meaning |
|---|---|
| `cookie` | The console `Cookie` header. Also accepts `sessionCookie`. A DevTools Cookies-table paste works too. |
| `region` | `intl` (default) or `cn`. |
| `secToken` | Optional. Skips the CSRF token lookup described below. |

## Alternative: environment variables

Environment variables take precedence over the config file:

- `QWEN_COOKIE` — the console `Cookie` header. Also accepts `QWEN_SESSION_COOKIE`.
- `QWEN_REGION` — `intl` or `cn`.

PowerShell example:

```powershell
[Environment]::SetEnvironmentVariable('QWEN_COOKIE', 'login_qianwenai_ticket=...', 'User')
```

AI Usage reads these variables from the process environment or the persisted Windows user/machine environment. A temporary shell variable is usually unavailable to a tray app launched from the Start menu.

## Credential resolution order

1. `QWEN_COOKIE` (environment)
2. `QWEN_SESSION_COOKIE` (environment)
3. `~/.ai-usage/config.json` → `qwen.cookie` / `qwen.sessionCookie`

## Data source

The console and the data gateway are different hosts.

| Piece | International | China |
|---|---|---|
| Console (CSRF token) | `home.qwencloud.com` | `platform-home.qianwenai.com` |
| Gateway | `cs-data.qwencloud.com` | `cs-data.qianwenai.com` |
| Gateway action | `IntlBroadScopeAspnGateway` | `BroadScopeAspnGateway` |
| Region | `ap-southeast-1` | `cn-beijing` |

- **Request:** `POST {gateway}/data/api.json`, form-encoded, product `sfm_bailian`. The `params` field carries `Api`, `Data`, and `V: "1.0"`, and `Data` must include a `cornerstoneParam` block identifying the console site.
- **CSRF token:** the gateway requires a `sec_token`. It is rendered into the console page as `ALIYUN_CONSOLE_CONFIG.SEC_TOKEN`, so AI Usage reads it from the billing page using the same cookies. Setting `qwen.secToken` skips that request.
- **Token Plan:** `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage` supplies `per5HourPercentage` and `per1WeekPercentage` with their reset timestamps; `/subscription` supplies the spec and renewal; `/quota-config` supplies the per-spec allowance.
- **Coding Plan:** `zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2` supplies `codingPlanQuotaInfo` with used and total request counts per window.

These are console endpoints rather than a published API, so they can change without notice.

## Lines

| Line | Token Plan | Coding Plan | Scope |
|---|---|---|---|
| `5-hour` | Percent of the five-hour window | Requests used of the five-hour quota | Overview |
| `Weekly` | Percent of the weekly window | Requests used of the weekly quota | Overview |
| `Monthly` | — | Requests used of the billing-month quota | Overview |
| `Allowance` | Requests per window for the subscribed spec | — | Detail |
| `Status` | Shown when the subscription is not `VALID` | Shown when the subscription is not `VALID` | Detail |
| `Renewal` | Days until the plan renews or ends | Days until the plan renews or ends | Detail |

The plan label reads `Token Plan Standard` or, for a Coding Plan, the instance name and price such as `Pro 39`.

## Limitations

- The `sk-sp-` API key cannot read usage. The console endpoints accept session cookies only, so the key that runs the CLI is not enough.
- Cookies are not refreshed. When the console session expires, re-copy the header.
- Per-model and token-level usage is unavailable, matching what the console itself shows.

## Errors

| Error | Meaning |
|-------|---------|
| `Missing Qwen credentials` | No cookies were found in the environment or `~/.ai-usage/config.json`. |
| `Qwen login required` | The console session expired, or the page carried no CSRF token. Copy fresh cookies. |
| `Unknown Qwen region` | `region` was neither `intl` nor `cn`. |
| `Qwen console request failed` | The console page returned a non-2xx response. |
| `Qwen usage request failed` | The gateway returned a non-2xx response. |
| `No active plan` | The account has neither a Token Plan nor a Coding Plan subscription. |
