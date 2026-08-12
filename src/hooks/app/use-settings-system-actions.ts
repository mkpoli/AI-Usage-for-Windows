import { useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { track } from "@/lib/analytics"
import {
  getEnabledPluginIds,
  saveAutoUpdateInterval,
  saveCliEnvironment,
  saveGlobalShortcut,
  saveStartOnLogin,
  type AutoUpdateIntervalMinutes,
  type CliEnvironment,
  type GlobalShortcut,
  type PluginSettings,
} from "@/lib/settings"

type UseSettingsSystemActionsArgs = {
  pluginSettings: PluginSettings | null
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setAutoUpdateNextAt: (value: number | null) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setCliEnvironment: (value: CliEnvironment) => void
  refreshEnabledPlugins: () => void
  applyStartOnLogin: (value: boolean) => Promise<void>
}

export function useSettingsSystemActions({
  pluginSettings,
  setAutoUpdateInterval,
  setAutoUpdateNextAt,
  setGlobalShortcut,
  setStartOnLogin,
  setCliEnvironment,
  refreshEnabledPlugins,
  applyStartOnLogin,
}: UseSettingsSystemActionsArgs) {
  const handleAutoUpdateIntervalChange = useCallback((value: AutoUpdateIntervalMinutes) => {
    track("setting_changed", { setting: "auto_refresh", value: String(value) })
    setAutoUpdateInterval(value)

    if (pluginSettings) {
      const enabledIds = getEnabledPluginIds(pluginSettings)
      if (enabledIds.length > 0) {
        setAutoUpdateNextAt(Date.now() + value * 60_000)
      } else {
        setAutoUpdateNextAt(null)
      }
    }

    void saveAutoUpdateInterval(value).catch((error) => {
      console.error("Failed to save auto-update interval:", error)
    })
  }, [pluginSettings, setAutoUpdateInterval, setAutoUpdateNextAt])

  const handleGlobalShortcutChange = useCallback((value: GlobalShortcut) => {
    track("setting_changed", { setting: "global_shortcut", value: value ?? "disabled" })
    setGlobalShortcut(value)
    void saveGlobalShortcut(value).catch((error) => {
      console.error("Failed to save global shortcut:", error)
    })
    invoke("update_global_shortcut", { shortcut: value }).catch((error) => {
      console.error("Failed to update global shortcut:", error)
    })
  }, [setGlobalShortcut])

  const handleStartOnLoginChange = useCallback((value: boolean) => {
    track("setting_changed", { setting: "start_on_login", value: value ? "true" : "false" })
    setStartOnLogin(value)
    void saveStartOnLogin(value).catch((error) => {
      console.error("Failed to save start on login:", error)
    })
    void applyStartOnLogin(value).catch((error) => {
      console.error("Failed to update start on login:", error)
    })
  }, [applyStartOnLogin, setStartOnLogin])

  const handleCliEnvironmentChange = useCallback((value: CliEnvironment) => {
    track("setting_changed", { setting: "cli_environment", value })
    setCliEnvironment(value)
    void saveCliEnvironment(value).catch((error) => {
      console.error("Failed to save CLI environment:", error)
    })
    // The host answers with the environment it could actually reach, which falls back to the
    // Windows profile when a distro is gone.
    void invoke<string>("set_cli_environment", { setting: value })
      .then((applied) => {
        if (applied !== value) {
          setCliEnvironment(applied)
          void saveCliEnvironment(applied).catch((error) => {
            console.error("Failed to save CLI environment:", error)
          })
        }
        refreshEnabledPlugins()
      })
      .catch((error) => {
        console.error("Failed to switch CLI environment:", error)
      })
  }, [refreshEnabledPlugins, setCliEnvironment])

  return {
    handleAutoUpdateIntervalChange,
    handleGlobalShortcutChange,
    handleStartOnLoginChange,
    handleCliEnvironmentChange,
  }
}
