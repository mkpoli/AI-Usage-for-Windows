import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  arePluginSettingsEqualMock,
  disableAutostartMock,
  enableAutostartMock,
  getEnabledPluginIdsMock,
  invokeMock,
  isAutostartEnabledMock,
  isTauriMock,
  loadRuntimeInfoMock,
  loadAutoUpdateIntervalMock,
  loadCliEnvironmentMock,
  loadDisplayModeMock,
  loadGlobalShortcutMock,
  loadLocalHttpApiMock,
  loadMenubarIconStyleMock,
  loadPluginSettingsMock,
  loadResetTimerDisplayModeMock,
  loadStartOnLoginMock,
  loadThemeModeMock,
  migrateLegacyTraySettingsMock,
  normalizePluginSettingsMock,
  savePluginSettingsMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  loadRuntimeInfoMock: vi.fn(),
  isAutostartEnabledMock: vi.fn(),
  enableAutostartMock: vi.fn(),
  disableAutostartMock: vi.fn(),
  arePluginSettingsEqualMock: vi.fn(),
  getEnabledPluginIdsMock: vi.fn(),
  loadAutoUpdateIntervalMock: vi.fn(),
  loadCliEnvironmentMock: vi.fn(),
  loadDisplayModeMock: vi.fn(),
  loadGlobalShortcutMock: vi.fn(),
  loadLocalHttpApiMock: vi.fn(),
  loadMenubarIconStyleMock: vi.fn(),
  loadPluginSettingsMock: vi.fn(),
  loadResetTimerDisplayModeMock: vi.fn(),
  loadStartOnLoginMock: vi.fn(),
  loadThemeModeMock: vi.fn(),
  migrateLegacyTraySettingsMock: vi.fn(),
  normalizePluginSettingsMock: vi.fn(),
  savePluginSettingsMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: disableAutostartMock,
  enable: enableAutostartMock,
  isEnabled: isAutostartEnabledMock,
}))

vi.mock("@/lib/runtime-info", () => ({
  loadRuntimeInfo: loadRuntimeInfoMock,
}))

vi.mock("@/lib/settings", () => ({
  arePluginSettingsEqual: arePluginSettingsEqualMock,
  DEFAULT_AUTO_UPDATE_INTERVAL: 1,
  DEFAULT_CLI_ENVIRONMENT: "windows",
  DEFAULT_DISPLAY_MODE: "left",
  DEFAULT_GLOBAL_SHORTCUT: null,
  DEFAULT_LOCAL_HTTP_API: false,
  DEFAULT_MENUBAR_ICON_STYLE: "bars",
  DEFAULT_RESET_TIMER_DISPLAY_MODE: "relative",
  DEFAULT_START_ON_LOGIN: true,
  DEFAULT_THEME_MODE: "system",
  getEnabledPluginIds: getEnabledPluginIdsMock,
  LOCAL_HTTP_API_PORT_TAKEN: "Port 6736 is in use by another program.",
  loadAutoUpdateInterval: loadAutoUpdateIntervalMock,
  loadCliEnvironment: loadCliEnvironmentMock,
  loadDisplayMode: loadDisplayModeMock,
  loadGlobalShortcut: loadGlobalShortcutMock,
  loadLocalHttpApi: loadLocalHttpApiMock,
  loadMenubarIconStyle: loadMenubarIconStyleMock,
  loadPluginSettings: loadPluginSettingsMock,
  loadResetTimerDisplayMode: loadResetTimerDisplayModeMock,
  loadStartOnLogin: loadStartOnLoginMock,
  loadThemeMode: loadThemeModeMock,
  migrateLegacyTraySettings: migrateLegacyTraySettingsMock,
  normalizePluginSettings: normalizePluginSettingsMock,
  savePluginSettings: savePluginSettingsMock,
}))

import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"

function createArgs() {
  return {
    setPluginSettings: vi.fn(),
    setPluginsMeta: vi.fn(),
    setAutoUpdateInterval: vi.fn(),
    setThemeMode: vi.fn(),
    setDisplayMode: vi.fn(),
    setResetTimerDisplayMode: vi.fn(),
    setGlobalShortcut: vi.fn(),
    setStartOnLogin: vi.fn(),
    setMenubarIconStyle: vi.fn(),
    setCliEnvironment: vi.fn(),
    setWslDistros: vi.fn(),
    setLocalHttpApi: vi.fn(),
    setLocalHttpApiError: vi.fn(),
    setLoadingForPlugins: vi.fn(),
    setErrorForPlugins: vi.fn(),
    startBatch: vi.fn().mockResolvedValue(undefined),
  }
}

describe("useSettingsBootstrap", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    isAutostartEnabledMock.mockReset()
    enableAutostartMock.mockReset()
    disableAutostartMock.mockReset()
    arePluginSettingsEqualMock.mockReset()
    getEnabledPluginIdsMock.mockReset()
    loadAutoUpdateIntervalMock.mockReset()
    loadCliEnvironmentMock.mockReset()
    loadDisplayModeMock.mockReset()
    loadGlobalShortcutMock.mockReset()
    loadLocalHttpApiMock.mockReset()
    loadMenubarIconStyleMock.mockReset()
    loadPluginSettingsMock.mockReset()
    loadResetTimerDisplayModeMock.mockReset()
    loadStartOnLoginMock.mockReset()
    loadThemeModeMock.mockReset()
    migrateLegacyTraySettingsMock.mockReset()
    normalizePluginSettingsMock.mockReset()
    savePluginSettingsMock.mockReset()

    isTauriMock.mockReturnValue(true)
    loadRuntimeInfoMock.mockResolvedValue({
      isPackagedWindowsApp: false,
      supportsUpdater: true,
      supportsAutostart: true,
    })
    isAutostartEnabledMock.mockResolvedValue(true)
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_wsl_distros") return Promise.resolve(["Ubuntu"])
      return Promise.resolve([
        {
          id: "codex",
          name: "Codex",
          iconUrl: "/codex.svg",
          brandColor: "#000000",
          lines: [],
          primaryCandidates: [],
        },
      ])
    })
    loadPluginSettingsMock.mockResolvedValue({ order: ["codex"], disabled: [] })
    normalizePluginSettingsMock.mockImplementation((stored) => stored)
    arePluginSettingsEqualMock.mockReturnValue(true)
    loadAutoUpdateIntervalMock.mockResolvedValue(10)
    loadThemeModeMock.mockResolvedValue("dark")
    loadDisplayModeMock.mockResolvedValue("used")
    loadResetTimerDisplayModeMock.mockResolvedValue("relative")
    loadGlobalShortcutMock.mockResolvedValue("CommandOrControl+Shift+O")
    loadMenubarIconStyleMock.mockResolvedValue("provider")
    loadStartOnLoginMock.mockResolvedValue(true)
    loadLocalHttpApiMock.mockResolvedValue(false)
    loadCliEnvironmentMock.mockResolvedValue("wsl:Ubuntu")
    migrateLegacyTraySettingsMock.mockResolvedValue(undefined)
    savePluginSettingsMock.mockResolvedValue(undefined)
    getEnabledPluginIdsMock.mockReturnValue(["codex"])
  })

  it("disables autostart when applyStartOnLogin receives false", async () => {
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(false)

    expect(disableAutostartMock).toHaveBeenCalledTimes(1)
    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("skips autostart work when runtime does not support it", async () => {
    loadRuntimeInfoMock.mockResolvedValueOnce({
      isPackagedWindowsApp: true,
      supportsUpdater: false,
      supportsAutostart: false,
    })
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(false)

    expect(isAutostartEnabledMock).not.toHaveBeenCalled()
    expect(disableAutostartMock).not.toHaveBeenCalled()
    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("loads the stored CLI environment and the installed distros", async () => {
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setCliEnvironment).toHaveBeenCalledWith("wsl:Ubuntu")
      expect(args.setWslDistros).toHaveBeenCalledWith(["Ubuntu"])
    })
  })

  it("keeps an empty list when the host answers with no array", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_wsl_distros") return Promise.resolve(null)
      return Promise.resolve([])
    })
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setWslDistros).toHaveBeenCalledWith([])
    })
  })

  it("reports no distros when the host cannot list them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_wsl_distros") return Promise.reject(new Error("wsl missing"))
      return Promise.resolve([])
    })
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setWslDistros).toHaveBeenCalledWith([])
    })
    errorSpy.mockRestore()
  })

  it("falls back to default reset timer mode when loading fails", async () => {
    const resetModeError = new Error("reset timer mode unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadResetTimerDisplayModeMock.mockRejectedValueOnce(resetModeError)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load reset timer display mode:",
        resetModeError
      )
      expect(args.setResetTimerDisplayMode).toHaveBeenCalledWith("relative")
    })

    errorSpy.mockRestore()
  })

  it("passes the stored loopback API choice through", async () => {
    loadLocalHttpApiMock.mockResolvedValue(false)
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setLocalHttpApi).toHaveBeenCalledWith(false)
    })
    expect(args.setLocalHttpApiError).toHaveBeenCalledWith(null)
    expect(invokeMock).not.toHaveBeenCalledWith("is_local_http_api_running")
  })

  it("flags a busy port when the host did not open the socket at startup", async () => {
    loadLocalHttpApiMock.mockResolvedValue(true)
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_wsl_distros") return Promise.resolve(["Ubuntu"])
      if (command === "is_local_http_api_running") return Promise.resolve(false)
      return Promise.resolve([])
    })
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setLocalHttpApiError).toHaveBeenCalledWith(
        "Port 6736 is in use by another program."
      )
    })
    expect(args.setLocalHttpApi).toHaveBeenCalledWith(true)
  })

  it("leaves no error when the host is already serving", async () => {
    loadLocalHttpApiMock.mockResolvedValue(true)
    invokeMock.mockImplementation((command: string) => {
      if (command === "list_wsl_distros") return Promise.resolve(["Ubuntu"])
      if (command === "is_local_http_api_running") return Promise.resolve(true)
      return Promise.resolve([])
    })
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setLocalHttpApiError).toHaveBeenCalledWith(null)
    })
  })

  it("falls back to the default loopback API choice when loading fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadLocalHttpApiMock.mockRejectedValue(new Error("store unavailable"))
    const args = createArgs()
    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setLocalHttpApi).toHaveBeenCalledWith(false)
    })
    errorSpy.mockRestore()
  })

})
