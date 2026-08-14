import { cleanup, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

let latestOnDragEnd: ((event: any) => void) | undefined

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd?: (event: any) => void }) => {
    latestOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  closestCenter: vi.fn(),
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn((_sensor: any, options?: any) => ({ sensor: _sensor, options })),
  useSensors: vi.fn((...sensors: any[]) => sensors),
}))

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (items: any[], from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  },
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}))

import { SettingsPage } from "@/pages/settings"

const defaultProps = {
  plugins: [{ id: "a", name: "Alpha", enabled: true }],
  onReorder: vi.fn(),
  onToggle: vi.fn(),
  autoUpdateInterval: 1 as const,
  onAutoUpdateIntervalChange: vi.fn(),
  themeMode: "system" as const,
  onThemeModeChange: vi.fn(),
  displayMode: "used" as const,
  onDisplayModeChange: vi.fn(),
  resetTimerDisplayMode: "relative" as const,
  onResetTimerDisplayModeChange: vi.fn(),

  globalShortcut: null,
  onGlobalShortcutChange: vi.fn(),
  startOnLogin: false,
  onStartOnLoginChange: vi.fn(),
  cliEnvironment: "windows",
  wslDistros: [] as string[],
  onCliEnvironmentChange: vi.fn(),
  localHttpApi: false,
  localHttpApiError: null as string | null,
  onLocalHttpApiChange: vi.fn(),
}

afterEach(() => {
  cleanup()
})

describe("SettingsPage", () => {
  it("toggles plugins", async () => {
    const onToggle = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "b", name: "Beta", enabled: false },
        ]}
        onToggle={onToggle}
      />
    )
    const checkboxes = screen.getAllByRole("checkbox")
    await userEvent.click(checkboxes[checkboxes.length - 1])
    expect(onToggle).toHaveBeenCalledWith("b")
  })

  it("reorders plugins on drag end", () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        plugins={[
          { id: "a", name: "Alpha", enabled: true },
          { id: "b", name: "Beta", enabled: true },
        ]}
        onReorder={onReorder}
      />
    )
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "b" } })
    expect(onReorder).toHaveBeenCalledWith(["b", "a"])
  })

  it("ignores invalid drag end", () => {
    const onReorder = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onReorder={onReorder}
      />
    )
    latestOnDragEnd?.({ active: { id: "a" }, over: null })
    latestOnDragEnd?.({ active: { id: "a" }, over: { id: "a" } })
    expect(onReorder).not.toHaveBeenCalled()
  })

  it("updates auto-update interval", async () => {
    const onAutoUpdateIntervalChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
      />
    )
    await userEvent.click(screen.getByText("30 min"))
    expect(onAutoUpdateIntervalChange).toHaveBeenCalledWith(30)
  })

  it("shows auto-update helper text", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("How obsessive are you")).toBeInTheDocument()
  })

  it("renders app theme section with theme options", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("App Theme")).toBeInTheDocument()
    expect(screen.getByText("How it looks around here")).toBeInTheDocument()
    expect(screen.getByText("System")).toBeInTheDocument()
    expect(screen.getByText("Light")).toBeInTheDocument()
    expect(screen.getByText("Dark")).toBeInTheDocument()
  })

  it("updates theme mode", async () => {
    const onThemeModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onThemeModeChange={onThemeModeChange}
      />
    )
    await userEvent.click(screen.getByText("Dark"))
    expect(onThemeModeChange).toHaveBeenCalledWith("dark")
  })

  it("updates display mode", async () => {
    const onDisplayModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onDisplayModeChange={onDisplayModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: "Left" }))
    expect(onDisplayModeChange).toHaveBeenCalledWith("left")
  })

  it("updates reset timer display mode", async () => {
    const onResetTimerDisplayModeChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
      />
    )
    await userEvent.click(screen.getByRole("radio", { name: /Absolute/ }))
    expect(onResetTimerDisplayModeChange).toHaveBeenCalledWith("absolute")
  })

  it("renders renamed usage section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Usage Mode")).toBeInTheDocument()
  })

  it("renders reset timers section heading", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText("Reset Timers")).toBeInTheDocument()
  })

  it("does not render tray icon section", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.queryByText("Tray Icon")).not.toBeInTheDocument()
    expect(screen.queryByText("What shows in the tray")).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Bars" })).not.toBeInTheDocument()
  })

  it("does not render removed bar icon controls", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.queryByText("Bar Icon")).not.toBeInTheDocument()
    expect(screen.queryByText("Show percentage")).not.toBeInTheDocument()
  })

  it("toggles start on login checkbox", async () => {
    const onStartOnLoginChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        onStartOnLoginChange={onStartOnLoginChange}
      />
    )
    await userEvent.click(screen.getByText("Start on login"))
    expect(onStartOnLoginChange).toHaveBeenCalledWith(true)
  })

  it("hides the CLI location section on a machine without WSL", () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.queryByText("CLI Location")).toBeNull()
  })

  it("lists Windows alongside every installed distro", () => {
    render(<SettingsPage {...defaultProps} wslDistros={["Ubuntu", "Debian"]} />)
    expect(screen.getByText("CLI Location")).toBeTruthy()
    const group = screen.getByRole("radiogroup", { name: "CLI location" })
    expect(within(group).getByText("Windows")).toBeTruthy()
    expect(within(group).getByText("Ubuntu")).toBeTruthy()
    expect(within(group).getByText("Debian")).toBeTruthy()
  })

  it("selects a distro", async () => {
    const onCliEnvironmentChange = vi.fn()
    render(
      <SettingsPage
        {...defaultProps}
        wslDistros={["Ubuntu"]}
        onCliEnvironmentChange={onCliEnvironmentChange}
      />
    )
    await userEvent.click(screen.getByText("Ubuntu"))
    expect(onCliEnvironmentChange).toHaveBeenCalledWith("wsl:Ubuntu")
  })

  it("says which distro serves the logins", () => {
    render(
      <SettingsPage {...defaultProps} wslDistros={["Ubuntu"]} cliEnvironment="wsl:Ubuntu" />
    )
    expect(screen.getByText(/Logins are read from Ubuntu/)).toBeTruthy()
  })


  it("says nothing listens while the loopback API is off", () => {
    render(<SettingsPage {...defaultProps} localHttpApi={false} />)

    expect(screen.getByText("Nothing listens on the port while this is off.")).toBeInTheDocument()
    expect(screen.getByText(/Serve usage on http:\/\/127\.0\.0\.1:6736/)).toBeInTheDocument()
  })

  it("points at the widget endpoint once the loopback API is on", () => {
    render(<SettingsPage {...defaultProps} localHttpApi={true} />)

    expect(
      screen.getByText(/http:\/\/127\.0\.0\.1:6736\/v1\/rainmeter/)
    ).toBeInTheDocument()
  })

  it("shows a port error in place of the endpoint hint", () => {
    render(
      <SettingsPage
        {...defaultProps}
        localHttpApi={true}
        localHttpApiError="Port 6736 is in use by another program."
      />
    )

    expect(screen.getByText("Port 6736 is in use by another program.")).toBeInTheDocument()
    expect(screen.queryByText(/v1\/rainmeter/)).not.toBeInTheDocument()
  })

  it("reports the loopback API toggle", async () => {
    const onLocalHttpApiChange = vi.fn()
    render(
      <SettingsPage {...defaultProps} onLocalHttpApiChange={onLocalHttpApiChange} />
    )

    await userEvent.click(
      screen.getByLabelText(/Serve usage on/).querySelector("button") ??
        screen.getByLabelText(/Serve usage on/)
    )
    expect(onLocalHttpApiChange).toHaveBeenCalledWith(true)
  })

})
