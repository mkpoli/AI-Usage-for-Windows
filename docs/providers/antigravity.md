# Antigravity

> Reverse-engineered, undocumented provider behavior. It may change without notice.

AI Usage for Windows reads Antigravity through local SQLite credentials and Google's Cloud Code quota APIs. Direct Windows language-server discovery is left for a later provider hardening pass.

## Overview

- **Vendor:** Google
- **Primary Windows path:** `%APPDATA%\Antigravity\User\globalStorage\state.vscdb`
- **Fallback API:** `https://cloudcode-pa.googleapis.com`
- **Auth:** Google OAuth access/refresh tokens from Antigravity local state
- **Quota:** per-model remaining fraction plus the Gemini 4 Argon weekly bucket
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

The Argon bucket renders as `Gemini 4 Argon`, percent used over a seven-day window. The remaining per-model rows still come from `fetchAvailableModels`.

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

The response includes provisioned models and quota information. AI Usage filters out internal, retired, and non-user-facing models, then renders each visible model quota bucket separately.

GPT-OSS rows are filtered from both the API and language-server data. Antigravity is retiring the model, and it shares the Claude quota pool.

## Output Mapping

- **Plan:** best-effort account plan name when available
- **Gemini 4 Argon:** the Argon weekly bucket renders first as `Gemini 4 Argon`, percent used, seven-day reset
- **Model lines:** each visible Antigravity model quota bucket is shown as percent used. Gemini buckets sort newest first, including labels such as `Gemini 4 Argon (High)`, `Gemini 4 Argon (Low)`, `Gemini 3.8 Flash`, and `Gemini 3.1 Pro (High)`. Claude buckets include `Claude Sonnet 5.5 (Thinking)` and `Claude Opus 5.5 (Thinking)`.
- **Fallback label:** a `gemini-4-argon` model without a display name renders as `Gemini 4 Argon`; a `-high`, `-medium`, or `-low` suffix becomes the matching `(High)`, `(Medium)`, or `(Low)` label
- **Overview and tray:** the Overview scope declares `Gemini 4 Argon`, its High and Low buckets, `Gemini 3.8 Flash (High)`, and the current `Gemini 3.5 Flash Lite`, `Gemini 3 Flash`, and `Gemini 3.1 Flash` rows. The tray primary uses the first available Gemini 4 row, then `Gemini 3.5 Flash Lite`.
- Duplicate model labels are collapsed to the bucket with the lowest remaining fraction
- **Account:** account email/name when available

## Limitations

- Direct Windows language-server process discovery is not enabled yet.
- Antigravity internals are undocumented and may change without notice.
- If local credentials are missing or expired and refresh fails, the user must sign in to Antigravity again.
