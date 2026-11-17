# Antigravity

> Reverse-engineered, undocumented provider behavior. It may change without notice.

AI Usage for Windows reads Antigravity through local SQLite credentials and Google's Cloud Code quota APIs. Direct Windows language-server discovery is left for a later provider hardening pass.

## Overview

- **Vendor:** Google
- **Primary Windows path:** `%APPDATA%\Antigravity\User\globalStorage\state.vscdb`
- **Fallback API:** `https://cloudcode-pa.googleapis.com`
- **Auth:** Google OAuth access/refresh tokens from Antigravity local state
- **Quota:** shared Gemini and Claude/GPT pools, each with five-hour and weekly windows, plus the separate Gemini 4 Argon weekly bucket
- **Default:** enabled when bundled and queryable

## Data Sources

Antigravity stores auth state in a VS Code-compatible SQLite database.

```text
%APPDATA%\Antigravity\User\globalStorage\state.vscdb
```

The plugin reads:

- `antigravityAuthStatus` for API key, account name, and email when available
- `jetskiStateSync.agentManagerInitState` for protobuf-encoded OAuth tokens

Token values are never logged.

## Quota Summary

The model list and the quota windows come from separate calls. For the quota windows the plugin requests:

```text
POST https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary
body: {"project":"aicode-consumers"}
```

The `aicode-consumers` project and the `antigravity/cli/1.5.3` user agent are what make the response include the Gemini groups and the `Gemini 4 Argon` weekly bucket. A generic `antigravity` user agent returns only the Claude and GPT group.

The response groups models into shared pools instead of reporting a meaningful per-model quota. Each pool has a five-hour and a weekly bucket:

- `Gemini Models`: `gemini-5h`, `gemini-weekly`
- `Claude and GPT models`: `3p-5h`, `3p-weekly`
- `Gemini 4 Argon`: `gemini-argon-wtu-weekly`

The per-model `quotaInfo` from `fetchAvailableModels` reports the five-hour window only and can stay at its full value while the shared weekly bucket is mostly spent. AI Usage therefore renders the summary buckets and keeps the per-model response as a fallback for older builds. The bucket IDs and grouping match the format documented by other Antigravity clients ([OpenUsage](https://github.com/robinebers/openusage/blob/26132ff48dd78eb2c4a9498e40424e6365f99fec/docs/providers/antigravity.md)).

## Token Refresh

The app's protobuf state can include:

- access token
- refresh token
- expiry timestamp

When the access token is expired or rejected, AI Usage refreshes it through:

```text
POST https://oauth2.googleapis.com/token
```

The refreshed token is cached in the plugin data directory for later probes.

## Cloud Code API

When no language-server endpoint is available, the plugin calls:

```text
POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels
```

The response includes provisioned models and per-model quota information. AI Usage uses it only when the quota summary returns no buckets. GPT-OSS rows are filtered from both the API and language-server data. Antigravity is retiring the model, and it shares the Claude quota pool.

## Output Mapping

- **Plan:** best-effort account plan name when available
- **Quota rows:** one row per shared pool and window, in the order `Gemini Weekly`, `Gemini Session`, `Claude and GPT Weekly`, `Claude and GPT Session`, `Gemini 4 Argon`. Percent used comes from the bucket's remaining fraction. Five-hour rows use a five-hour period for pace and reset labels; weekly rows use seven days.
- **Overview and tray:** the Overview scope declares the same five rows. The tray primary uses `Gemini Weekly`, then `Gemini Session`, then `Gemini 4 Argon`.
- Duplicate labels are collapsed to the bucket with the highest usage
- **Account:** account email/name when available

## Limitations

- Direct Windows language-server process discovery is not enabled yet.
- Antigravity internals are undocumented and may change without notice.
- If local credentials are missing or expired and refresh fails, the user must sign in to Antigravity again.
