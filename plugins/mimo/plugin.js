(function () {
  const CONFIG_PATH = "~/.ai-usage/config.json"
  const PLATFORM_URL = "https://platform.xiaomimimo.com"
  const USAGE_URL = PLATFORM_URL + "/api/v1/tokenPlan/usage"
  const DETAIL_URL = PLATFORM_URL + "/api/v1/tokenPlan/detail"

  const DAY_MS = 24 * 60 * 60 * 1000
  const MONTH_MS = 30 * DAY_MS

  // The console session is authenticated by four cookies. Sending only those
  // keeps the header small and matches what the platform itself issues; any
  // other pasted cookie is still forwarded when the known names are missing.
  const REQUIRED_COOKIES = [
    "api-platform_serviceToken",
    "userId",
    "api-platform_slh",
    "api-platform_ph",
  ]

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  // Rejects null-like values before coercion: Number(null) and Number("") are
  // both 0, which would render a missing used/limit/percent as a full zero row.
  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  function readBoolean(value) {
    if (typeof value === "boolean") return value
    if (value === 1 || value === "1" || value === "true") return true
    if (value === 0 || value === "0" || value === "false") return false
    return null
  }

  function readEnv(ctx, name) {
    try {
      return readString(ctx.host.env.get(name))
    } catch (e) {
      ctx.host.log.warn(name + " read failed: " + String(e))
      return null
    }
  }

  function pickFirstString(values) {
    for (let i = 0; i < values.length; i += 1) {
      const value = readString(values[i])
      if (value) return value
    }
    return null
  }

  function loadConfig(ctx) {
    try {
      if (!ctx.host.fs.exists(CONFIG_PATH)) return {}
      const config = ctx.util.tryParseJson(ctx.host.fs.readText(CONFIG_PATH))
      if (!config || typeof config !== "object") return {}
      return config.mimo && typeof config.mimo === "object" ? config.mimo : {}
    } catch (e) {
      ctx.host.log.warn("config read failed: " + String(e))
      return {}
    }
  }

  // Accepts a full "Cookie: a=b; c=d" header, bare "a=b; c=d" pairs across one or
  // many lines, or a DevTools Cookies table paste (name <TAB> value <TAB> ...).
  function parseCookieInput(raw) {
    const text = readString(raw)
    if (!text) return null

    const order = []
    const byName = {}
    const lines = text.split(/[\r\n]+/)

    for (let i = 0; i < lines.length; i += 1) {
      let line = lines[i].trim()
      if (!line) continue

      const headerMatch = line.match(/^(?:set-)?cookie\s*:\s*(.*)$/i)
      if (headerMatch) line = headerMatch[1].trim()
      if (!line) continue

      const pairs = []
      // A DevTools Cookies table row is column-separated; a cookie header never
      // is. Checking the separator rather than the absence of "=" keeps base64
      // values such as `abc==` from being split apart.
      const tableCols = /(\t|\s{2,})/.test(line)
        ? line.split(/\t+|\s{2,}/).map(function (col) {
            return col.trim()
          }).filter(Boolean)
        : []
      if (tableCols.length >= 2 && /^[A-Za-z0-9_.-]+$/.test(tableCols[0])) {
        pairs.push({ name: tableCols[0], value: tableCols[1] })
      } else {
        const segments = line.split(";")
        for (let j = 0; j < segments.length; j += 1) {
          const segment = segments[j].trim()
          if (!segment) continue
          const eq = segment.indexOf("=")
          if (eq <= 0) continue
          const name = segment.slice(0, eq).trim()
          const value = segment.slice(eq + 1).trim()
          if (name && value) pairs.push({ name: name, value: value })
        }
      }

      for (let k = 0; k < pairs.length; k += 1) {
        const pair = pairs[k]
        if (!Object.prototype.hasOwnProperty.call(byName, pair.name)) order.push(pair.name)
        byName[pair.name] = pair.value
      }
    }

    if (!order.length) return null
    return order
      .map(function (name) {
        return name + "=" + byName[name]
      })
      .join("; ")
  }

  function parseCookiePairs(header) {
    const byName = {}
    const segments = String(header || "").split(";")
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i].trim()
      if (!segment) continue
      const eq = segment.indexOf("=")
      if (eq <= 0) continue
      byName[segment.slice(0, eq).trim()] = segment.slice(eq + 1).trim()
    }
    return byName
  }

  function narrowCookieHeader(header) {
    const byName = parseCookiePairs(header)
    const parts = []
    for (let i = 0; i < REQUIRED_COOKIES.length; i += 1) {
      const name = REQUIRED_COOKIES[i]
      if (byName[name]) parts.push(name + "=" + byName[name])
    }
    return parts.length ? parts.join("; ") : header
  }

  function loadCookieHeader(ctx, config) {
    const fromEnv = pickFirstString([
      readEnv(ctx, "MIMO_COOKIE"),
      readEnv(ctx, "MIMO_SESSION_COOKIE"),
    ])
    if (fromEnv) {
      const header = parseCookieInput(fromEnv)
      if (header) {
        ctx.host.log.info("cookie header loaded from environment")
        return narrowCookieHeader(header)
      }
    }

    const fromConfig = pickFirstString([config.cookie, config.sessionCookie, config.session_cookie])
    if (fromConfig) {
      const header = parseCookieInput(fromConfig)
      if (header) {
        ctx.host.log.info("cookie header loaded from " + CONFIG_PATH)
        return narrowCookieHeader(header)
      }
    }

    return null
  }

  function authError() {
    return "MiMo login required. Copy fresh cookies from " + PLATFORM_URL + "."
  }

  function missingCredentialsError() {
    return (
      "Missing MiMo credentials. Copy your console cookies from " +
      PLATFORM_URL +
      " into `~/.ai-usage/config.json` under `mimo.cookie`."
    )
  }

  function requestJson(ctx, url, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: url,
        headers: {
          Accept: "application/json",
          Cookie: cookieHeader,
          "x-timezone": "UTC",
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request exception for " + url + ": " + String(e))
      throw "Request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) throw authError()
    if (resp.status < 200 || resp.status >= 300) {
      throw "MiMo usage request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const body = ctx.util.tryParseJson(resp.bodyText)
    if (!body || typeof body !== "object") {
      throw "Usage response invalid. Try again later."
    }

    // The console wraps payloads as { code: 0, message, data }. A non-zero code
    // is a business failure even when HTTP is 200.
    const code = readNumber(body.code)
    if (code !== null && code !== 0) {
      if (ctx.util.isAuthStatus(code)) throw authError()
      const message = readString(body.message)
      throw message
        ? "MiMo API error: " + message
        : "MiMo API error (code " + String(code) + ")."
    }

    return body.data && typeof body.data === "object" ? body.data : body
  }

  // The API reports a 0..1 fraction of the window consumed. Older payloads have
  // also been seen as 0..100, so accept either rather than double-counting.
  function toPercent(value) {
    const n = readNumber(value)
    if (n === null || n < 0) return null
    const percent = n <= 1 ? n * 100 : n
    return Math.round(Math.min(100, percent) * 10) / 10
  }

  function findUsageItem(items, name) {
    if (!Array.isArray(items)) return null
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (!item || typeof item !== "object") continue
      if (String(item.name || "") === name) return item
    }
    return null
  }

  function itemUsedLimit(item) {
    if (!item || typeof item !== "object") return { used: null, limit: null }
    return {
      used: readNumber(item.used),
      limit: readNumber(item.limit),
    }
  }

  function itemPercent(item, groupPercent) {
    const fromItem = toPercent(item && item.percent)
    if (fromItem !== null) return fromItem

    const counts = itemUsedLimit(item)
    if (counts.used !== null && counts.limit !== null && counts.limit > 0) {
      const computed = (counts.used / counts.limit) * 100
      if (Number.isFinite(computed)) {
        return Math.round(Math.max(0, Math.min(100, computed)) * 10) / 10
      }
    }

    return toPercent(groupPercent)
  }

  function formatTokens(count) {
    const n = readNumber(count)
    if (n === null) return null
    const abs = Math.abs(n)
    if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B"
    if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K"
    return String(Math.round(n))
  }

  function percentLine(ctx, label, item, groupPercent, resetsAt, periodDurationMs, gating) {
    const used = itemPercent(item, groupPercent)
    if (used === null) return null

    const opts = {
      label: label,
      used: used,
      limit: 100,
      format: { kind: "percent" },
    }
    if (resetsAt) opts.resetsAt = resetsAt
    if (typeof periodDurationMs === "number" && periodDurationMs > 0) {
      opts.periodDurationMs = periodDurationMs
    }
    return ctx.line.progress(opts)
  }

  function formatRenewal(ctx, detail, nowMs) {
    const endMs = ctx.util.parseDateMs(detail.currentPeriodEnd)
    if (endMs === null) return null

    const days = Math.ceil((endMs - nowMs) / DAY_MS)
    const autoRenew = readBoolean(detail.autoRenew)
    const verb = autoRenew === false ? "Ends" : "Renews"

    if (days <= 0) return verb === "Renews" ? "Renews today" : "Ends today"
    if (days === 1) return verb + " tomorrow"
    return verb + " in " + days + " days"
  }

  function readDetail(detail) {
    if (!detail || typeof detail !== "object") return null

    return {
      planName: pickFirstString([detail.planName, detail.plan_name, detail.name]),
      planCode: pickFirstString([detail.planCode, detail.plan_code, detail.code]),
      expired: readBoolean(detail.expired) === true,
      autoRenew: readBoolean(
        detail.enableAutoRenew !== undefined ? detail.enableAutoRenew : detail.autoRenew
      ),
      currentPeriodEnd:
        detail.currentPeriodEnd || detail.periodEnd || detail.endTime || detail.current_period_end || null,
    }
  }

  function planLabel(detail) {
    if (!detail) return null
    // planCode often carries a "name:cycle" pair; prefer the marketed name and
    // fall back to the code so an unnamed plan is still identified.
    return detail.planName || detail.planCode || null
  }

  function probe(ctx) {
    const config = loadConfig(ctx)
    const cookieHeader = loadCookieHeader(ctx, config)
    if (!cookieHeader) throw missingCredentialsError()

    const usageData = requestJson(ctx, USAGE_URL, cookieHeader)

    let detailData = null
    try {
      detailData = requestJson(ctx, DETAIL_URL, cookieHeader)
    } catch (e) {
      if (typeof e === "string" && e.indexOf("login required") !== -1) throw e
      ctx.host.log.warn("detail request failed: " + String(e))
    }

    const usageGroup = usageData.usage && typeof usageData.usage === "object" ? usageData.usage : {}
    const monthGroup =
      usageData.monthUsage && typeof usageData.monthUsage === "object"
        ? usageData.monthUsage
        : usageData.month_usage && typeof usageData.month_usage === "object"
          ? usageData.month_usage
          : {}

    const planItem = findUsageItem(usageGroup.items, "plan_total_token")
    const bonusItem = findUsageItem(usageGroup.items, "compensation_total_token")
    const monthItem =
      findUsageItem(monthGroup.items, "month_total_token") ||
      (Array.isArray(monthGroup.items) && monthGroup.items.length ? monthGroup.items[0] : null)

    const detail = readDetail(detailData)
    const nowMs = Date.now()
    const periodEndIso = detail ? ctx.util.toIso(detail.currentPeriodEnd) : null

    // An account with no subscription answers with empty item lists and zero
    // percents. That is distinct from a plan that simply has not been used.
    const monthPercent = toPercent(monthGroup.percent)
    const usagePercent = toPercent(usageGroup.percent)
    const hasPlanData =
      (Array.isArray(monthGroup.items) && monthGroup.items.length > 0) ||
      (Array.isArray(usageGroup.items) && usageGroup.items.length > 0) ||
      (monthPercent !== null && monthPercent > 0) ||
      (usagePercent !== null && usagePercent > 0) ||
      (detail && (detail.planName || detail.planCode))

    const lines = []

    if (detail && detail.expired) {
      lines.push(ctx.line.badge({ label: "Status", text: "Expired", color: "#ef4444" }))
    }

    if (!hasPlanData) {
      lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
      return { plan: planLabel(detail) || undefined, lines }
    }

    const monthLine = percentLine(
      ctx,
      "Monthly",
      monthItem,
      monthGroup.percent,
      null,
      MONTH_MS,
      true
    )
    if (monthLine) lines.push(monthLine)

    const planLine = percentLine(ctx, "Plan", planItem, usageGroup.percent, periodEndIso, null, false)
    if (planLine) lines.push(planLine)

    const bonusCounts = itemUsedLimit(bonusItem)
    const bonusHasData =
      bonusItem &&
      ((bonusCounts.limit !== null && bonusCounts.limit > 0) ||
        bonusCounts.used !== null ||
        readNumber(bonusItem.percent) !== null)
    if (bonusHasData) {
      const bonusLine = percentLine(ctx, "Bonus", bonusItem, null, periodEndIso, null, false)
      if (bonusLine) lines.push(bonusLine)
    }

    const planCounts = itemUsedLimit(planItem)
    if (planCounts.used !== null || planCounts.limit !== null) {
      const usedLabel = formatTokens(planCounts.used) || "0"
      const limitLabel = formatTokens(planCounts.limit)
      lines.push(
        ctx.line.text({
          label: "Tokens",
          value: limitLabel ? usedLabel + " / " + limitLabel : usedLabel,
        })
      )
    }

    // An expired subscription has no countdown worth showing beside its badge.
    const renewal = detail && !detail.expired ? formatRenewal(ctx, detail, nowMs) : null
    if (renewal) lines.push(ctx.line.text({ label: "Renewal", value: renewal }))

    if (lines.length === 0) {
      lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
    }

    return {
      plan: planLabel(detail) || undefined,
      lines,
    }
  }

  globalThis.__ai_usage_plugin = { id: "mimo", probe: probe }
})()
