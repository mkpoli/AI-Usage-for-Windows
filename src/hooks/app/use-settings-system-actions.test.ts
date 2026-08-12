import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getEnabledPluginIdsMock,
  invokeMock,
  saveAutoUpdateIntervalMock,
  saveCliEnvironmentMock,
  saveGlobalShortcutMock,
  saveStartOnLoginMock,
  trackMock,
} = vi.hoisted(() => ({
  trackMock: vi.fn(),
  getEnabledPluginIdsMock: vi.fn(),
  saveAutoUpdateIntervalMock: vi.fn(),
  saveCliEnvironmentMock: vi.fn(),
  saveGlobalShortcutMock: vi.fn(),
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
  saveAutoUpdateInterval: saveAutoUpdateIntervalMock,
  saveCliEnvironment: saveCliEnvironmentMock,
  saveGlobalShortcut: saveGlobalShortcutMock,
  saveStartOnLogin: saveStartOnLoginMock,
}))

import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"

describe("useSettingsSystemActions", () => {
  beforeEach(() => {
    trackMock.mockReset()
    getEnabledPluginIdsMock.mockReset()
    saveAutoUpdateIntervalMock.mockReset()
    saveGlobalShortcutMock.mockReset()
    saveStartOnLoginMock.mockReset()
    saveCliEnvironmentMock.mockReset()
    invokeMock.mockReset()

    getEnabledPluginIdsMock.mockImplementation((settings: { order: string[]; disabled: string[] }) =>
      settings.order.filter((id) => !settings.disabled.includes(id))
    )
    saveAutoUpdateIntervalMock.mockResolvedValue(undefined)
    saveGlobalShortcutMock.mockResolvedValue(undefined)
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
})
