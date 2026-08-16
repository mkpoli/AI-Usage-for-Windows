//! Flat `key=value` rendering of cached usage for Rainmeter skins.
//!
//! Rainmeter reads remote data with WebParser, which extracts values by regular
//! expression. A line-oriented format with fixed key names lets a skin anchor on
//! `^Percent=(.*)$` and keep working no matter how many metric lines a provider
//! reports. The shape is documented in `docs/rainmeter.md`.

use super::cache::{CachedPluginSnapshot, PluginMetricMeta};
use crate::plugin_engine::runtime::{MetricLine, ProgressFormat};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

/// A progress line flattened into the numbers a meter needs.
struct Bar {
    label: String,
    used: f64,
    limit: f64,
    percent: u32,
    value: String,
    resets_at: Option<String>,
    resets_in_sec: Option<i64>,
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// Every enabled provider, each key prefixed by its 1-based position.
pub(super) fn render_collection(
    entries: &[(CachedPluginSnapshot, Option<PluginMetricMeta>)],
    now: OffsetDateTime,
) -> String {
    let mut out = String::new();
    push(&mut out, "", "Count", &entries.len().to_string());
    for (index, (snapshot, meta)) in entries.iter().enumerate() {
        let prefix = format!("{}.", index + 1);
        render_provider(&mut out, &prefix, snapshot, meta.as_ref(), now);
    }
    out
}

/// A single provider with unprefixed keys, so a skin regex has a fixed shape.
pub(super) fn render_provider_page(
    snapshot: &CachedPluginSnapshot,
    meta: Option<&PluginMetricMeta>,
    now: OffsetDateTime,
) -> String {
    let mut out = String::new();
    render_provider(&mut out, "", snapshot, meta, now);
    out
}

/// A provider the app knows but has not probed yet: same keys, no values, so a
/// skin still matches and simply renders nothing.
pub(super) fn render_empty_provider_page(provider_id: &str) -> String {
    let mut out = String::new();
    for key in [
        "Id",
        "Name",
        "Plan",
        "FetchedAt",
        "Label",
        "Percent",
        "GatedPercent",
        "Used",
        "Limit",
        "Value",
        "ResetsAt",
        "ResetsInSec",
    ] {
        let value = if key == "Id" { provider_id } else { "" };
        push(&mut out, "", key, value);
    }
    push(&mut out, "", "Bars", "0");
    out
}

fn render_provider(
    out: &mut String,
    prefix: &str,
    snapshot: &CachedPluginSnapshot,
    meta: Option<&PluginMetricMeta>,
    now: OffsetDateTime,
) {
    let bars = collect_bars(snapshot, now);
    let headline = pick_headline(&bars, meta);

    push(out, prefix, "Id", &sanitize(&snapshot.provider_id));
    push(out, prefix, "Name", &sanitize(&snapshot.display_name));
    push(
        out,
        prefix,
        "Plan",
        &sanitize(snapshot.plan.as_deref().unwrap_or("")),
    );
    push(out, prefix, "FetchedAt", &sanitize(&snapshot.fetched_at));

    match headline {
        Some(bar) => {
            push(out, prefix, "Label", &sanitize(&bar.label));
            push(out, prefix, "Percent", &bar.percent.to_string());
            push(
                out,
                prefix,
                "GatedPercent",
                &gated_percent(&bars, bar, meta).to_string(),
            );
            push(out, prefix, "Used", &number(bar.used));
            push(out, prefix, "Limit", &number(bar.limit));
            push(out, prefix, "Value", &sanitize(&bar.value));
            push(
                out,
                prefix,
                "ResetsAt",
                &sanitize(bar.resets_at.as_deref().unwrap_or("")),
            );
            push(
                out,
                prefix,
                "ResetsInSec",
                &bar.resets_in_sec
                    .map(|secs| secs.to_string())
                    .unwrap_or_default(),
            );
        }
        None => {
            for key in [
                "Label",
                "Percent",
                "GatedPercent",
                "Used",
                "Limit",
                "Value",
                "ResetsAt",
                "ResetsInSec",
            ] {
                push(out, prefix, key, "");
            }
        }
    }

    push(out, prefix, "Bars", &bars.len().to_string());
    for (index, bar) in bars.iter().enumerate() {
        let bar_prefix = format!("{}Bar{}.", prefix, index + 1);
        push(out, &bar_prefix, "Label", &sanitize(&bar.label));
        push(out, &bar_prefix, "Percent", &bar.percent.to_string());
        push(out, &bar_prefix, "Used", &number(bar.used));
        push(out, &bar_prefix, "Limit", &number(bar.limit));
        push(out, &bar_prefix, "Value", &sanitize(&bar.value));
        push(
            out,
            &bar_prefix,
            "ResetsAt",
            &sanitize(bar.resets_at.as_deref().unwrap_or("")),
        );
        push(
            out,
            &bar_prefix,
            "ResetsInSec",
            &bar.resets_in_sec
                .map(|secs| secs.to_string())
                .unwrap_or_default(),
        );
    }
}

fn push(out: &mut String, prefix: &str, key: &str, value: &str) {
    out.push_str(prefix);
    out.push_str(key);
    out.push('=');
    out.push_str(value);
    out.push('\n');
}

// ---------------------------------------------------------------------------
// Metric selection
// ---------------------------------------------------------------------------

fn collect_bars(snapshot: &CachedPluginSnapshot, now: OffsetDateTime) -> Vec<Bar> {
    snapshot
        .lines
        .iter()
        .filter_map(|line| match line {
            MetricLine::Progress {
                label,
                used,
                limit,
                format,
                resets_at,
                ..
            } => Some(Bar {
                label: label.clone(),
                used: *used,
                limit: *limit,
                percent: percent_of(*used, *limit),
                value: format_amount(*used, format),
                resets_at: resets_at.clone(),
                resets_in_sec: resets_at
                    .as_deref()
                    .and_then(|iso| seconds_until(iso, now)),
            }),
            _ => None,
        })
        .collect()
}

/// The provider's headline bucket: the first manifest candidate that the probe
/// actually reported, falling back to the first progress line.
fn pick_headline<'a>(bars: &'a [Bar], meta: Option<&PluginMetricMeta>) -> Option<&'a Bar> {
    if let Some(meta) = meta {
        for candidate in &meta.primary_candidates {
            if let Some(bar) = bars.iter().find(|bar| &bar.label == candidate) {
                return Some(bar);
            }
        }
    }
    bars.first()
}

/// How blocked the provider is overall. A full gating bucket stops work even
/// when the headline bar has room, so the fullest of the two wins.
fn gated_percent(bars: &[Bar], headline: &Bar, meta: Option<&PluginMetricMeta>) -> u32 {
    let mut peak = headline.percent;
    if let Some(meta) = meta {
        for label in &meta.gating_limits {
            if let Some(bar) = bars.iter().find(|bar| &bar.label == label) {
                peak = peak.max(bar.percent);
            }
        }
    }
    peak
}

fn percent_of(used: f64, limit: f64) -> u32 {
    if !used.is_finite() || !limit.is_finite() || limit <= 0.0 {
        return 0;
    }
    let ratio = (used / limit * 100.0).round();
    ratio.clamp(0.0, 100.0) as u32
}

fn seconds_until(iso: &str, now: OffsetDateTime) -> Option<i64> {
    let target = OffsetDateTime::parse(iso, &Rfc3339).ok()?;
    Some((target - now).whole_seconds().max(0))
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

fn format_amount(value: f64, format: &ProgressFormat) -> String {
    match format {
        ProgressFormat::Percent => format!("{}%", number(value.round())),
        ProgressFormat::Dollars => format!("${}", format_grouped(value, false)),
        ProgressFormat::Count { suffix } => {
            format!("{} {}", format_grouped(value, true), suffix)
        }
    }
}

/// Thousands-grouped decimal matching the `en-US` formatting the app's cards
/// use: whole numbers print bare, fractions to two places. `trim` drops
/// trailing zeros, which is the difference between a count and a currency.
fn format_grouped(value: f64, trim: bool) -> String {
    if !value.is_finite() {
        return "0".to_string();
    }
    let digits = if value.fract() == 0.0 { 0 } else { 2 };
    let text = format!("{:.*}", digits, value.abs());
    let (integer, fraction) = match text.split_once('.') {
        Some((integer, fraction)) => (integer, Some(fraction.to_string())),
        None => (text.as_str(), None),
    };

    let fraction = fraction.and_then(|fraction| {
        if !trim {
            return Some(fraction);
        }
        let trimmed = fraction.trim_end_matches('0').to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    });

    let mut out = String::new();
    if value < 0.0 {
        out.push('-');
    }
    for (index, digit) in integer.chars().enumerate() {
        if index > 0 && (integer.len() - index) % 3 == 0 {
            out.push(',');
        }
        out.push(digit);
    }
    if let Some(fraction) = fraction {
        out.push('.');
        out.push_str(&fraction);
    }
    out
}

/// Raw number for a skin to compute with: no grouping, no trailing decimals.
fn number(value: f64) -> String {
    if !value.is_finite() {
        return "0".to_string();
    }
    if value.fract() == 0.0 {
        return format!("{}", value as i64);
    }
    format!("{}", value)
}

/// The format is line-oriented, so a label carrying a newline would forge keys.
fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> OffsetDateTime {
        OffsetDateTime::parse("2026-08-15T11:16:29Z", &Rfc3339).unwrap()
    }

    fn progress(label: &str, used: f64, limit: f64, resets_at: Option<&str>) -> MetricLine {
        MetricLine::Progress {
            label: label.to_string(),
            used,
            limit,
            format: ProgressFormat::Percent,
            resets_at: resets_at.map(|value| value.to_string()),
            period_duration_ms: None,
            color: None,
        }
    }

    fn snapshot(lines: Vec<MetricLine>) -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            display_name: "Claude".to_string(),
            plan: Some("Max 20x".to_string()),
            lines,
            fetched_at: "2026-08-15T11:16:29Z".to_string(),
        }
    }

    fn meta(primary: &[&str], gating: &[&str]) -> PluginMetricMeta {
        PluginMetricMeta {
            id: "claude".to_string(),
            primary_candidates: primary.iter().map(|s| s.to_string()).collect(),
            gating_limits: gating.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn value_of<'a>(rendered: &'a str, key: &str) -> Option<&'a str> {
        rendered
            .lines()
            .find_map(|line| line.strip_prefix(&format!("{}=", key)))
    }

    #[test]
    fn headline_follows_manifest_primary_order() {
        let snap = snapshot(vec![
            progress("Weekly", 90.0, 100.0, None),
            progress("Session", 42.0, 100.0, None),
        ]);
        let rendered = render_provider_page(&snap, Some(&meta(&["Session"], &[])), now());

        assert_eq!(value_of(&rendered, "Label"), Some("Session"));
        assert_eq!(value_of(&rendered, "Percent"), Some("42"));
    }

    #[test]
    fn headline_falls_back_to_first_progress_line() {
        let snap = snapshot(vec![progress("Only", 10.0, 40.0, None)]);
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "Label"), Some("Only"));
        assert_eq!(value_of(&rendered, "Percent"), Some("25"));
    }

    #[test]
    fn gated_percent_takes_the_fullest_gating_bucket() {
        let snap = snapshot(vec![
            progress("Session", 42.0, 100.0, None),
            progress("Weekly", 91.0, 100.0, None),
        ]);
        let rendered = render_provider_page(&snap, Some(&meta(&["Session"], &["Weekly"])), now());

        assert_eq!(value_of(&rendered, "Percent"), Some("42"));
        assert_eq!(value_of(&rendered, "GatedPercent"), Some("91"));
    }

    #[test]
    fn gated_percent_equals_percent_without_gating_limits() {
        let snap = snapshot(vec![progress("Session", 42.0, 100.0, None)]);
        let rendered = render_provider_page(&snap, Some(&meta(&["Session"], &[])), now());

        assert_eq!(value_of(&rendered, "GatedPercent"), Some("42"));
    }

    #[test]
    fn resets_in_sec_counts_down_and_floors_at_zero() {
        let snap = snapshot(vec![progress(
            "Session",
            1.0,
            10.0,
            Some("2026-08-15T13:00:00Z"),
        )]);
        let rendered = render_provider_page(&snap, None, now());
        assert_eq!(value_of(&rendered, "ResetsInSec"), Some("6211"));

        let past = snapshot(vec![progress(
            "Session",
            1.0,
            10.0,
            Some("2026-08-15T09:00:00Z"),
        )]);
        let rendered = render_provider_page(&past, None, now());
        assert_eq!(value_of(&rendered, "ResetsInSec"), Some("0"));
    }

    #[test]
    fn missing_reset_leaves_the_key_present_and_empty() {
        let snap = snapshot(vec![progress("Session", 1.0, 10.0, None)]);
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "ResetsAt"), Some(""));
        assert_eq!(value_of(&rendered, "ResetsInSec"), Some(""));
    }

    #[test]
    fn percent_clamps_when_usage_exceeds_the_limit() {
        let snap = snapshot(vec![progress("Session", 130.0, 100.0, None)]);
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "Percent"), Some("100"));
        assert_eq!(value_of(&rendered, "Used"), Some("130"));
    }

    #[test]
    fn zero_limit_reports_zero_percent_instead_of_dividing() {
        let snap = snapshot(vec![progress("Session", 5.0, 0.0, None)]);
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "Percent"), Some("0"));
    }

    #[test]
    fn text_and_badge_lines_are_not_bars() {
        let snap = snapshot(vec![
            MetricLine::Text {
                label: "Today".to_string(),
                value: "$5.17".to_string(),
                color: None,
                subtitle: None,
            },
            progress("Session", 1.0, 10.0, None),
            MetricLine::Badge {
                label: "Peak Hours".to_string(),
                text: "Off-peak".to_string(),
                color: None,
                subtitle: None,
            },
        ]);
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "Bars"), Some("1"));
        assert_eq!(value_of(&rendered, "Bar1.Label"), Some("Session"));
    }

    #[test]
    fn provider_without_progress_lines_keeps_every_key() {
        let snap = snapshot(vec![MetricLine::Text {
            label: "Today".to_string(),
            value: "$5.17".to_string(),
            color: None,
            subtitle: None,
        }]);
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "Percent"), Some(""));
        assert_eq!(value_of(&rendered, "Label"), Some(""));
        assert_eq!(value_of(&rendered, "Bars"), Some("0"));
        assert_eq!(value_of(&rendered, "Name"), Some("Claude"));
    }

    #[test]
    fn collection_prefixes_each_provider_by_position() {
        let entries = vec![
            (snapshot(vec![progress("Session", 42.0, 100.0, None)]), None),
            (
                CachedPluginSnapshot {
                    provider_id: "codex".to_string(),
                    display_name: "Codex".to_string(),
                    plan: None,
                    lines: vec![progress("Weekly", 3.0, 12.0, None)],
                    fetched_at: "2026-08-15T11:00:00Z".to_string(),
                },
                None,
            ),
        ];
        let rendered = render_collection(&entries, now());

        assert_eq!(value_of(&rendered, "Count"), Some("2"));
        assert_eq!(value_of(&rendered, "1.Id"), Some("claude"));
        assert_eq!(value_of(&rendered, "1.Percent"), Some("42"));
        assert_eq!(value_of(&rendered, "2.Id"), Some("codex"));
        assert_eq!(value_of(&rendered, "2.Percent"), Some("25"));
        assert_eq!(value_of(&rendered, "2.Plan"), Some(""));
    }

    #[test]
    fn empty_collection_still_reports_a_count() {
        let rendered = render_collection(&[], now());
        assert_eq!(rendered, "Count=0\n");
    }

    #[test]
    fn uncached_provider_page_has_the_same_keys_as_a_cached_one() {
        let rendered = render_empty_provider_page("gemini");
        assert_eq!(value_of(&rendered, "Id"), Some("gemini"));
        assert_eq!(value_of(&rendered, "Name"), Some(""));
        assert_eq!(value_of(&rendered, "Bars"), Some("0"));

        let cached = render_provider_page(&snapshot(vec![]), None, now());
        let keys = |text: &str| -> Vec<String> {
            text.lines()
                .filter_map(|line| line.split_once('=').map(|(key, _)| key.to_string()))
                .collect()
        };
        assert_eq!(keys(&rendered), keys(&cached));
    }

    #[test]
    fn newlines_in_provider_text_cannot_forge_a_key() {
        let mut snap = snapshot(vec![]);
        snap.plan = Some("Max\nPercent=99".to_string());
        let rendered = render_provider_page(&snap, None, now());

        assert_eq!(value_of(&rendered, "Plan"), Some("Max Percent=99"));
        assert_eq!(value_of(&rendered, "Percent"), Some(""));
    }

    #[test]
    fn amounts_format_like_the_provider_cards() {
        assert_eq!(format_amount(42.0, &ProgressFormat::Percent), "42%");
        assert_eq!(format_amount(5.17, &ProgressFormat::Dollars), "$5.17");
        assert_eq!(format_amount(12.0, &ProgressFormat::Dollars), "$12");
        assert_eq!(
            format_amount(
                9_200_000.0,
                &ProgressFormat::Count {
                    suffix: "tokens".to_string()
                }
            ),
            "9,200,000 tokens"
        );
        assert_eq!(
            format_amount(
                1234.5,
                &ProgressFormat::Count {
                    suffix: "msgs".to_string()
                }
            ),
            "1,234.5 msgs"
        );
    }

    /// The shipped skin's WebParser expression is written against these exact
    /// bytes, so a change here is a change to the widget contract.
    #[test]
    fn provider_page_matches_the_documented_sample() {
        let snap = CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            display_name: "Claude".to_string(),
            plan: Some("Max 20x".to_string()),
            lines: vec![
                progress("Session", 42.0, 100.0, Some("2026-08-15T13:00:00Z")),
                progress("Weekly", 80.0, 100.0, None),
                MetricLine::Text {
                    label: "Today".to_string(),
                    value: "$5.17".to_string(),
                    color: None,
                    subtitle: None,
                },
                MetricLine::Badge {
                    label: "Peak Hours".to_string(),
                    text: "Off-peak".to_string(),
                    color: None,
                    subtitle: None,
                },
            ],
            fetched_at: "2026-08-15T11:16:29Z".to_string(),
        };

        let rendered = render_provider_page(&snap, Some(&meta(&["Session"], &["Weekly"])), now());
        assert_eq!(rendered, include_str!("rainmeter-sample.txt"));
    }

    #[test]
    fn raw_numbers_stay_ungrouped_for_skin_arithmetic() {
        assert_eq!(number(9_200_000.0), "9200000");
        assert_eq!(number(42.5), "42.5");
        assert_eq!(number(f64::NAN), "0");
    }
}
