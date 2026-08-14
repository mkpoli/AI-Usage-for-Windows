# Rainmeter Widget

AI Usage ships Rainmeter skins that put a provider's usage bar on the desktop.
They read the loopback API described in [local-http-api.md](local-http-api.md),
so nothing is sent off the machine and no credentials pass through Rainmeter.

## Setup

1. In AI Usage, open **Settings > Desktop Widgets** and turn on
   *Serve usage on http://127.0.0.1:6736*.
2. Copy the folder `rainmeter/AI Usage` from this repository into your Rainmeter
   skins folder, which is `Documents\Rainmeter\Skins` in a default install. The
   result should be `Documents\Rainmeter\Skins\AI Usage\Claude\Claude.ini` and a
   sibling folder per provider.
3. Right-click the Rainmeter tray icon, choose **Refresh all**, then load a skin
   from **Skins > AI Usage**.

Each provider is a separate skin, so you can load only the ones you care about
and drag each where you want it. Skins exist for Claude, Codex, Gemini,
Antigravity, Cursor, Copilot, Grok, Sakana AI, Kimi, Qwen and Z.ai.

## What a skin shows

The provider name, the plan, a bar for the headline limit, that limit's label
and current value, and a countdown to its reset. The headline limit is the same
one the tray icon fills from — Session for Claude, for instance.

A skin has three states:

- Numbers, once the app has measured the provider.
- `no usage to show yet`, when AI Usage knows the provider but has not measured
  it, which is what a disabled provider looks like.
- `AI Usage is not serving on http://127.0.0.1:6736`, when nothing answers:
  the app is closed, or the endpoint is off.

## Settings

`@Resources\Variables.inc` holds the colours, fonts, size, and two values worth
knowing about:

| Variable | Default | Meaning |
| --- | --- | --- |
| `APIRoot` | `http://127.0.0.1:6736` | Where AI Usage serves usage data |
| `UpdateSeconds` | `60` | Seconds between reads |

Reading faster than AI Usage refreshes returns the same cached numbers, so
`UpdateSeconds` below the app's Auto Refresh interval buys nothing.

## The data behind the skin

`GET /v1/rainmeter/<providerId>` answers with `text/plain`, one `key=value` per
line, in a fixed order. Rainmeter extracts values by regular expression, and a
fixed line order is what lets one expression work across providers that report
different numbers of limits.

```
Id=claude
Name=Claude
Plan=Max 20x
FetchedAt=2026-08-15T11:16:29Z
Label=Session
Percent=42
GatedPercent=80
Used=42
Limit=100
Value=42%
ResetsAt=2026-08-15T13:00:00Z
ResetsInSec=6211
Bars=2
Bar1.Label=Session
Bar1.Percent=42
Bar1.Used=42
Bar1.Limit=100
Bar1.Value=42%
Bar1.ResetsAt=2026-08-15T13:00:00Z
Bar1.ResetsInSec=6211
Bar2.Label=Weekly
...
```

`Id` through `Bars` always appear, in that order, even when the provider has no
data yet — the values are then empty and `Bars` is `0`. `Bar<n>.` blocks repeat
`Bars` times, one per progress limit, in the order the provider reports them.

| Key | Meaning |
| --- | --- |
| `Label`, `Percent`, `Used`, `Limit`, `Value`, `ResetsAt`, `ResetsInSec` | The headline limit |
| `GatedPercent` | The fullest of the headline limit and any gating limit, which is what the tray icon fills from |
| `Percent` | 0–100, rounded, clamped; `Used` and `Limit` stay raw |
| `Value` | Formatted the way the app's cards write it: `42%`, `$5.17`, `9,200,000 tokens` |
| `ResetsInSec` | Seconds until reset, floored at 0; empty when the limit has no reset |

`Percent` always describes the headline limit alone, so it agrees with `Used`
and `Limit` on the same page. When a provider has a gating limit that fills
faster, `GatedPercent` is the number that says how blocked the provider is.

Percentages describe usage, not headroom. The **Usage Mode** setting in the app
changes the app's own display and leaves these values alone; a skin that wants
headroom subtracts from 100.

`GET /v1/rainmeter` returns every enabled provider in one response, with each
key prefixed by the provider's 1-based position (`1.Id`, `1.Percent`,
`2.Id`, …) and a leading `Count`. An unknown provider id answers 404.

## Writing your own skin

The measure that drives the shipped skins:

```ini
[MeasureUsage]
Measure=WebParser
URL=http://127.0.0.1:6736/v1/rainmeter/claude
UpdateRate=60
RegExp=(?siU)^Id=(.*)\r?\nName=(.*)\r?\nPlan=(.*)\r?\nFetchedAt=(.*)\r?\nLabel=(.*)\r?\nPercent=(.*)\r?\nGatedPercent=(.*)\r?\nUsed=(.*)\r?\nLimit=(.*)\r?\nValue=(.*)\r?\nResetsAt=(.*)\r?\nResetsInSec=(.*)\r?\nBars=(.*)\r?\n
```

`StringIndex` then picks a field: 1 `Id`, 2 `Name`, 3 `Plan`, 4 `FetchedAt`,
5 `Label`, 6 `Percent`, 7 `GatedPercent`, 8 `Used`, 9 `Limit`, 10 `Value`,
11 `ResetsAt`, 12 `ResetsInSec`, 13 `Bars`.

Two things to know when building on this:

- A Bar meter needs a number, and WebParser produces strings. Put the string
  through `Measure=Calc` with `Formula=[MeasurePercent]` and
  `DynamicVariables=1`, and give that measure `MinValue=0` and `MaxValue=100`.
- Add `Substitute="":"0"` to any string a Calc formula reads, or the formula
  breaks on the empty values an unmeasured provider returns.
