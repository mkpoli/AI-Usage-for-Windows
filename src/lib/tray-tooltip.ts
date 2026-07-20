import type { PluginMeta } from "@/lib/plugin-types"
import type { TrayPrimaryBar } from "@/lib/tray-primary-progress"

/**
 * Formats a fraction (0.0 - 1.0) into a percentage string (0% - 100%).
 */
export function formatTrayPercentText(fraction: number | undefined): string {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return "--%"
  const clampedFraction = Math.max(0, Math.min(1, fraction))
  return `${Math.round(clampedFraction * 100)}%`
}

/**
 * Creates a multi-line tooltip string for the tray icon.
 * Lists the app name followed by enabled plugins and their usage percentages.
 */
/**
 * Windows stores a tray tooltip in a fixed `szTip` buffer and silently drops
 * whatever does not fit, so the text is kept compact to leave room for as many
 * providers as possible. The app name is omitted once there is usage to show:
 * the tray icon already identifies the app, and the header costs a provider.
 */
const TOOLTIP_MAX_CHARS = 127

export function formatTrayTooltip(bars: TrayPrimaryBar[], pluginsMeta: PluginMeta[]): string {
  if (bars.length === 0) return "AI Usage"

  const metaById = new Map(pluginsMeta.map((p) => [p.id, p]))
  const lines: string[] = []
  let length = 0

  for (const bar of bars) {
    const meta = metaById.get(bar.id)
    if (!meta) continue
    const line = `${meta.name} ${formatTrayPercentText(bar.fraction)}`
    const added = lines.length === 0 ? line.length : line.length + 1
    if (length + added > TOOLTIP_MAX_CHARS) break
    lines.push(line)
    length += added
  }

  return lines.length ? lines.join("\n") : "AI Usage"
}
