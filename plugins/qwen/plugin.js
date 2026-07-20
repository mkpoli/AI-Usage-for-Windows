(function () {
  const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
  const DAY_MS = 24 * 60 * 60 * 1000
  const WEEK_MS = 7 * DAY_MS
  const MONTH_MS = 30 * DAY_MS

  const CONFIG_PATH = "~/.ai-usage/config.json"
  const GATEWAY_PRODUCT = "sfm_bailian"
  const GATEWAY_PATH = "/data/api.json"

  const TOKEN_PLAN_USAGE_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage"
  const TOKEN_PLAN_SUBSCRIPTION_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription"
  const TOKEN_PLAN_QUOTA_API = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/quota-config"
  const CODING_PLAN_API = "zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2"

  // Qwen Cloud runs one deployment per region. The console and the data gateway
  // are separate hosts, and each region has its own gateway action and site tag.
  const REGIONS = {
    intl: {
      console: "https://home.qwencloud.com",
      api: "https://cs-data.qwencloud.com",
      action: "IntlBroadScopeAspnGateway",
      region: "ap-southeast-1",
      consoleSite: "QWENCLOUD",
      lang: "en-US",
      codingCommodity: "sfm_codingplan_public_intl",
    },
    cn: {
      console: "https://platform-home.qianwenai.com",
      api: "https://cs-data.qianwenai.com",
      action: "BroadScopeAspnGateway",
      region: "cn-beijing",
      consoleSite: "QIANWENAI",
      lang: "zh-CN",
      codingCommodity: "sfm_codingplan_public_cn",
    },
  }

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
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
      return config.qwen && typeof config.qwen === "object" ? config.qwen : {}
    } catch (e) {
      ctx.host.log.warn("config read failed: " + String(e))
      return {}
    }
  }

  // Accepts a full "Cookie: a=b; c=d" header, bare "a=b; c=d" pairs across one or
  // many lines, or a DevTools Cookies table paste (name <TAB> value <TAB> ...).
  // Every pair is kept: the console session spans several cookies and no single
  // one authenticates the gateway on its own.
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
    const fromEnv = pickFirstString([readEnv(ctx, "QWEN_COOKIE"), readEnv(ctx, "QWEN_SESSION_COOKIE")])
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

  function resolveRegion(ctx, config) {
    const raw = pickFirstString([readEnv(ctx, "QWEN_REGION"), config.region])
    if (!raw) return REGIONS.intl

    const normalized = raw.toLowerCase()
    if (normalized === "cn" || normalized === "china" || normalized === "cn-beijing") return REGIONS.cn
    if (normalized === "intl" || normalized === "international" || normalized === "ap-southeast-1") {
      return REGIONS.intl
    }
    throw "Unknown Qwen region `" + raw + "`. Use `intl` or `cn`."
  }

  function authError(endpoint) {
    return "Qwen login required. Copy fresh console cookies from " + endpoint.console + " into `~/.ai-usage/config.json`."
  }

  function encodeForm(fields) {
    const parts = []
    const names = Object.keys(fields)
    for (let i = 0; i < names.length; i += 1) {
      const value = fields[names[i]]
      if (value === null || value === undefined) continue
      parts.push(encodeURIComponent(names[i]) + "=" + encodeURIComponent(String(value)))
    }
    return parts.join("&")
  }

  // The gateway rejects calls without the console's CSRF token. It is rendered
  // into the console page as `ALIYUN_CONSOLE_CONFIG.SEC_TOKEN`, so it is read
  // back from there using the same session cookies.
  function fetchSecToken(ctx, endpoint, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: endpoint.console + "/billing/coding-plan",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Cookie: cookieHeader,
        },
        timeoutMs: 20000,
      })
    } catch (e) {
      ctx.host.log.error("console request exception: " + String(e))
      throw "Request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) throw authError(endpoint)
    if (resp.status < 200 || resp.status >= 300) {
      throw "Qwen console request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const match = String(resp.bodyText || "").match(/SEC_TOKEN\s*:\s*["']([^"']+)["']/)
    if (!match) throw authError(endpoint)
    return match[1]
  }

  function callGateway(ctx, endpoint, cookieHeader, secToken, api, data) {
    const params = {
      Api: api,
      Data: Object.assign({}, data, {
        cornerstoneParam: {
          domain: endpoint.console.replace(/^https?:\/\//, ""),
          consoleSite: endpoint.consoleSite,
          console: "ONE_CONSOLE",
          xsp_lang: endpoint.lang,
          protocol: "V2",
          productCode: "p_efm",
        },
      }),
      V: "1.0",
    }

    let resp
    try {
      resp = ctx.util.request({
        method: "POST",
        url:
          endpoint.api +
          GATEWAY_PATH +
          "?product=" +
          encodeURIComponent(GATEWAY_PRODUCT) +
          "&action=" +
          encodeURIComponent(endpoint.action),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Cookie: cookieHeader,
          Referer: endpoint.console + "/billing/coding-plan",
        },
        bodyText: encodeForm({
          product: GATEWAY_PRODUCT,
          action: endpoint.action,
          region: endpoint.region,
          sec_token: secToken,
          params: JSON.stringify(params),
        }),
        timeoutMs: 20000,
      })
    } catch (e) {
      ctx.host.log.error("gateway request exception: " + String(e))
      throw "Request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) throw authError(endpoint)
    if (resp.status < 200 || resp.status >= 300) {
      throw "Qwen usage request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    return unwrapEnvelope(ctx, resp.bodyText, endpoint)
  }

  // The gateway nests the business payload several layers deep and the depth
  // differs per API, so unwrap by walking known wrapper keys.
  function unwrapEnvelope(ctx, bodyText, endpoint) {
    const body = ctx.util.tryParseJson(bodyText)
    if (!body || typeof body !== "object") throw "Could not parse usage data."

    if (body.successResponse !== true && String(body.code) !== "200") {
      if (ctx.util.isAuthStatus(Number(body.code))) throw authError(endpoint)
      throw "Qwen usage request was rejected. Try again later."
    }

    let node = body
    for (let depth = 0; depth < 6; depth += 1) {
      if (!node || typeof node !== "object") break
      if (node.success === false) return null
      if (node.DataV2 && typeof node.DataV2 === "object") {
        node = node.DataV2
        continue
      }
      if (node.data && typeof node.data === "object") {
        node = node.data
        continue
      }
      break
    }
    return node && typeof node === "object" ? node : null
  }

  function safeCall(ctx, endpoint, cookieHeader, secToken, api, data) {
    try {
      return callGateway(ctx, endpoint, cookieHeader, secToken, api, data)
    } catch (e) {
      if (typeof e === "string" && e.indexOf("login required") !== -1) throw e
      ctx.host.log.warn("call failed for " + api + ": " + String(e))
      return null
    }
  }

  function toPercent(fraction) {
    const value = readNumber(fraction)
    if (value === null || value < 0) return null
    // The API reports a 0..1 fraction of the window consumed.
    const percent = value <= 1 ? value * 100 : value
    return Math.round(Math.min(100, percent) * 10) / 10
  }

  function addPercentLine(lines, ctx, label, fraction, resetMs, periodDurationMs) {
    const used = toPercent(fraction)
    if (used === null) return false
    const opts = { label, used, limit: 100, format: { kind: "percent" }, periodDurationMs }
    const resetsAt = ctx.util.toIso(resetMs)
    if (resetsAt) opts.resetsAt = resetsAt
    lines.push(ctx.line.progress(opts))
    return true
  }

  function titleCase(value) {
    const text = readString(value)
    if (!text) return null
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  function formatRenewal(ctx, sub, nowMs) {
    const endMs = ctx.util.parseDateMs(sub.endTime)
    const days = endMs === null ? readNumber(sub.remainingDays) : Math.ceil((endMs - nowMs) / DAY_MS)
    if (days === null) return null

    const verb = sub.autoRenewFlag ? "Renews" : "Ends"
    if (days <= 0) return verb === "Renews" ? "Renews today" : "Ends today"
    if (days === 1) return verb + " tomorrow"
    return verb + " in " + days + " days"
  }

  function buildTokenPlan(ctx, endpoint, cookieHeader, secToken) {
    const usage = safeCall(ctx, endpoint, cookieHeader, secToken, TOKEN_PLAN_USAGE_API, {})
    if (!usage) return null

    const hasWindow =
      readNumber(usage.per5HourPercentage) !== null || readNumber(usage.per1WeekPercentage) !== null
    if (!hasWindow) return null

    const sub = safeCall(ctx, endpoint, cookieHeader, secToken, TOKEN_PLAN_SUBSCRIPTION_API, {}) || {}
    const quotas = safeCall(ctx, endpoint, cookieHeader, secToken, TOKEN_PLAN_QUOTA_API, {}) || {}

    const lines = []
    addPercentLine(lines, ctx, "5-hour", usage.per5HourPercentage, usage.per5HourResetTime, FIVE_HOUR_MS)
    addPercentLine(lines, ctx, "Weekly", usage.per1WeekPercentage, usage.per1WeekResetTime, WEEK_MS)

    const spec = readString(sub.specCode)
    const specQuota = spec && quotas[spec] && typeof quotas[spec] === "object" ? quotas[spec] : null
    if (specQuota) {
      const fiveHour = readNumber(specQuota.five_hour)
      const weekly = readNumber(specQuota.weekly)
      const parts = []
      if (fiveHour !== null) parts.push(fiveHour + " / 5h")
      if (weekly !== null) parts.push(weekly + " / week")
      if (parts.length) lines.push(ctx.line.text({ label: "Allowance", value: parts.join(" · ") }))
    }

    if (readString(sub.status) && String(sub.status).toUpperCase() !== "VALID") {
      lines.unshift(ctx.line.badge({ label: "Status", text: "Expired", color: "#ef4444" }))
    }

    const renewal = formatRenewal(ctx, sub, Date.now())
    if (renewal) lines.push(ctx.line.text({ label: "Renewal", value: renewal }))

    const planParts = ["Token Plan"]
    const specLabel = titleCase(spec)
    if (specLabel) planParts.push(specLabel)
    return { plan: planParts.join(" "), lines }
  }

  function buildCodingPlan(ctx, endpoint, cookieHeader, secToken) {
    const payload = safeCall(ctx, endpoint, cookieHeader, secToken, CODING_PLAN_API, {
      queryCodingPlanInstanceInfoRequest: {
        commodityCode: endpoint.codingCommodity,
        onlyLatestOne: true,
      },
    })

    const instances =
      payload && Array.isArray(payload.codingPlanInstanceInfos) ? payload.codingPlanInstanceInfos : []
    if (!instances.length) return null

    const instance = instances[0]
    const quota =
      instance.codingPlanQuotaInfo && typeof instance.codingPlanQuotaInfo === "object"
        ? instance.codingPlanQuotaInfo
        : {}

    const lines = []
    addCountLine(lines, ctx, "5-hour", quota, "per5Hour", FIVE_HOUR_MS)
    addCountLine(lines, ctx, "Weekly", quota, "perWeek", WEEK_MS)
    addCountLine(lines, ctx, "Monthly", quota, "perBillMonth", MONTH_MS)

    if (readString(instance.status) && String(instance.status).toUpperCase() !== "VALID") {
      lines.unshift(ctx.line.badge({ label: "Status", text: "Expired", color: "#ef4444" }))
    }

    const renewal = formatRenewal(ctx, {
      endTime: instance.instanceEndTime,
      remainingDays: instance.remainingDays,
      autoRenewFlag: instance.autoRenewFlag,
    }, Date.now())
    if (renewal) lines.push(ctx.line.text({ label: "Renewal", value: renewal }))

    const name = readString(instance.instanceName)
    const amount = readNumber(instance.chargeAmount)
    const plan = name ? (amount !== null && amount > 0 ? name + " " + String(amount) : name) : null
    return { plan: plan || "Coding Plan", lines }
  }

  function addCountLine(lines, ctx, label, quota, prefix, periodDurationMs) {
    const limit = readNumber(quota[prefix + "TotalQuota"])
    const used = readNumber(quota[prefix + "UsedQuota"])
    if (limit === null || used === null || limit <= 0) return

    const opts = {
      label,
      used: Math.max(0, used),
      limit,
      format: { kind: "count", suffix: "requests" },
      periodDurationMs,
    }
    const resetsAt = ctx.util.toIso(quota[prefix + "QuotaNextRefreshTime"])
    if (resetsAt) opts.resetsAt = resetsAt
    lines.push(ctx.line.progress(opts))
  }

  function probe(ctx) {
    const config = loadConfig(ctx)
    const endpoint = resolveRegion(ctx, config)

    const cookieHeader = loadCookieHeader(ctx, config)
    if (!cookieHeader) {
      throw (
        "Missing Qwen credentials. Copy your console cookies from " +
        endpoint.console +
        " into `~/.ai-usage/config.json` under `qwen.cookie`."
      )
    }

    const secToken = readString(config.secToken) || fetchSecToken(ctx, endpoint, cookieHeader)

    const result =
      buildTokenPlan(ctx, endpoint, cookieHeader, secToken) ||
      buildCodingPlan(ctx, endpoint, cookieHeader, secToken)

    if (!result) {
      return {
        lines: [ctx.line.badge({ label: "Status", text: "No active plan", color: "#a3a3a3" })],
      }
    }

    if (!result.lines.length) {
      result.lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
    }

    return { plan: result.plan || undefined, lines: result.lines }
  }

  globalThis.__ai_usage_plugin = { id: "qwen", probe: probe }
})()
