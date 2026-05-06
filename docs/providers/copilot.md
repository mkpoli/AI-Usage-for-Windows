# GitHub Copilot

Tracks GitHub Copilot usage quotas for paid and free tier users.

## Authentication

The plugin looks for a GitHub Copilot-compatible token in this order:

1. **AI Usage Keychain** (`AI Usage-copilot`) - token previously cached by the plugin
2. **GitHub Copilot CLI Keychain** (`copilot-cli`) - token from `copilot login`
3. **GitHub CLI Keychain** (`gh:github.com`) - token from `gh auth login`
4. **Environment** (`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`)
5. **State File** (`auth.json`) - fallback file-based storage

### Setup

Authenticate with GitHub Copilot CLI:

```bash
copilot login
```

You can also authenticate with the GitHub CLI:

```bash
winget install --id GitHub.cli
gh auth login
```

Choose `GitHub.com` and follow the prompts. The plugin automatically reads the token from the Copilot CLI or GitHub CLI keychain. Once authenticated, the plugin caches the token in the AI Usage keychain for faster access on later probes.

## API

**Endpoint:** `https://api.github.com/copilot_internal/user`

**Headers:**

```http
Authorization: Bearer <token>
Accept: application/json
Editor-Version: vscode/1.96.2
Editor-Plugin-Version: copilot-chat/0.26.7
User-Agent: GitHubCopilotChat/0.26.7
X-Github-Api-Version: 2025-04-01
```

## Displayed Lines

| Line | Tier | Description |
| --- | --- | --- |
| Premium | Paid | Premium interactions remaining |
| Chat | Both | Chat messages remaining |
| Completions | Free | Code completions remaining |

All progress lines include:

- `resetsAt` - ISO timestamp of next quota reset
- `periodDurationMs` - 30-day period

## Errors

| Condition | Message |
| --- | --- |
| No token found | `Not logged in. Run copilot login or gh auth login first.` |
| 401/403 | `Token invalid. Run copilot login or gh auth login to re-authenticate.` |
| HTTP error | `Usage request failed (HTTP {status}). Try again later.` |
| Network error | `Usage request failed. Check your connection.` |
| Invalid JSON | `Usage response invalid. Try again later.` |
