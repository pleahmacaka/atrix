export type DockStyle = "windows" | "mac"
export type DockEdge = "bottom" | "top"
export type DockEdgeOnly = "never" | "maximized" | "always"
export type DockAlign = "start" | "center"
export type DockSide = "left" | "right"
export type ClockAlign = "start" | "center" | "end"
export type DockBackground = "inherit" | Background
export type SpectrumStyle = "bars" | "mirror" | "wave" | "dots"
export type LauncherTrigger = "win" | "shortcut" | "both"
export type PanelPosition = "left" | "center" | "right"
export type PanelStart = "compact" | "full"
export type ThemeMode = "dark" | "light" | "system"
export type Background = "aura" | "glass" | "solid"
export type Density = "compact" | "cozy"
export type Features = {
  dock: boolean
  launcher: boolean
  calendar: boolean
}

export const isLastEntryPoint = (features: Features, key: keyof Features) =>
  (key === "dock" && features.dock && !features.launcher) ||
  (key === "launcher" && features.launcher && !features.dock)

export type DockWidgetKind = "lead" | "apps" | "tray" | "spacer"

export type DockWidget = {
  id: string
  kind: DockWidgetKind
  size: number
}

export type ShellItemKind =
  | "launcher"
  | "apps"
  | "taskview"
  | "claude"
  | "tray"
  | "media"
  | "input"
  | "meters"
  | "network"
  | "bluetooth"
  | "battery"
  | "volume"
  | "clock"
  | "bell"
  | "settings"
  | "desktop"
  | "separator"

export type ShellItem = { id: string; kind: ShellItemKind }

export type ShellGroup = { id: string; items: ShellItem[] }

export type ShellZoneId = "start" | "center" | "end"

export type ShellZoneSize = "auto" | "compact" | "regular"

export type ShellZone = {
  align: ShellZoneId
  size: ShellZoneSize
  groups: ShellGroup[]
}

export type ShellBar = Record<ShellZoneId, ShellZone>

export type ShellLayout = { dock: ShellBar; top: ShellBar }

export type WebSearchEngine = "google" | "duckduckgo" | "bing" | "naver"
export type TerminalApp =
  | "auto"
  | "atrix"
  | "wt"
  | "pwsh"
  | "powershell"
  | "cmd"
export type TodoSort = "manual" | "due" | "priority"

export type TimePicker = "wheel" | "clock"
export type EventTag = {
  id: string
  name: string
  hideWhileSharing: boolean
  color?: string
}
export type TraySlot =
  | "taskview"
  | "claude"
  | "tray"
  | "media"
  | "input"
  | "meters"
  | "bluetooth"
  | "battery"
  | "volume"
  | "clock"
  | "bell"
  | "settings"
  | "desktop"

export type DeviceSettings = {
  deviceId: string
  deviceName: string
  onboarded: boolean
  dockStyle: DockStyle
  dockEdge: DockEdge
  dockAlign: DockAlign
  dockHeight: number
  dockWidth: number
  dockGrowth: number
  dockIconSize: number
  dockAutoHide: boolean
  dockFullscreenReveal: boolean
  dockEdgeOnly: DockEdgeOnly
  dockHideAnimation: boolean
  dockHideGather: boolean
  dockHideDelay: number
  dockGatherHideMs: number
  dockGatherShowMs: number
  dockIcon: string | null
  dockIslands: boolean
  dockIslandGap: number
  dockDesktop: boolean
  topBar: boolean
  panelPosition: PanelPosition
  panelStart: PanelStart
  dockSeparators: boolean
  clockAlign: ClockAlign
  editMode: boolean
  features: Features
  dockMonitor: string | null
  hideSystemTaskbar: boolean
  showLauncherButton: boolean
  showTrayIcons: boolean
  showKeymap: boolean
  showSettingsButton: boolean
  showClaudeUsage: boolean
  claudeUsageSource: string
  claudeUsageSide: DockSide
  claudeUsageStacked: boolean
  metersStacked: boolean
  mediaSide: DockSide
  showSpectrum: boolean
  spectrumStyle: SpectrumStyle
  showBattery: boolean
  showVolume: boolean
  showMedia: boolean
  showMeters: boolean
  showNetwork: boolean
  showBluetooth: boolean
  showNotifications: boolean
  showDesktopButton: boolean
  showTaskView: boolean
  showInputLanguage: boolean
  showSeconds: boolean
  clock24h: boolean
  launcherTrigger: LauncherTrigger
  launcherShortcut: string
  terminal: TerminalApp
  autostart: boolean
  pinnedApps: string[]
  hiddenApps: string[]
  dockOrder: string[]
  dockWidgets: DockWidget[]
  trayOrder: string[]
  trayHidden: string[]
  traySlots: TraySlot[]
  shellLayouts: Record<string, ShellLayout>
}

export type Appearance = {
  mode: ThemeMode
  background: Background
  useSystemAccent: boolean
  accentHue: number
  accentSpread: number
  vividness: number
  texture: number
  radius: number
  blur: number
  font: string
  fontScale: number
  surfaceOpacity: number
  dockOpacity: number
  dockBackground: DockBackground
  launcherBackground: DockBackground
  panelBackground: DockBackground
  settingsBackground: DockBackground
  noticesBackground: DockBackground
  filesBackground: DockBackground
  terminalBackground: DockBackground
  dockBlur: number
  dockRadius: number
  dockBorder: boolean
  dockTint: number
  density: Density
  motion: boolean
}

export type LauncherPrefs = {
  maxResults: number
  showWindows: boolean
  showCommands: boolean
  showTodos: boolean
  calculator: boolean
  webSearch: WebSearchEngine
}

export type Profile = {
  appearance: Appearance
  launcher: LauncherPrefs
  calendar: {
    weekStartsOn: 0 | 1
    showWeekNumbers: boolean
    reminderMinutes: number
    timePicker: TimePicker
    region: string
    tags: EventTag[]
  }
  todo: {
    showCompleted: boolean
    sortBy: TodoSort
  }
}

export type PinSection = "appearance" | "launcher" | "calendar"

export type PinPath = {
  [S in PinSection]: `${S}.${keyof Profile[S] & string}`
}[PinSection]

export type AtrixStyle = { linked: boolean; profile: Partial<Profile> | null }

export type ThemePrefs = {
  followAtrix: boolean
  mode: ThemeMode
  look?: Partial<Appearance>
}
