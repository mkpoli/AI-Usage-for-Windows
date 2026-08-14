# Z.ai

Tracks [Z.ai](https://z.ai) (Zhipu AI) usage quotas for GLM coding plans.

> These API endpoints are not documented in Z.ai's public API reference. They are used internally by the subscription
> management UI and work with both OAuth tokens and API keys.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://api.z.ai/`
- **Auth:** API key via environment variable (`ZAI_API_KEY`, fallback `GLM_API_KEY`)
- **Session and weekly utilization:** credits spent against the window's allowance on a credit-metered plan,
  percentage (0-100) on a token-metered one
- **Web searches:** count-based (used / limit), on plans that meter them
- **Reset periods:** 5 hours (session), 7 days (weekly), monthly (web searches, from `nextResetTime` when the API sends
  one, otherwise the 1st of the next month at 00:00 UTC)

Bundled and disabled by default.

## Setup

1. [Subscribe to a GLM Coding plan](https://z.ai/subscribe), then create a key in the
   [Z.ai console](https://z.ai/manage-apikey/apikey-list).
2. Store the key as a user environment variable named `ZAI_API_KEY`. `GLM_API_KEY` is read as a fallback.

   PowerShell:

   ```powershell
   [Environment]::SetEnvironmentVariable("ZAI_API_KEY", "YOUR_API_KEY", "User")
   ```

   Command Prompt:

   ```cmd
   setx ZAI_API_KEY "YOUR_API_KEY"
   ```

   AI Usage reads the User and Machine environment variables through PowerShell, so the key has to be persisted. A
   variable set for a single terminal session stays invisible to the tray app.

3. Restart AI Usage and enable Z.ai in settings.

## Endpoints

### GET /api/biz/subscription/list

Returns the user's active subscription(s). Used to extract the plan name.

#### Headers

| Header        | Required | Value              |
|---------------|----------|--------------------|
| Authorization | yes      | `Bearer <api_key>` |
| Accept        | yes      | `application/json` |

#### Response

```json
{
  "code": 200,
  "data": [
    {
      "id": "169359",
      "customerId": "71321768207710758",
      "productName": "GLM Coding Max",
      "description": "-All Pro plan benefits\n-4× Pro plan usage...",
      "status": "VALID",
      "purchaseTime": "2026-01-12 16:55:13",
      "valid": "2026-02-12 16:55:13-2026-03-12 16:55:13",
      "autoRenew": 1,
      "initialPrice": 30.0,
      "actualPrice": 30.0,
      "currentPeriod": 2,
      "currentRenewTime": "2026-01-12",
      "nextRenewTime": "2026-02-12",
      "billingCycle": "monthly",
      "inCurrentPeriod": true,
      "paymentChannel": "STRIPE"
    }
  ],
  "success": true
}
```

Used fields:

- `productName` — plan display name (e.g. "GLM Coding Max")

The whole call is optional: when it fails or returns no subscription, the provider drops the plan label and still
reports usage.

### GET /api/monitor/usage/quota/limit

Returns session token usage and web search quotas.

#### Headers

| Header        | Required | Value              |
|---------------|----------|--------------------|
| Authorization | yes      | `Bearer <api_key>` |
| Accept        | yes      | `application/json` |

#### Response

```json
{
  "code": 200,
  "data": {
    "limits": [
      {
        "type": "TOKENS_LIMIT",
        "unit": 3,
        "number": 5,
        "usage": 800000000,
        "currentValue": 127694464,
        "remaining": 672305536,
        "percentage": 15,
        "nextResetTime": 1770648402389
      },
      {
        "type": "TIME_LIMIT",
        "unit": 5,
        "number": 1,
        "usage": 4000,
        "currentValue": 1828,
        "remaining": 2172,
        "percentage": 45,
        "usageDetails": [
          {
            "modelCode": "search-prime",
            "usage": 1433
          },
          {
            "modelCode": "web-reader",
            "usage": 462
          },
          {
            "modelCode": "zread",
            "usage": 0
          }
        ]
      }
    ]
  },
  "success": true
}
```

**TOKENS_LIMIT:**

- `usage` — total token limit (e.g. 800M)
- `currentValue` — tokens consumed
- `remaining` — tokens remaining
- `percentage` — usage as percentage (0-100)
- `nextResetTime` — epoch milliseconds of next reset
- `unit: 3, number: 5` — 5-hour rolling period (session)
- `unit: 6, number: 7` — 7-day rolling period (weekly)

**CREDIT_LIMIT:**

Credit-metered plans send these in place of `TOKENS_LIMIT`, and a response carries one kind or the other rather than
both. GLM Coding Lite answers with two credit windows and no `TIME_LIMIT`:

```json
{
  "type": "CREDIT_LIMIT",
  "unit": 3,
  "number": 5,
  "usage": 2000,
  "currentValue": 36,
  "remaining": 1963,
  "percentage": 1,
  "nextResetTime": 1786727872266
}
```

- `usage` — credit allowance for the window
- `currentValue` — credits spent
- `remaining` — credits left, which can trail `usage - currentValue` by a credit
- `percentage` — spend as an integer percentage, too coarse to display on its own at this scale
- `unit: 3, number: 5` — 5-hour rolling period (session)
- `unit: 6, number: 1` — weekly rolling period

**TIME_LIMIT:**

- `usage` — total web search/reader call limit (e.g. 4000)
- `currentValue` — calls consumed
- `remaining` — calls remaining
- `percentage` — usage as percentage (0-100)
- `usageDetails` — per-model breakdown (search-prime, web-reader, zread)
- `unit: 5, number: 1` — monthly period (no `nextResetTime`; resets on the 1st of each month at 00:00 UTC)

## Displayed Lines

| Line         | Description                                                                                    |
|--------------|------------------------------------------------------------------------------------------------|
| Session      | Credits spent against the 5-hour allowance, or token usage as a percentage, with a 5h reset timer |
| Weekly       | The same metering over the 7-day window                                                        |
| Web Searches | Web search/reader call count (used / limit), resets on the 1st of each month                   |

A window with neither a token nor a credit entry shows a "No usage data" badge in place of the Session bar.

## Errors

| Condition     | Message                                                    |
|---------------|------------------------------------------------------------|
| No API key    | "No ZAI_API_KEY found. Set up environment variable first." |
| 401/403       | "API key invalid. Check your Z.ai API key."                |
| HTTP error    | "Usage request failed (HTTP {status}). Try again later."   |
| Network error | "Usage request failed. Check your connection."             |
| Invalid JSON  | "Usage response invalid. Try again later."                 |
