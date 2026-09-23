import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const NOW = Date.parse("2026-09-23T00:00:00.000Z")
const PERIOD_END = NOW + 18 * 24 * 60 * 60 * 1000

// Shapes mirror the console's /api/v1/tokenPlan/* payloads: a zero code, a
// data envelope, and windowed usage groups made of named token items.
const USAGE = {
  usage: {
    percent: 0.42,
    items: [
      { name: "plan_total_token", used: 128000000, limit: 300000000, percent: 0.4267 },
      { name: "compensation_total_token", used: 1000000, limit: 5000000, percent: 0.2 },
    ],
  },
  monthUsage: {
    percent: 0.25,
    items: [{ name: "month_total_token", used: 64000000, limit: 256000000, percent: 0.25 }],
  },
}

const DETAIL = {
  planName: "Pro",
  planCode: "pro:monthly",
  currentPeriodEnd: new Date(PERIOD_END).toISOString(),
  expired: false,
  enableAutoRenew: true,
}

function mockCookie(ctx, value = "api-platform_serviceToken=st; userId=42; api-platform_slh=slh; api-platform_ph=ph") {
  ctx.host.env.get.mockImplementation((name) => (name === "MIMO_COOKIE" ? value : null))
}

function mockApi(ctx, { usage = USAGE, detail = DETAIL, usageStatus = 200, detailStatus = 200, usageBody, detailBody } = {}) {
  ctx.host.http.request.mockImplementation((opts) => {
    const url = String(opts.url)
    if (url.indexOf("/tokenPlan/usage") !== -1) {
      return {
        status: usageStatus,
        headers: {},
        bodyText:
          usageBody !== undefined
            ? usageBody
            : JSON.stringify({ code: 0, message: "ok", data: usage }),
      }
    }
    if (url.indexOf("/tokenPlan/detail") !== -1) {
      return {
        status: detailStatus,
        headers: {},
        bodyText:
          detailBody !== undefined
            ? detailBody
            : JSON.stringify({ code: 0, message: "ok", data: detail }),
      }
    }
    return { status: 404, headers: {}, bodyText: "" }
  })
}

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__ai_usage_plugin
}

describe("mimo plugin", () => {
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
    expect(() => plugin.probe(ctx)).toThrow("Missing MiMo credentials")
  })

  it("prefers the environment cookie over the config file", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({ mimo: { cookie: "api-platform_serviceToken=from-config" } })
    )
    mockCookie(ctx, "api-platform_serviceToken=from-env; userId=1")
    mockApi(ctx)

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const usageCall = ctx.host.http.request.mock.calls
      .map((c) => c[0])
      .find((o) => String(o.url).indexOf("/tokenPlan/usage") !== -1)
    expect(usageCall.headers.Cookie).toBe("api-platform_serviceToken=from-env; userId=1")
  })

  it("reads cookies from the config file, including the session_cookie alias", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(
      "~/.ai-usage/config.json",
      JSON.stringify({
        mimo: {
          session_cookie: "Cookie: api-platform_serviceToken=cfg; userId=7; api-platform_slh=a; api-platform_ph=b",
        },
      })
    )
    mockApi(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Pro")

    const usageCall = ctx.host.http.request.mock.calls
      .map((c) => c[0])
      .find((o) => String(o.url).indexOf("/tokenPlan/usage") !== -1)
    expect(usageCall.headers.Cookie).toBe(
      "api-platform_serviceToken=cfg; userId=7; api-platform_slh=a; api-platform_ph=b"
    )
  })

  it("renders monthly and plan windows as percentages", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    // No reset timestamp is published for the monthly window, so the bar is
    // drawn without a countdown or a pace marker.
    expect(result.lines.find((l) => l.label === "Monthly")).toMatchObject({
      type: "progress",
      used: 25,
      limit: 100,
      format: { kind: "percent" },
    })
    expect(result.lines.find((l) => l.label === "Monthly").resetsAt).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Monthly").periodDurationMs).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Plan")).toMatchObject({
      type: "progress",
      used: 42.7,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: new Date(PERIOD_END).toISOString(),
    })
    expect(result.lines.find((l) => l.label === "Bonus")).toMatchObject({
      type: "progress",
      used: 20,
      limit: 100,
    })
    // Compensation is its own grant, so it carries no plan-period countdown.
    expect(result.lines.find((l) => l.label === "Bonus").resetsAt).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Tokens")).toEqual({
      type: "text",
      label: "Tokens",
      value: "128M / 300M",
    })
    expect(result.lines.find((l) => l.label === "Renewal").value).toBe("Renews in 18 days")
  })

  it("computes the percent from counts when the item omits one", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: { percent: 0.9, items: [{ name: "plan_total_token", used: 50, limit: 200 }] },
        monthUsage: { percent: 0.1, items: [{ name: "month_total_token", used: 1, limit: 10 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Plan").used).toBe(25)
  })

  it("reads percent as a 0..1 fraction", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: { items: [{ name: "plan_total_token", percent: 0.427 }] },
        monthUsage: { items: [{ name: "month_total_token", percent: 0.25 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Monthly").used).toBe(25)
    expect(result.lines.find((l) => l.label === "Plan").used).toBe(42.7)
  })

  it("ignores a month bucket that is not month_total_token", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: { items: [{ name: "plan_total_token", percent: 0.4 }] },
        monthUsage: {
          percent: 0.25,
          items: [{ name: "some_other_bucket", used: 1, limit: 10, percent: 0.25 }],
        },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Monthly")).toBeUndefined()
  })

  it("does not fold a sibling month bucket into the monthly window", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: { items: [{ name: "plan_total_token", percent: 0.4 }] },
        monthUsage: {
          percent: 0.6,
          items: [
            { name: "month_total_token" },
            { name: "some_other_bucket", used: 9, limit: 10, percent: 0.9 },
          ],
        },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    // The named item has no reading of its own, and the group percent is an
    // aggregate across both buckets, so no Monthly bar is drawn.
    expect(result.lines.find((l) => l.label === "Monthly")).toBeUndefined()
  })

  it("says Ends when auto renew is off", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, { detail: { ...DETAIL, enableAutoRenew: false } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Renewal").value).toBe("Ends in 18 days")
  })

  it("flags an expired subscription without a renewal countdown", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, { detail: { ...DETAIL, expired: true } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines[0]).toMatchObject({ type: "badge", label: "Status", text: "Expired" })
    expect(result.lines.find((l) => l.label === "Renewal")).toBeUndefined()
  })

  it("does not coerce a missing count into zero", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: { items: [{ name: "plan_total_token", used: null, limit: "", percent: undefined }] },
        monthUsage: { items: [{ name: "month_total_token", percent: 0.25 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Plan")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Tokens")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Monthly").used).toBe(25)
  })

  it("does not invent a zero used count on the Tokens line", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: { items: [{ name: "plan_total_token", limit: 300000000, percent: 0.5 }] },
        monthUsage: { items: [{ name: "month_total_token", percent: 0.25 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Tokens").value).toBe("? / 300M")
  })

  it("does not read the mixed usage.percent as the Plan bar", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: {
          percent: 0.42,
          items: [{ name: "compensation_total_token", used: 1, limit: 10, percent: 0.1 }],
        },
        monthUsage: { items: [{ name: "month_total_token", percent: 0.25 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Plan")).toBeUndefined()
  })

  it("falls back to planCode when planName is absent", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, { detail: { ...DETAIL, planName: null, planCode: "pro:monthly" } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("pro:monthly")
  })

  it("hides the bonus bar for a zero-size grant", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: {
          percent: 0.4,
          items: [
            { name: "plan_total_token", used: 1, limit: 10, percent: 0.1 },
            { name: "compensation_total_token", used: 0, limit: 0, percent: 0 },
          ],
        },
        monthUsage: { percent: 0.1, items: [{ name: "month_total_token", percent: 0.1 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Bonus")).toBeUndefined()
  })

  it("draws the bonus bar from a percent-only grant", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: {
        usage: {
          percent: 0.4,
          items: [
            { name: "plan_total_token", used: 1, limit: 10, percent: 0.1 },
            { name: "compensation_total_token", percent: 0.2 },
          ],
        },
        monthUsage: { percent: 0.1, items: [{ name: "month_total_token", percent: 0.1 }] },
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Bonus")).toMatchObject({ used: 20, limit: 100 })
  })

  it("dates a renewal that already passed", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      detail: {
        ...DETAIL,
        currentPeriodEnd: new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(),
        enableAutoRenew: false,
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Renewal").value).toBe("Ended 3 days ago")
  })

  it("still reports usage when the detail call fails", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, { detailStatus: 500 })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Monthly")).toBeTruthy()
    expect(result.lines.find((l) => l.label === "Renewal")).toBeUndefined()
  })

  it("throws a login error on 401", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, { usageStatus: 401 })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("MiMo login required")
  })

  it("surfaces a business error code", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, { usageBody: JSON.stringify({ code: 40301, message: "quota exhausted" }) })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("MiMo API error: quota exhausted")
  })

  it("shows one status badge when an expired account has no usage", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: { usage: { percent: 0, items: [] }, monthUsage: { percent: 0, items: [] } },
      detail: { planName: null, expired: true, enableAutoRenew: false },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const badges = result.lines.filter((l) => l.type === "badge")
    expect(badges).toHaveLength(1)
    expect(badges[0]).toMatchObject({ label: "Status", text: "Expired" })
    expect(result.lines.find((l) => l.label === "Monthly")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Plan")).toBeUndefined()
  })

  it("shows one status badge when the account has no plan", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockApi(ctx, {
      usage: { usage: { percent: 0, items: [] }, monthUsage: { percent: 0, items: [] } },
      detail: { planName: null, expired: false, enableAutoRenew: false },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const badges = result.lines.filter((l) => l.type === "badge")
    expect(badges).toHaveLength(1)
    expect(badges[0]).toMatchObject({ label: "Status", text: "No usage data" })
  })
})
