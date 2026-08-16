import { create } from "zustand"
import {
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_CLI_ENVIRONMENT,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_LOCAL_HTTP_API,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  type AutoUpdateIntervalMinutes,
  type CliEnvironment,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings"

type AppPreferencesStore = {
  autoUpdateInterval: AutoUpdateIntervalMinutes
  themeMode: ThemeMode
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  globalShortcut: GlobalShortcut
  startOnLogin: boolean
  cliEnvironment: CliEnvironment
  wslDistros: string[]
  menubarIconStyle: MenubarIconStyle
  localHttpApi: boolean
  localHttpApiError: string | null
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setCliEnvironment: (value: CliEnvironment) => void
  setWslDistros: (value: string[]) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setLocalHttpApi: (value: boolean) => void
  setLocalHttpApiError: (value: string | null) => void
  resetState: () => void
}

const initialState = {
  autoUpdateInterval: DEFAULT_AUTO_UPDATE_INTERVAL,
  themeMode: DEFAULT_THEME_MODE,
  displayMode: DEFAULT_DISPLAY_MODE,
  resetTimerDisplayMode: DEFAULT_RESET_TIMER_DISPLAY_MODE,
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  startOnLogin: DEFAULT_START_ON_LOGIN,
  cliEnvironment: DEFAULT_CLI_ENVIRONMENT,
  wslDistros: [] as string[],
  menubarIconStyle: DEFAULT_MENUBAR_ICON_STYLE,
  localHttpApi: DEFAULT_LOCAL_HTTP_API,
  localHttpApiError: null as string | null,
}

export const useAppPreferencesStore = create<AppPreferencesStore>((set) => ({
  ...initialState,
  setAutoUpdateInterval: (value) => set({ autoUpdateInterval: value }),
  setThemeMode: (value) => set({ themeMode: value }),
  setDisplayMode: (value) => set({ displayMode: value }),
  setResetTimerDisplayMode: (value) => set({ resetTimerDisplayMode: value }),
  setGlobalShortcut: (value) => set({ globalShortcut: value }),
  setStartOnLogin: (value) => set({ startOnLogin: value }),
  setCliEnvironment: (value) => set({ cliEnvironment: value }),
  setWslDistros: (value) => set({ wslDistros: value }),
  setMenubarIconStyle: (value) => set({ menubarIconStyle: value }),
  setLocalHttpApi: (value) => set({ localHttpApi: value }),
  setLocalHttpApiError: (value) => set({ localHttpApiError: value }),
  resetState: () => set(initialState),
}))
