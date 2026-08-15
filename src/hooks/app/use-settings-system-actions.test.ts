import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getEnabledPluginIdsMock,
  invokeMock,
  saveAutoUpdateIntervalMock,
  saveCliEnvironmentMock,
  saveGlobalShortcutMock,
  saveLocalHttpApiMock,
  saveStartOnLoginMock,
  trackMock,
} = vi.hoisted(() => ({
  trackMock: vi.fn(),
  getEnabledPluginIdsMock: vi.fn(),
  saveAutoUpdateIntervalMock: vi.fn(),
  saveCliEnvironmentMock: vi.fn(),
  saveGlobalShortcutMock: vi.fn(),
  saveLocalHttpApiMock: vi.fn(),
  saveStartOnLoginMock: vi.fn(),
  invokeMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}))

vi.mock("@/lib/settings", () => ({
  getEnabledPluginIds: getEnabledPluginIdsMock,
  LOCAL_HTTP_API_PORT_TAKEN: "Port 6736 is in use by another program.",
  saveAutoUpdateInterval: saveAutoUpdateIntervalMock,
  saveCliEnvironment: saveCliEnvironmentMock,
  saveGlobalShortcut: saveGlobalShortcutMock,
  saveLocalHttpApi: saveLocalHttpApiMock,
  saveStartOnLogin: saveStartOnLoginMock,
}))

import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"

describe("useSettingsSystemActions", () => {
  beforeEach(() => {
    trackMock.mockReset()
    getEnabledPluginIdsMock.mockReset()
    saveAutoUpdateIntervalMock.mockReset()
    saveGlobalShortcutMock.mockReset()
    saveLocalHttpApiMock.mockReset()
    saveStartOnLoginMock.mockReset()
    saveCliEnvironmentMock.mockReset()
    invokeMock.mockReset()

    getEnabledPluginIdsMock.mockImplementation((settings: { order: string[]; disabled: string[] }) =>
      settings.order.filter((id) => !settings.disabled.includes(id))
    )
    saveAutoUpdateIntervalMock.mockResolvedValue(undefined)
    saveGlobalShortcutMock.mockResolvedValue(undefined)
    saveLocalHttpApiMock.mockResolvedValue(undefined)
    saveStartOnLoginMock.mockResolvedValue(undefined)
    saveCliEnvironmentMock.mockResolvedValue(undefined)
    invokeMock.mockResolvedValue(undefined)
  })

  it("updates auto refresh schedule when at least one plugin is enabled", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000)
    const setAutoUpdateInterval = vi.fn()
    const setAutoUpdateNextAt = vi.fn()

    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: { order: ["codex"], disabled: [] },
        setAutoUpdateInterval,
        setAutoUpdateNextAt,
        setGlobalShortcut: vi.fn(),
        setStartOnLogin: vi.fn(),
        setCliEnvironment: vi.fn(),
        setLocalHttpApi: vi.fn(),
        setLocalHttpApiError: vi.fn(),
        refreshEnabledPlugins: vi.fn(),
        applyStartOnLogin: vi.fn().mockResolvedValue(undefined),
      })
    )

    act(() => {
      result.current.handleAutoUpdateIntervalChange(10)
    })

    expect(trackMock).toHaveBeenCalledWith("setting_changed", { setting: "auto_refresh", value: "10" })
    expect(setAutoUpdateInterval).toHaveBeenCalledWith(10)
    expect(setAutoUpdateNextAt).toHaveBeenCalledWith(610_000)
    expect(saveAutoUpdateIntervalMock).toHaveBeenCalledWith(10)
    nowSpy.mockRestore()
  })

  it("clears next refresh when no enabled plugins remain", () => {
    const setAutoUpdateNextAt = vi.fn()

    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: { order: ["codex"], disabled: ["codex"] },
        setAutoUpdateInterval: vi.fn(),
        setAutoUpdateNextAt,
        setGlobalShortcut: vi.fn(),
        setStartOnLogin: vi.fn(),
        setCliEnvironment: vi.fn(),
        setLocalHttpApi: vi.fn(),
        setLocalHttpApiError: vi.fn(),
        refreshEnabledPlugins: vi.fn(),
        applyStartOnLogin: vi.fn().mockResolvedValue(undefined),
      })
    )

    act(() => {
      result.current.handleAutoUpdateIntervalChange(30)
    })

    expect(setAutoUpdateNextAt).toHaveBeenCalledWith(null)
  })

  it("updates shortcut and start-on-login settings", () => {
    const setGlobalShortcut = vi.fn()
    const setStartOnLogin = vi.fn()
    const applyStartOnLogin = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: null,
        setAutoUpdateInterval: vi.fn(),
        setAutoUpdateNextAt: vi.fn(),
        setGlobalShortcut,
        setStartOnLogin,
        setCliEnvironment: vi.fn(),
        setLocalHttpApi: vi.fn(),
        setLocalHttpApiError: vi.fn(),
        refreshEnabledPlugins: vi.fn(),
        applyStartOnLogin,
      })
    )

    act(() => {
      result.current.handleGlobalShortcutChange("CommandOrControl+Shift+O")
      result.current.handleStartOnLoginChange(true)
    })

    expect(trackMock).toHaveBeenCalledWith("setting_changed", {
      setting: "global_shortcut",
      value: "CommandOrControl+Shift+O",
    })
    expect(trackMock).toHaveBeenCalledWith("setting_changed", {
      setting: "start_on_login",
      value: "true",
    })

    expect(setGlobalShortcut).toHaveBeenCalledWith("CommandOrControl+Shift+O")
    expect(saveGlobalShortcutMock).toHaveBeenCalledWith("CommandOrControl+Shift+O")
    expect(invokeMock).toHaveBeenCalledWith("update_global_shortcut", {
      shortcut: "CommandOrControl+Shift+O",
    })

    expect(setStartOnLogin).toHaveBeenCalledWith(true)
    expect(saveStartOnLoginMock).toHaveBeenCalledWith(true)
    expect(applyStartOnLogin).toHaveBeenCalledWith(true)
  })

  it("logs persistence/update failures", async () => {
    const autoError = new Error("auto save failed")
    const shortcutSaveError = new Error("shortcut save failed")
    const shortcutInvokeError = new Error("shortcut invoke failed")
    const startOnLoginSaveError = new Error("start on login save failed")
    const startOnLoginApplyError = new Error("start on login apply failed")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    saveAutoUpdateIntervalMock.mockRejectedValueOnce(autoError)
    saveGlobalShortcutMock.mockRejectedValueOnce(shortcutSaveError)
    invokeMock.mockRejectedValueOnce(shortcutInvokeError)
    saveStartOnLoginMock.mockRejectedValueOnce(startOnLoginSaveError)
    const applyStartOnLogin = vi.fn().mockRejectedValueOnce(startOnLoginApplyError)

    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: null,
        setAutoUpdateInterval: vi.fn(),
        setAutoUpdateNextAt: vi.fn(),
        setGlobalShortcut: vi.fn(),
        setStartOnLogin: vi.fn(),
        setCliEnvironment: vi.fn(),
        setLocalHttpApi: vi.fn(),
        setLocalHttpApiError: vi.fn(),
        refreshEnabledPlugins: vi.fn(),
        applyStartOnLogin,
      })
    )

    act(() => {
      result.current.handleAutoUpdateIntervalChange(5)
      result.current.handleGlobalShortcutChange(null)
      result.current.handleStartOnLoginChange(false)
    })

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to save auto-update interval:", autoError)
      expect(errorSpy).toHaveBeenCalledWith("Failed to save global shortcut:", shortcutSaveError)
      expect(errorSpy).toHaveBeenCalledWith("Failed to update global shortcut:", shortcutInvokeError)
      expect(errorSpy).toHaveBeenCalledWith("Failed to save start on login:", startOnLoginSaveError)
      expect(errorSpy).toHaveBeenCalledWith("Failed to update start on login:", startOnLoginApplyError)
    })

    errorSpy.mockRestore()
  })

  it("switches the CLI environment and re-reads every provider", async () => {
    const setCliEnvironment = vi.fn()
    const refreshEnabledPlugins = vi.fn()
    invokeMock.mockResolvedValue("wsl:Ubuntu")

    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: { order: ["codex"], disabled: [] },
        setAutoUpdateInterval: vi.fn(),
        setAutoUpdateNextAt: vi.fn(),
        setGlobalShortcut: vi.fn(),
        setStartOnLogin: vi.fn(),
        setCliEnvironment,
        setLocalHttpApi: vi.fn(),
        setLocalHttpApiError: vi.fn(),
        refreshEnabledPlugins,
        applyStartOnLogin: vi.fn().mockResolvedValue(undefined),
      })
    )

    act(() => {
      result.current.handleCliEnvironmentChange("wsl:Ubuntu")
    })

    expect(setCliEnvironment).toHaveBeenCalledWith("wsl:Ubuntu")
    expect(saveCliEnvironmentMock).toHaveBeenCalledWith("wsl:Ubuntu")
    expect(invokeMock).toHaveBeenCalledWith("set_cli_environment", { setting: "wsl:Ubuntu" })
    await waitFor(() => {
      expect(refreshEnabledPlugins).toHaveBeenCalled()
    })
  })

  it("stores what the host could reach when a distro is gone", async () => {
    const setCliEnvironment = vi.fn()
    invokeMock.mockResolvedValue("windows")

    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: { order: ["codex"], disabled: [] },
        setAutoUpdateInterval: vi.fn(),
        setAutoUpdateNextAt: vi.fn(),
        setGlobalShortcut: vi.fn(),
        setStartOnLogin: vi.fn(),
        setCliEnvironment,
        setLocalHttpApi: vi.fn(),
        setLocalHttpApiError: vi.fn(),
        refreshEnabledPlugins: vi.fn(),
        applyStartOnLogin: vi.fn().mockResolvedValue(undefined),
      })
    )

    act(() => {
      result.current.handleCliEnvironmentChange("wsl:Gone")
    })

    await waitFor(() => {
      expect(setCliEnvironment).toHaveBeenLastCalledWith("windows")
      expect(saveCliEnvironmentMock).toHaveBeenLastCalledWith("windows")
    })
  })

  function renderLocalHttpApiActions(overrides: Record<string, unknown> = {}) {
    const setLocalHttpApi = vi.fn()
    const setLocalHttpApiError = vi.fn()
    const { result } = renderHook(() =>
      useSettingsSystemActions({
        pluginSettings: { order: ["codex"], disabled: [] },
        setAutoUpdateInterval: vi.fn(),
        setAutoUpdateNextAt: vi.fn(),
        setGlobalShortcut: vi.fn(),
        setStartOnLogin: vi.fn(),
        setCliEnvironment: vi.fn(),
        setLocalHttpApi,
        setLocalHttpApiError,
        refreshEnabledPlugins: vi.fn(),
        applyStartOnLogin: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      })
    )
    return { result, setLocalHttpApi, setLocalHttpApiError }
  }

  it("opens the loopback API and clears any earlier port error", async () => {
    invokeMock.mockResolvedValue(true)
    const { result, setLocalHttpApi, setLocalHttpApiError } = renderLocalHttpApiActions()

    act(() => {
      result.current.handleLocalHttpApiChange(true)
    })

    expect(trackMock).toHaveBeenCalledWith("setting_changed", {
      setting: "local_http_api",
      value: "true",
    })
    expect(setLocalHttpApi).toHaveBeenCalledWith(true)
    expect(saveLocalHttpApiMock).toHaveBeenCalledWith(true)
    expect(invokeMock).toHaveBeenCalledWith("set_local_http_api_enabled", { enabled: true })
    await waitFor(() => {
      expect(setLocalHttpApiError).toHaveBeenLastCalledWith(null)
    })
  })

  it("reports the port as taken when the host call rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    invokeMock.mockRejectedValue(new Error("bind failed"))
    const { result, setLocalHttpApi, setLocalHttpApiError } = renderLocalHttpApiActions()

    act(() => {
      result.current.handleLocalHttpApiChange(true)
    })

    await waitFor(() => {
      expect(setLocalHttpApiError).toHaveBeenLastCalledWith(
        "Port 6736 is in use by another program."
      )
    })
    // The choice survives a busy port so the next launch can retry.
    expect(setLocalHttpApi).toHaveBeenCalledWith(true)
    expect(saveLocalHttpApiMock).toHaveBeenCalledWith(true)
    errorSpy.mockRestore()
  })

  it("closes the loopback API without leaving an error behind", async () => {
    invokeMock.mockResolvedValue(false)
    const { result, setLocalHttpApi, setLocalHttpApiError } = renderLocalHttpApiActions()

    act(() => {
      result.current.handleLocalHttpApiChange(false)
    })

    expect(setLocalHttpApi).toHaveBeenCalledWith(false)
    expect(saveLocalHttpApiMock).toHaveBeenCalledWith(false)
    expect(invokeMock).toHaveBeenCalledWith("set_local_http_api_enabled", { enabled: false })
    await waitFor(() => {
      expect(setLocalHttpApiError).toHaveBeenLastCalledWith(null)
    })
  })

  it("ignores a stale host answer once a newer toggle happened", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    let rejectEnable: (reason: unknown) => void = () => {}
    invokeMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectEnable = reject
        })
    )
    invokeMock.mockResolvedValueOnce(false)

    const { result, setLocalHttpApiError } = renderLocalHttpApiActions()

    act(() => {
      result.current.handleLocalHttpApiChange(true)
    })
    act(() => {
      result.current.handleLocalHttpApiChange(false)
    })

    await waitFor(() => {
      expect(setLocalHttpApiError).toHaveBeenLastCalledWith(null)
    })

    // The delayed enable failure reports a busy port, which no longer applies
    // once the API is switched off again.
    await act(async () => {
      rejectEnable(new Error("bind failed"))
    })

    expect(setLocalHttpApiError).toHaveBeenLastCalledWith(null)
    expect(setLocalHttpApiError).not.toHaveBeenCalledWith(
      "Port 6736 is in use by another program."
    )
    errorSpy.mockRestore()
  })

})
