# Antigravity

> Reverse-engineered, undocumented provider behavior. It may change without notice.

AI Usage for Windows currently supports Antigravity through local SQLite credentials and Google's Cloud Code quota APIs. Direct Windows language-server discovery is intentionally left for a later provider hardening pass.

## Overview

- **Vendor:** Google
- **Primary Windows path:** `%APPDATA%\Antigravity\User\globalStorage\state.vscdb`
- **Fallback API:** `https://cloudcode-pa.googleapis.com`
- **Auth:** Google OAuth access/refresh tokens from Antigravity local state
- **Quota:** per-model remaining fraction, mapped to percent used
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

## Token Refresh

The protobuf state can include:

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

The response includes provisioned models and quota information. AI Usage filters out internal or non-user-facing models and renders each visible model quota bucket separately.

## Output Mapping

- **Plan:** best-effort account plan name when available
- **Model lines:** each visible Antigravity model quota bucket is shown as percent used, preserving labels such as `Gemini 3.5 Flash (High)`, `Gemini 3.5 Flash (Low)`, `Gemini 3.5 Flash (Medium)`, `Gemini 3.1 Pro (High)`, `Gemini 3.1 Pro (Low)`, `Claude Sonnet 4.6 (Thinking)`, `Claude Opus 4.6 (Thinking)`, and `GPT-OSS 120B (Medium)`
- **Home dashboard:** focuses on `Gemini 3.5 Flash (High)`, `Gemini 3.5 Flash (Low)` / `Gemini 3.5 Flash (Medium)`, and `Gemini 3.1 Pro (High)` when those buckets are present
- Duplicate model labels are collapsed to the bucket with the lowest remaining fraction
- **Account:** account email/name when available

## Limitations

- Direct Windows language-server process discovery is not enabled yet.
- Antigravity internals are undocumented and may change without notice.
- If local credentials are missing or expired and refresh fails, the user must sign in to Antigravity again.
