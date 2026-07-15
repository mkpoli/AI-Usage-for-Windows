import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__ai_usage_plugin
}

const BILLING_HTML = `
<main>
  <div data-slot="card-title"><span>Standard</span><span>$20/mo</span></div>
  <div data-slot="card-title">Usage limit</div>
  <p class="font-medium text-sm">5-hour</p>
  <p class="text-muted-foreground text-xs tabular-nums">Resets on June 23, 2026 at 2:53 PM</p>
  <button aria-label="The 5-hour window starts with your first request."></button>
  <p class="text-muted-foreground text-sm">92% used</p>
  <p class="font-medium text-sm">Weekly</p>
  <p class="text-muted-foreground text-xs tabular-nums">Resets on June 29, 2026 at 12:00 AM</p>
  <button aria-label="Weekly usage resets every Monday at 00:00 UTC."></button>
  <p class="text-muted-foreground text-sm">32% used</p>
</main>
`

function mockCookie(ctx, value = "session=abc; theme=dark") {
  ctx.host.env.get.mockImplementation((name) => (name === "SAKANA_COOKIE" ? value : null))
}

function mockBilling(ctx, body = BILLING_HTML, status = 200) {
  ctx.host.http.request.mockReturnValue({ status, headers: {}, bodyText: body })
}

describe("sakana plugin", () => {
  beforeEach(() => {
    delete globalThis.__ai_usage_plugin
    vi.resetModules()
  })

  it("throws when cookie header is missing", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Missing SAKANA_COOKIE")
  })

  it("fetches billing with normalized cookie header", async () => {
    const ctx = makeCtx()
    mockCookie(ctx, "Cookie: session=abc; theme=dark")
    mockBilling(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Standard $20/mo")
    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      url: "https://console.sakana.ai/billing",
      headers: expect.objectContaining({
        Cookie: "session=abc; theme=dark",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      }),
    }))
  })

  it("renders 5-hour and weekly quota windows", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const fiveHour = result.lines.find((line) => line.label === "5-hour")
    expect(fiveHour).toMatchObject({
      type: "progress",
      used: 92,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: 5 * 60 * 60 * 1000,
      resetsAt: "2026-06-23T14:53:00.000Z",
    })

    const weekly = result.lines.find((line) => line.label === "Weekly")
    expect(weekly).toMatchObject({
      type: "progress",
      used: 32,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: 7 * 24 * 60 * 60 * 1000,
      resetsAt: "2026-06-29T00:00:00.000Z",
    })
  })

  it("handles a missing reset line", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, BILLING_HTML.replace(
      '<p class="text-muted-foreground text-xs tabular-nums">Resets on June 23, 2026 at 2:53 PM</p>',
      "",
    ))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const fiveHour = result.lines.find((line) => line.label === "5-hour")

    expect(fiveHour.used).toBe(92)
    expect(fiveHour.resetsAt).toBeUndefined()
  })

  it("throws login required on auth status", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, "expired", 401)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Sakana login required")
  })

  it("throws login required on redirect status", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, "", 302)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Sakana login required")
  })

  it("throws parse error when usage windows are missing", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, "<main>Billing</main>")

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage limit windows were not found")
  })

  it("rejects out-of-range percentages", async () => {
    const ctx = makeCtx()
    mockCookie(ctx)
    mockBilling(ctx, BILLING_HTML.replace("92% used", "101% used"))

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Invalid 5-hour usage percentage")
  })
})
