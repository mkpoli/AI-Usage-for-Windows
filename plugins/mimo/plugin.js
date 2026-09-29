(function () {
  const CONFIG_PATH = "~/.ai-usage/config.json"
  const PLATFORM_URL = "https://platform.xiaomimimo.com"
  const USAGE_URL = PLATFORM_URL + "/api/v1/tokenPlan/usage"
  const DETAIL_URL = PLATFORM_URL + "/api/v1/tokenPlan/detail"
  // The console signs in through Xiaomi Passport under this service id. With the
  // account's passToken cookie, the login URL redirects straight to the console's
  // /sts callback, which issues a fresh api-platform_serviceToken.
  const SERVICE_LOGIN_URL = "https://account.xiaomi.com/pass/serviceLogin?sid=api-platform&_group=DEFAULT"
  const SERVICE_TOKEN_COOKIE = "api-platform_serviceToken"
  const ACCOUNT_SITE = "xiaomi.com"
  const PLATFORM_SITE = "xiaomimimo.com"
  const MAX_LOGIN_HOPS = 8

  const DAY_MS = 24 * 60 * 60 * 1000

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

  function loadCookieHeader(ctx, config) {
    const fromEnv = pickFirstString([
      readEnv(ctx, "MIMO_COOKIE"),
      readEnv(ctx, "MIMO_SESSION_COOKIE"),
    ])
    if (fromEnv) {
      const header = parseCookieInput(fromEnv)
      if (header) {
        ctx.host.log.info("cookie header loaded from environment")
        return header
      }
    }

    const fromConfig = pickFirstString([config.cookie, config.sessionCookie, config.session_cookie])
    if (fromConfig) {
      const header = parseCookieInput(fromConfig)
      if (header) {
        ctx.host.log.info("cookie header loaded from " + CONFIG_PATH)
        return header
      }
    }

    return null
  }

  // The account.xiaomi.com cookies carry the long-lived Passport login. Only
  // passToken and userId are needed; a missing userId is taken from the console
  // cookie, which carries the same account id.
  function loadAccountCookie(config, consoleHeader) {
    const raw = pickFirstString([config.accountCookie, config.account_cookie])
    const header = raw ? parseCookieInput(raw) : null
    if (!header) return null
    const jar = cookieJar(header)
    if (!jar.get("passToken")) return null
    if (!jar.get("userId") && consoleHeader) {
      const userId = cookieJar(consoleHeader).get("userId")
      if (userId) jar.set("userId", userId)
    }
    return jar.header()
  }

  function cookieJar(header) {
    const order = []
    const byName = {}
    const text = readString(header)
    if (text) {
      const segments = text.split(";")
      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i].trim()
        const eq = segment.indexOf("=")
        if (eq <= 0) continue
        const name = segment.slice(0, eq).trim()
        if (!Object.prototype.hasOwnProperty.call(byName, name)) order.push(name)
        byName[name] = segment.slice(eq + 1).trim()
      }
    }
    return {
      get: function (name) {
        return Object.prototype.hasOwnProperty.call(byName, name) ? byName[name] : null
      },
      set: function (name, value) {
        if (!Object.prototype.hasOwnProperty.call(byName, name)) order.push(name)
        byName[name] = value
      },
      remove: function (name) {
        if (!Object.prototype.hasOwnProperty.call(byName, name)) return
        delete byName[name]
        order.splice(order.indexOf(name), 1)
      },
      header: function () {
        return order
          .map(function (name) {
            return name + "=" + byName[name]
          })
          .join("; ")
      },
    }
  }

  // The host joins repeated set-cookie headers with newlines. An empty value or
  // a zero Max-Age clears the cookie.
  function applySetCookies(header, resp) {
    const headers = resp && resp.headers && typeof resp.headers === "object" ? resp.headers : {}
    const jar = cookieJar(header)
    const keys = Object.keys(headers)
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i].toLowerCase() !== "set-cookie") continue
      const lines = String(headers[keys[i]]).split(/[\r\n]+/)
      for (let j = 0; j < lines.length; j += 1) {
        const parts = lines[j].split(";")
        const eq = parts[0].indexOf("=")
        if (eq <= 0) continue
        const name = parts[0].slice(0, eq).trim()
        const value = parts[0].slice(eq + 1).trim()
        const expired = parts.slice(1).some(function (attr) {
          return /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(attr)
        })
        if (!value || expired || value === "EXPIRED") jar.remove(name)
        else jar.set(name, value)
      }
    }
    return jar.header()
  }

  function readHeader(resp, name) {
    const headers = resp && resp.headers && typeof resp.headers === "object" ? resp.headers : {}
    const keys = Object.keys(headers)
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i].toLowerCase() === name) return readString(String(headers[keys[i]]).split(/[\r\n]+/)[0])
    }
    return null
  }

  // Cookies go only to the site that set them, and only over https.
  function siteOf(url) {
    const match = String(url).match(/^https:\/\/([^/?#:]+)/i)
    if (!match) return null
    const host = match[1].toLowerCase()
    if (host === ACCOUNT_SITE || /\.xiaomi\.com$/.test(host)) return ACCOUNT_SITE
    if (host === PLATFORM_SITE || /\.xiaomimimo\.com$/.test(host)) return PLATFORM_SITE
    return null
  }

  function resolveLocation(location, base) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(location)) return location
    const origin = String(base).match(/^[a-z]+:\/\/[^/]+/i)
    if (!origin) return null
    if (location.charAt(0) === "/") return origin[0] + location
    return null
  }

  function accountLoginError() {
    return (
      "MiMo account login expired. Copy fresh account.xiaomi.com cookies into " +
      "`~/.ai-usage/config.json` under `mimo.accountCookie`."
    )
  }

  // Follows the Passport redirect chain by hand, keeping one cookie jar per site,
  // until the console has issued a new service token. The chain ends at the
  // console's followup URL, which is plain http, so the walk stops at the token.
  function refreshSession(ctx, session) {
    const jars = {}
    jars[ACCOUNT_SITE] = session.account
    jars[PLATFORM_SITE] = session.cookie || ""
    const previousToken = cookieJar(jars[PLATFORM_SITE]).get(SERVICE_TOKEN_COOKIE)

    let url = SERVICE_LOGIN_URL
    let issued = null
    for (let hop = 0; hop < MAX_LOGIN_HOPS && url; hop += 1) {
      const site = siteOf(url)
      if (!site) {
        ctx.host.log.warn("session refresh stopped at an unexpected redirect")
        break
      }

      const headers = { Accept: "text/html,application/xhtml+xml" }
      if (jars[site]) headers.Cookie = jars[site]
      let resp
      try {
        resp = ctx.util.request({ method: "GET", url: url, headers: headers, timeoutMs: 15000 })
      } catch (e) {
        ctx.host.log.error("session refresh request to " + site + " failed: " + String(e))
        throw "Request failed. Check your connection."
      }

      jars[site] = applySetCookies(jars[site], resp)
      const token = cookieJar(jars[PLATFORM_SITE]).get(SERVICE_TOKEN_COOKIE)
      if (token && token !== previousToken) {
        issued = token
        break
      }
      if (resp.status < 300 || resp.status >= 400) break
      const location = readHeader(resp, "location")
      url = location ? resolveLocation(location, url) : null
    }

    if (jars[ACCOUNT_SITE] && jars[ACCOUNT_SITE] !== session.account) {
      if (cookieJar(jars[ACCOUNT_SITE]).get("passToken")) session.account = jars[ACCOUNT_SITE]
    }
    if (!issued) {
      ctx.host.log.warn("session refresh did not issue a service token")
      throw accountLoginError()
    }

    ctx.host.log.info("console session refreshed from the account login")
    session.cookie = jars[PLATFORM_SITE]
    session.refreshed = true
  }

  // Refreshed sessions live in the plugin data dir, keyed to a fingerprint of
  // the configured credentials so that pasting new ones discards them.
  function authStorePath(ctx) {
    return ctx.app.pluginDataDir + "/auth.json"
  }

  function fingerprint(text) {
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
    }
    return (hash >>> 0).toString(16)
  }

  function loadStoredSession(ctx, sourceHash) {
    const path = authStorePath(ctx)
    try {
      if (!ctx.host.fs.exists(path)) return null
      const data = ctx.util.tryParseJson(ctx.host.fs.readText(path))
      if (!data || typeof data !== "object" || data.sourceHash !== sourceHash) return null
      return { cookie: readString(data.cookie), account: readString(data.accountCookie) }
    } catch (e) {
      ctx.host.log.warn("session store read failed: " + String(e))
      return null
    }
  }

  function saveStoredSession(ctx, session) {
    try {
      ctx.host.fs.writeText(
        authStorePath(ctx),
        JSON.stringify({
          cookie: session.cookie,
          accountCookie: session.account,
          sourceHash: session.sourceHash,
          updatedAt: ctx.nowIso,
        })
      )
    } catch (e) {
      ctx.host.log.warn("session store write failed: " + String(e))
    }
  }

  function authError(session) {
    if (session.account) return accountLoginError()
    return "MiMo login required. Copy fresh cookies from " + PLATFORM_URL + "."
  }

  function missingCredentialsError() {
    return (
      "Missing MiMo credentials. Copy your console cookies from " +
      PLATFORM_URL +
      " into `~/.ai-usage/config.json` under `mimo.cookie`."
    )
  }

  function sendRequest(ctx, url, session) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: url,
        headers: {
          Accept: "application/json",
          Cookie: session.cookie,
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request exception for " + url + ": " + String(e))
      throw "Request failed. Check your connection."
    }
    session.cookie = applySetCookies(session.cookie, resp)

    const body = resp.status >= 200 && resp.status < 300 ? ctx.util.tryParseJson(resp.bodyText) : null
    const code = body && typeof body === "object" ? readNumber(body.code) : null
    const loggedOut = ctx.util.isAuthStatus(resp.status) || (code !== null && ctx.util.isAuthStatus(code))
    return { resp: resp, body: body, code: code, loggedOut: loggedOut }
  }

  // A signed-out answer triggers one refresh from the account login, when one
  // is configured, and a single retry.
  function requestJson(ctx, url, session) {
    let result = sendRequest(ctx, url, session)
    if (result.loggedOut && session.account && !session.refreshed) {
      refreshSession(ctx, session)
      result = sendRequest(ctx, url, session)
    }

    const resp = result.resp
    if (result.loggedOut) throw authError(session)
    if (resp.status < 200 || resp.status >= 300) {
      throw "MiMo request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const body = result.body
    if (!body || typeof body !== "object") {
      throw "Usage response invalid. Try again later."
    }

    // The console wraps payloads as { code: 0, message, data }. A non-zero code
    // is a business failure even when HTTP is 200.
    const code = result.code
    if (code !== null && code !== 0) {
      const message = readString(body.message)
      throw message
        ? "MiMo API error: " + message
        : "MiMo API error (code " + String(code) + ")."
    }

    return body.data && typeof body.data === "object" ? body.data : body
  }

  function openSession(ctx, config) {
    const consoleHeader = loadCookieHeader(ctx, config)
    const accountHeader = loadAccountCookie(config, consoleHeader)
    if (!consoleHeader && !accountHeader) throw missingCredentialsError()

    const sourceHash = fingerprint((consoleHeader || "") + "\n" + (accountHeader || ""))
    const stored = loadStoredSession(ctx, sourceHash)
    const session = {
      cookie: (stored && stored.cookie) || consoleHeader,
      account: (stored && stored.account) || accountHeader,
      sourceHash: sourceHash,
      refreshed: false,
    }
    session.saved = { cookie: session.cookie, account: session.account }
    if (!session.cookie) refreshSession(ctx, session)
    return session
  }

  function persistSession(ctx, session) {
    if (session.cookie === session.saved.cookie && session.account === session.saved.account) return
    saveStoredSession(ctx, session)
    session.saved = { cookie: session.cookie, account: session.account }
  }

  // The console reports a 0..1 fraction of the window consumed.
  function toPercent(value) {
    const n = readNumber(value)
    if (n === null || n < 0) return null
    return Math.round(Math.min(100, n * 100) * 10) / 10
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

  // Counts first: used/limit has no scale ambiguity. A group percent is the
  // aggregate across every item in the group, so it is only safe as a fallback
  // for a group with a single bucket.
  function itemPercent(item, groupPercent) {
    const counts = itemUsedLimit(item)
    if (counts.used !== null && counts.limit !== null && counts.limit > 0) {
      const computed = (counts.used / counts.limit) * 100
      if (Number.isFinite(computed)) {
        return Math.round(Math.max(0, Math.min(100, computed)) * 10) / 10
      }
    }

    const fromItem = toPercent(item && item.percent)
    if (fromItem !== null) return fromItem

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

  function percentLine(ctx, label, item, groupPercent, resetsAt) {
    const used = itemPercent(item, groupPercent)
    if (used === null) return null

    const opts = {
      label: label,
      used: used,
      limit: 100,
      format: { kind: "percent" },
    }
    // A countdown without a known reset would invent one, and a pace needs both
    // a reset and a period length. Neither is available for the monthly window.
    if (resetsAt) opts.resetsAt = resetsAt
    return ctx.line.progress(opts)
  }

  function formatRenewal(ctx, detail, nowMs) {
    const endMs = ctx.util.parseDateMs(detail.currentPeriodEnd)
    if (endMs === null) return null

    const days = Math.ceil((endMs - nowMs) / DAY_MS)
    const autoRenew = readBoolean(detail.autoRenew)
    const verb = autoRenew === false ? "Ends" : "Renews"

    if (days < 0) {
      const ago = -days
      const unit = ago === 1 ? " day ago" : " days ago"
      return (verb === "Renews" ? "Renewed " : "Ended ") + ago + unit
    }
    if (days === 0) return verb === "Renews" ? "Renews today" : "Ends today"
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
    const session = openSession(ctx, config)

    let usageData
    try {
      usageData = requestJson(ctx, USAGE_URL, session)
    } finally {
      persistSession(ctx, session)
    }

    let detailData = null
    try {
      detailData = requestJson(ctx, DETAIL_URL, session)
    } catch (e) {
      if (typeof e === "string" && /login (required|expired)/.test(e)) throw e
      ctx.host.log.warn("detail request failed: " + String(e))
    } finally {
      persistSession(ctx, session)
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
    // Named lookup only. The console owns this bucket; a fallback to whatever
    // happens to sit first would mislabel a future sibling.
    const monthItem = findUsageItem(monthGroup.items, "month_total_token")

    const detail = readDetail(detailData)
    const nowMs = Date.now()
    const periodEndIso = detail ? ctx.util.toIso(detail.currentPeriodEnd) : null

    // An account with no subscription answers with empty item lists and zero
    // percents. That is distinct from a plan that simply has not been used.
    const monthPercent = toPercent(monthGroup.percent)
    const usagePercent = toPercent(usageGroup.percent)
    const hasUsageData =
      planItem !== null ||
      monthItem !== null ||
      (Array.isArray(usageGroup.items) && usageGroup.items.length > 0) ||
      (Array.isArray(monthGroup.items) && monthGroup.items.length > 0) ||
      (monthPercent !== null && monthPercent > 0) ||
      (usagePercent !== null && usagePercent > 0)

    const lines = []

    if (!hasUsageData) {
      // One status only: an expired empty account reads as expired.
      if (detail && detail.expired) {
        lines.push(ctx.line.badge({ label: "Status", text: "Expired", color: "#ef4444" }))
      } else {
        lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
      }
      return { plan: planLabel(detail) || undefined, lines }
    }

    if (detail && detail.expired) {
      lines.push(ctx.line.badge({ label: "Status", text: "Expired", color: "#ef4444" }))
    }

    // The monthly bar is keyed on month_total_token by name. The group percent
    // is only a safe fallback when that group holds a single bucket, so a
    // sibling item is never folded into the monthly window.
    const monthGroupPercent =
      Array.isArray(monthGroup.items) && monthGroup.items.length === 1 ? monthGroup.percent : null
    const monthLine = monthItem ? percentLine(ctx, "Monthly", monthItem, monthGroupPercent, null) : null
    if (monthLine) lines.push(monthLine)

    // usage.percent mixes plan and compensation, so it is not a Plan reading.
    const planLine = percentLine(ctx, "Plan", planItem, null, periodEndIso)
    if (planLine) lines.push(planLine)

    // Compensation is a separate grant with no reset the console publishes, so
    // it carries no countdown. A zero-size grant draws no bar.
    const bonusCounts = itemUsedLimit(bonusItem)
    const bonusPercent = toPercent(bonusItem && bonusItem.percent)
    const bonusHasGrant =
      bonusItem &&
      ((bonusCounts.limit !== null && bonusCounts.limit > 0) ||
        (bonusCounts.used !== null && bonusCounts.used > 0) ||
        (bonusPercent !== null && bonusPercent > 0))
    if (bonusHasGrant) {
      const bonusLine = percentLine(ctx, "Bonus", bonusItem, null, null)
      if (bonusLine) lines.push(bonusLine)
    }

    const planCounts = itemUsedLimit(planItem)
    const planLimitLabel =
      planCounts.limit !== null && planCounts.limit > 0 ? formatTokens(planCounts.limit) : null
    const planUsedLabel = planCounts.used !== null ? formatTokens(planCounts.used) : null
    if (planUsedLabel || planLimitLabel) {
      let value
      if (planUsedLabel && planLimitLabel) value = planUsedLabel + " / " + planLimitLabel
      else if (planUsedLabel) value = planUsedLabel
      else value = "? / " + planLimitLabel
      lines.push(ctx.line.text({ label: "Tokens", value: value }))
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
