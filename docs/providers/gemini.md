# Gemini

Tracks Gemini CLI / Gemini Code Assist usage through local OAuth credentials and
Gemini quota APIs.

## Data sources

- `~/.gemini/settings.json` for auth mode
- `~/.gemini/oauth_creds.json` for OAuth tokens
- Gemini CLI install files for OAuth client ID/secret

On Windows, AI Usage searches common npm, pnpm, Bun, and Volta global install
locations under `%APPDATA%`, `%LOCALAPPDATA%`, and the user profile. Gemini CLI
0.39.x bundles OAuth constants under `@google/gemini-cli/bundle/chunk-*.js`, so
AI Usage scans those bundle files as well as older `oauth2.js` layouts.

On macOS, the plugin keeps the existing Homebrew, nvm, fnm, pnpm, Bun, and
Volta locations for source compatibility.

## Supported auth modes

- `oauth-personal`
- missing auth type (treated as personal OAuth)

## Unsupported auth modes

- `api-key`
- `vertex-ai`

These return explicit errors.

## API endpoints

- `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- `GET https://cloudresourcemanager.googleapis.com/v1/projects` (project fallback)
- `POST https://oauth2.googleapis.com/token` (refresh)

## Output mapping

- **Plan** from `loadCodeAssist` tier:
  - `standard-tier` -> `Paid`
  - `free-tier` + `hd` claim -> `Workspace`
  - `free-tier` -> `Free`
  - `legacy-tier` -> `Legacy`
- **Quota lines**: Gemini quota buckets returned by `retrieveUserQuota`
  - model-specific labels such as `Gemini 3.5 Flash (High)` are preserved when
    the API exposes them
  - older generic buckets still fall back to `Pro` or `Flash`
- **Account**: email from `id_token` claims

## Gemini app and API limits

Google's Gemini app quota model is changing toward compute-based limits in 2026.
That consumer app dashboard is separate from the Gemini CLI / Code Assist quota
endpoint used here.

Gemini API token accounting is also separate. API calls expose request token
counts through `usage_metadata` / `usageMetadata`, but AI Usage does not collect
per-request Gemini API logs or billing data.
