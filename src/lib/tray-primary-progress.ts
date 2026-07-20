import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import { DEFAULT_DISPLAY_MODE, type DisplayMode } from "@/lib/settings"
import { clamp01 } from "@/lib/utils"

type PluginState = {
  data: PluginOutput | null
  loading: boolean
  error: string | null
}

export type TrayPrimaryBar = {
  id: string
  fraction?: number
}

type ProgressLine = Extract<
  PluginOutput["lines"][number],
  { type: "progress"; label: string; used: number; limit: number }
>

function isProgressLine(line: PluginOutput["lines"][number]): line is ProgressLine {
  return line.type === "progress"
}

export function getTrayPrimaryBars(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  maxBars?: number
  displayMode?: DisplayMode
  pluginId?: string
}): TrayPrimaryBar[] {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    maxBars = Number.POSITIVE_INFINITY,
    displayMode = DEFAULT_DISPLAY_MODE,
    pluginId,
  } = args
  if (!pluginSettings) return []

  const metaById = new Map(pluginsMeta.map((p) => [p.id, p]))
  const disabled = new Set(pluginSettings.disabled)
  const orderedIds = pluginId
    ? [pluginId]
    : pluginSettings.order

  const out: TrayPrimaryBar[] = []
  for (const id of orderedIds) {
    if (disabled.has(id)) continue
    const meta = metaById.get(id)
    if (!meta) continue
    
    // Skip if no primary candidates defined
    if (!meta.primaryCandidates || meta.primaryCandidates.length === 0) continue

    const state = pluginStates[id]
    const data = state?.data ?? null

    let fraction: number | undefined
    if (data) {
      // Find first candidate that exists in runtime data
      const primaryLabel = meta.primaryCandidates.find((label) =>
        data.lines.some((line) => isProgressLine(line) && line.label === label)
      )
      if (primaryLabel) {
        const primaryLine = data.lines.find(
          (line): line is ProgressLine =>
            isProgressLine(line) && line.label === primaryLabel
        )
        if (primaryLine && primaryLine.limit > 0) {
          // A gating limit caps availability: the provider is as blocked as its
          // fullest gating bucket, so take the max used-fraction across the
          // primary bar and any present gating bars. Display mode is applied
          // afterward, keeping "used" and "remaining" consistent.
          let usedFraction = primaryLine.used / primaryLine.limit
          for (const label of meta.gatingLimits ?? []) {
            const gatingLine = data.lines.find(
              (line): line is ProgressLine =>
                isProgressLine(line) && line.label === label
            )
            if (gatingLine && gatingLine.limit > 0) {
              usedFraction = Math.max(usedFraction, gatingLine.used / gatingLine.limit)
            }
          }
          const shownFraction = displayMode === "used" ? usedFraction : 1 - usedFraction
          fraction = clamp01(shownFraction)
        }
      }
    }

    out.push({ id, fraction })
    if (out.length >= maxBars) break
  }

  return out
}

