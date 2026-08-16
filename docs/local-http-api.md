# Local HTTP API

AI Usage exposes a read-only HTTP API on the loopback interface so other local apps can consume the same usage data shown in the menu bar.

**Base URL:** `http://127.0.0.1:6736`

The server binds `127.0.0.1` only, so it is reachable from this machine alone.

The server is off by default so the app does not open a loopback socket during normal startup. Turn it on under **Settings > Desktop Widgets**; the choice is stored as `localHttpApi` in `settings.json` and applies immediately and on every later launch. When the port is already taken, the settings panel says so and the choice is kept, so a freed port is picked up at the next launch.

## Routes

Two shapes of the same cached data: JSON for programs that parse it, and flat text for Rainmeter, whose regex-based reader needs a fixed line order. See [rainmeter.md](rainmeter.md) for the text format.

### `GET /v1/usage`

Returns an array of cached usage snapshots for all **enabled** providers, ordered by your plugin settings.

- **200 OK** — JSON array (may be empty `[]` if no cached data exists yet).

### `GET /v1/usage/:providerId`

Returns a single cached usage snapshot for the given provider.

- **200 OK** — JSON object with cached snapshot.
- **204 No Content** — Provider is known but has no cached snapshot yet.
- **404 Not Found** — Provider ID is unknown.

### `GET /v1/rainmeter`

Flat `key=value` text for all **enabled** providers, each key prefixed by the provider's 1-based position, led by a `Count` line.

- **200 OK** — `text/plain; charset=utf-8`, `Count=0` when nothing is cached.

### `GET /v1/rainmeter/:providerId`

Flat `key=value` text for one provider, with unprefixed keys.

- **200 OK** — `text/plain; charset=utf-8`. A known provider with no cached snapshot answers with the same keys and empty values, so a widget's expression keeps matching.
- **404 Not Found** — Provider ID is unknown.

### Unsupported methods

Any method other than `GET` or `OPTIONS` on the above routes returns **405 Method Not Allowed**.

Unknown routes return **404 Not Found**.

## Response Shape

```json
{
  "providerId": "claude",
  "displayName": "Claude",
  "plan": "Team 5x",
  "lines": [
    {
      "type": "progress",
      "label": "Session",
      "used": 42.0,
      "limit": 100.0,
      "format": { "kind": "percent" },
      "resetsAt": "2026-03-26T13:00:00.161Z",
      "periodDurationMs": 18000000,
      "color": null
    },
    {
      "type": "text",
      "label": "Today",
      "value": "$5.17 \u00b7 9.2M tokens",
      "color": null,
      "subtitle": null
    }
  ],
  "fetchedAt": "2026-03-26T11:16:29Z"
}
```

The `lines` array uses the same metric line types as the internal plugin output: `progress`, `text`, and `badge`.

`fetchedAt` is an ISO 8601 timestamp indicating when the snapshot was last successfully fetched.

`iconUrl` is intentionally omitted from the API response to keep payloads small.

## Filtering and Caching Behavior

- The collection endpoint (`/v1/usage`) returns **enabled providers only**, in the order defined by your plugin settings.
- Only **successful** probe results are cached. A failed probe never overwrites a previous successful snapshot.
- The single-provider endpoint (`/v1/usage/:providerId`) works for any known provider, including disabled ones.

## CORS

All responses include permissive CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` requests return **204 No Content** with these headers for preflight support.

The open origin is deliberate: widgets and local pages that read this API run under origins the app cannot know ahead of time. The loopback bind is the boundary, since any program running on this machine could read the same numbers directly from the app. Responses carry usage totals only, no tokens or credentials.

## Error Responses

Error responses use this shape:

```json
{
  "error": "provider_not_found"
}
```

Possible error codes: `provider_not_found`, `not_found`, `method_not_allowed`.
