import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__ai_usage_plugin
}

const NOW = Date.parse("2026-07-20T00:00:00.000Z")
const CONSOLE_HTML = `<script>ALIYUN_CONSOLE_CONFIG = { CHANNEL: 'OFFICIAL', SEC_TOKEN: "tok123" };</script>`

// Shapes below mirror live gateway responses: the payload sits under
// data.DataV2.data.data for these APIs.
const envelope = (payload) =>
  JSON.stringify({
    code: "200",
    successResponse: true,
    data: {
      DataV2: { ret: ["SUCCESS"], data: { code: "SUCCESS", success: true, data: payload } },
      success: true,
    },
  })

const USAGE = {
  per5HourPercentage: 0.17865556533333332,
  per5HourResetTime: 1784559600000,
  per1WeekPercentage: 0.1508334424,
  per1WeekResetTime: 1785103440000,
}

const SUBSCRIPTION = {
  instanceCode: "sfm_tokenplansolo_public_cn-abc",
  specCode: "standard",
  remainingDays: 31,
  endTime: NOW + 31 * 24 * 60 * 60 * 1000,
  autoRenewFlag: false,
  status: "VALID",
}

const QUOTA_CONFIG = {
  standard: { five_hour: 3000, weekly: 10000 },
  lite: { five_hour: 700, weekly: 2500 },
  pro: { five_hour: 12000, weekly: 40000 },
}

const CODING_INSTANCE = {
  instanceName: "Pro",
  status: "VALID",
  chargeAmount: 39,
  autoRenewFlag: true,
  remainingDays: 28,
  instanceEndTime: NOW + 28 * 24 * 60 * 60 * 1000,
  codingPlanQuotaInfo: {
    per5HourTotalQuota: 6000,
    per5HourUsedQuota: 1500,
    per5HourQuotaNextRefreshTime: NOW + 2 * 60 * 60 * 1000,
    perWeekTotalQuota: 45000,
    perWeekUsedQuota: 9000,
    perWeekQuotaNextRefreshTime: NOW + 3 * 24 * 60 * 60 * 1000,
    perBillMonthTotalQuota: 90000,
    perBillMonthUsedQuota: 45000,
    perBillMonthQuotaNextRefreshTime: NOW + 12 * 24 * 60 * 60 * 1000,
  },
}

function mockCookie(ctx, value = "login_qianwenai_ticket=abc; cna=def") {
  ctx.host.env.get.mockImplementation((name) => (name === "QWEN_COOKIE" ? value : null))
}

function mockGateway(ctx, { usage = USAGE, subscription = SUBSCRIPTION, quota = QUOTA_CONFIG, coding = [] } = {}) {
  ctx.host.http.request.mockImplementation((opts) => {
    const url = String(opts.url)
    if (url.indexOf("/billing/coding-plan") !== -1 && (opts.method || "GET") === "GET") {
      return { status: 200, headers: {}, bodyText: CONSOLE_HTML }
    }
    const body = String(opts.bodyText || "")
    if (body.indexOf("v2%2Fusage") !== -1 || body.indexOf("v2/usage") !== -1) {
      return { status: 200, headers: {}, bodyText: envelope(usage) }
    }
    if (body.indexOf("subscription") !== -1) {
      return { status: 200, headers: {}, bodyText: envelope(subscription) }
    }
    if (body.indexOf("quota-config") !== -1) {
      return { status: 200, headers: {}, bodyText: envelope(quota) }
    }
    if (body.indexOf("codingPlan") !== -1) {
      return { status: 200, headers: {}, bodyText: envelope({ codingPlanInstanceInfos: coding }) }
    }
    return { status: 200, headers: {}, bodyText: envelope({}) }
  })
}

const gatewayPosts = (ctx) =>
  ctx.host.http.request.mock.calls.map((c) => c[0]).filter((o) => String(o.url).indexOf("/data/api.json") !== -1)

describe("qwen plugin", () => {
  beforeEach(() => {
    delete globalThis.__ai_usage_plugin
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("throws when credentials are missing", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Missing Qwen credentials")
  })

  it("renders token plan windows as percentages", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Token Plan Standard")
    expect(result.lines.find((l) => l.label === "5-hour")).toMatchObject({
      type: "progress",
      used: 17.9,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: 5 * 60 * 60 * 1000,
      resetsAt: new Date(USAGE.per5HourResetTime).toISOString(),
    })
    expect(result.lines.find((l) => l.label === "Weekly")).toMatchObject({
      used: 15.1,
      limit: 100,
      periodDurationMs: 7 * 24 * 60 * 60 * 1000,
    })
  })

  it("shows the allowance for the subscribed spec", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((l) => l.label === "Allowance")).toEqual({
      type: "text",
      label: "Allowance",
      value: "3000 / 5h · 10000 / week",
    })
  })

  it("says Ends when auto renew is off", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Renewal").value).toBe("Ends in 31 days")
  })

  it("says Renews when auto renew is on", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx, { subscription: { ...SUBSCRIPTION, autoRenewFlag: true } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Renewal").value).toBe("Renews in 31 days")
  })

  it("flags an expired subscription", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx, { subscription: { ...SUBSCRIPTION, status: "INVALID" } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines[0]).toMatchObject({ type: "badge", label: "Status", text: "Expired" })
  })

  it("falls back to the coding plan when there is no token plan", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx, { usage: {}, coding: [CODING_INSTANCE] })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro 39")
    expect(result.lines.find((l) => l.label === "5-hour")).toMatchObject({
      used: 1500,
      limit: 6000,
      format: { kind: "count", suffix: "requests" },
    })
    expect(result.lines.find((l) => l.label === "Monthly")).toMatchObject({ used: 45000, limit: 90000 })
  })

  it("reports when the account has no plan at all", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx, { usage: {}, coding: [] })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines).toEqual([
      { type: "badge", label: "Status", text: "No active plan", color: "#a3a3a3" },
    ])
  })

  it("targets the international gateway by default", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const post = gatewayPosts(ctx)[0]
    expect(post.url).toContain("https://cs-data.qwencloud.com/data/api.json")
    expect(post.url).toContain("action=IntlBroadScopeAspnGateway")
    expect(post.bodyText).toContain("region=ap-southeast-1")
    expect(post.bodyText).toContain("sec_token=tok123")
    expect(decodeURIComponent(post.bodyText)).toContain("\"consoleSite\":\"QWENCLOUD\"")
    expect(decodeURIComponent(post.bodyText)).toContain("\"V\":\"1.0\"")
  })

  it("targets the China gateway when the region is cn", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "QWEN_COOKIE") return "login_qianwenai_ticket=abc"
      if (name === "QWEN_REGION") return "cn"
      return null
    })
    mockGateway(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const post = gatewayPosts(ctx)[0]
    expect(post.url).toContain("https://cs-data.qianwenai.com/data/api.json")
    expect(post.url).toContain("action=BroadScopeAspnGateway")
    expect(post.bodyText).toContain("region=cn-beijing")
    expect(decodeURIComponent(post.bodyText)).toContain("\"consoleSite\":\"QIANWENAI\"")
  })

  it("reads the CSRF token from the console page", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockGateway(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const pageGets = ctx.host.http.request.mock.calls
      .map((c) => c[0])
      .filter((o) => String(o.url).indexOf("/billing/coding-plan") !== -1)
    expect(pageGets.length).toBe(1)
    expect(pageGets[0].headers.Cookie).toBe("login_qianwenai_ticket=abc; cna=def")
  })

  it("skips the console fetch when a token is configured", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({ qwen: { cookie: "a=b", secToken: "preset" } }),
    )
    mockGateway(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const pageGets = ctx.host.http.request.mock.calls
      .map((c) => c[0])
      .filter((o) => String(o.url).indexOf("/billing/coding-plan") !== -1)
    expect(pageGets.length).toBe(0)
    expect(gatewayPosts(ctx)[0].bodyText).toContain("sec_token=preset")
  })

  it("rejects an unknown region", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => (name === "QWEN_REGION" ? "mars" : null))

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Unknown Qwen region")
  })

  it("asks for a fresh login when the console rejects the cookies", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue({ status: 401, headers: {}, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Qwen login required")
  })

  it("asks for a fresh login when the console page has no token", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "<html></html>" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Qwen login required")
  })

  it("reads cookies and region from the config file", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({ qwen: { cookie: "Cookie: a=b; c=d", region: "cn" } }),
    )
    mockGateway(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(gatewayPosts(ctx)[0].headers.Cookie).toBe("a=b; c=d")
    expect(gatewayPosts(ctx)[0].url).toContain("cs-data.qianwenai.com")
  })

  it("accepts a DevTools cookies table paste, including base64 values", async () => {
    const ctx = makeCtx()
    mockCookie(ctx, "login_ticket\tYWJjZA==\t.qianwenai.com\t/\ncna\tzz99\t.qianwenai.com\t/")
    mockGateway(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(gatewayPosts(ctx)[0].headers.Cookie).toBe("login_ticket=YWJjZA==; cna=zz99")
  })
})
