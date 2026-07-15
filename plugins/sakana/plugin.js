(function () {
  const BILLING_URL = "https://console.sakana.ai/billing"
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  function loadCookieHeader(ctx) {
    let value = null
    try {
      value = ctx.host.env.get("SAKANA_COOKIE")
    } catch (e) {
      ctx.host.log.warn("SAKANA_COOKIE read failed: " + String(e))
    }

    const cookie = normalizeCookieHeader(value)
    if (!cookie) return null
    ctx.host.log.info("cookie header loaded from SAKANA_COOKIE")
    return cookie
  }

  function normalizeCookieHeader(value) {
    const raw = readString(value)
    if (!raw) return null

    const lines = raw
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter(Boolean)

    let cookie = ""
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const match = line.match(/^cookie\s*:\s*(.+)$/i)
      if (match) {
        cookie = match[1].trim()
        break
      }
      if (!/:\s*/.test(line)) {
        cookie = line
        break
      }
    }

    if (!cookie) return null
    return cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("; ")
  }

  function fetchBilling(ctx, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: BILLING_URL,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          Cookie: cookieHeader,
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("billing request exception: " + String(e))
      throw "Request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status) || (resp.status >= 300 && resp.status < 400)) {
      throw "Sakana login required. Update SAKANA_COOKIE from console.sakana.ai."
    }
    if (resp.status !== 200) {
      throw "Sakana billing fetch failed (HTTP " + resp.status + "). Try again later."
    }
    if (!readString(resp.bodyText)) {
      throw "Could not parse usage data."
    }

    return resp.bodyText
  }

  function stripHtmlComments(text) {
    return String(text || "")
      .replace(/<!--.*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function firstMatch(pattern, text, flags) {
    try {
      return new RegExp(pattern, flags || "i").exec(text)
    } catch (e) {
      return null
    }
  }

  function capture(pattern, text, flags) {
    const match = firstMatch(pattern, text, flags)
    if (!match) return null
    return match[1] === undefined ? null : stripHtmlComments(match[1])
  }

  function windowBoundaryOffset(html, offset) {
    const boundary = /<p[^>]*>\s*(?:5-hour|Weekly)\s*<\/p>|<div[^>]*data-slot=(?:"card"|'card'|"card-title"|'card-title')[^>]*>/gi
    boundary.lastIndex = offset
    const match = boundary.exec(html)
    return match ? match.index : html.length
  }

  function windowBody(label, html) {
    const labelPattern = "<p[^>]*>\\s*" + escapeRegex(label) + "\\s*<\\/p>"
    const match = firstMatch(labelPattern, html, "i")
    if (!match) return null
    const start = match.index + match[0].length
    const end = windowBoundaryOffset(html, start)
    const body = html.slice(start, end).trim()
    return body || null
  }

  function parseResetDate(text) {
    const raw = readString(text)
    if (!raw) return null

    const match = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (!match) return null

    const months = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    }
    const month = months[match[1].toLowerCase()]
    if (month === undefined) return null

    let hour = Number(match[4])
    const minute = Number(match[5])
    const ampm = match[6].toUpperCase()
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    if (ampm === "AM" && hour === 12) hour = 0
    if (ampm === "PM" && hour !== 12) hour += 12

    const ms = Date.UTC(Number(match[3]), month, Number(match[2]), hour, minute, 0, 0)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }

  function parseWindow(label, html) {
    const body = windowBody(label, html)
    if (!body) return null

    const percentText = capture("<p[^>]*>\\s*([0-9]+(?:\\.[0-9]+)?)% used\\s*<\\/p>", body, "i")
    const percent = percentText === null ? NaN : Number(percentText)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw "Invalid " + label + " usage percentage."
    }

    const resetText = capture("<p[^>]*>\\s*Resets on ([^<]+?)\\s*<\\/p>", body, "i")
    return {
      used: percent,
      resetsAt: parseResetDate(resetText),
    }
  }

  function parsePlanName(html) {
    return capture("<div[^>]*data-slot=\\\"card-title\\\"[^>]*>[\\s\\S]*?<span>\\s*([^<]+?)\\s*<\\/span>", html, "i")
  }

  function parsePlanPrice(html) {
    return capture(
      "<div[^>]*data-slot=\\\"card-title\\\"[^>]*>[\\s\\S]*?<span>[^<]+<\\/span>\\s*<span[^>]*>\\s*([^<]+?)\\s*<\\/span>",
      html,
      "i",
    )
  }

  function parseBillingHTML(html) {
    const fiveHour = parseWindow("5-hour", html)
    const weekly = parseWindow("Weekly", html)
    if (!fiveHour && !weekly) {
      throw "Usage limit windows were not found."
    }

    const planParts = []
    const planName = parsePlanName(html)
    const planPrice = parsePlanPrice(html)
    if (planName) planParts.push(planName)
    if (planPrice) planParts.push(planPrice)

    return {
      plan: planParts.length ? planParts.join(" ") : null,
      fiveHour,
      weekly,
    }
  }

  function addProgress(lines, ctx, label, window, periodDurationMs) {
    if (!window) return
    const opts = {
      label,
      used: window.used,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs,
    }
    if (window.resetsAt) opts.resetsAt = window.resetsAt
    lines.push(ctx.line.progress(opts))
  }

  function probe(ctx) {
    const cookieHeader = loadCookieHeader(ctx)
    if (!cookieHeader) {
      throw "Missing SAKANA_COOKIE. Copy the Cookie header from console.sakana.ai/billing after signing in."
    }

    let parsed
    try {
      parsed = parseBillingHTML(fetchBilling(ctx, cookieHeader))
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("billing parse failed: " + String(e))
      throw "Could not parse usage data."
    }

    const lines = []
    addProgress(lines, ctx, "5-hour", parsed.fiveHour, FIVE_HOUR_MS)
    addProgress(lines, ctx, "Weekly", parsed.weekly, WEEK_MS)

    return { plan: parsed.plan, lines }
  }

  globalThis.__ai_usage_plugin = { id: "sakana", probe: probe }
})()
