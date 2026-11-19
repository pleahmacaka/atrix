import { invoke } from "@tauri-apps/api/core"
import { emitTo } from "@tauri-apps/api/event"
import type { LauncherTrigger } from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import type { SettingsTab } from "#lib/store/nav.svelte.ts"

export type Components = {
  agent: boolean
  shell: boolean
  files: boolean
  terminal: boolean
}

export type DesktopPage =
  | "general"
  | "appearance"
  | "dock"
  | "topbar"
  | "panel"
  | "launcher"
  | "tray"

export type DesktopSection =
  | "components"
  | "appearance"
  | "dock"
  | "topbar"
  | "panel"
  | "launcher"
  | "tray"
  | "clock"
  | "media"
  | "claude"

export const DESKTOP_PAGES: {
  id: DesktopPage
  label: string
  icon: string
}[] = [
  { id: "general", label: m.settings_general(), icon: "lucide:settings" },
  { id: "appearance", label: m.settings_appearance(), icon: "lucide:palette" },
  { id: "dock", label: m.desktop_dock(), icon: "lucide:panel-bottom" },
  { id: "topbar", label: m.desktop_topbar(), icon: "lucide:panel-top" },
  { id: "panel", label: m.desktop_panel(), icon: "lucide:calendar" },
  { id: "launcher", label: m.desktop_launcher(), icon: "lucide:search" },
  { id: "tray", label: m.desktop_tray(), icon: "lucide:layout-grid" },
]

export const DESKTOP_SECTIONS: {
  id: DesktopSection
  page: DesktopPage
  label: string
  icon: string
}[] = [
  {
    id: "components",
    page: "general",
    label: m.desktop_components(),
    icon: "lucide:blocks",
  },
  {
    id: "appearance",
    page: "appearance",
    label: m.settings_appearance(),
    icon: "lucide:palette",
  },
  {
    id: "dock",
    page: "dock",
    label: m.desktop_dock(),
    icon: "lucide:panel-bottom",
  },
  {
    id: "topbar",
    page: "topbar",
    label: m.desktop_topbar(),
    icon: "lucide:panel-top",
  },
  {
    id: "panel",
    page: "panel",
    label: m.desktop_panel(),
    icon: "lucide:calendar",
  },
  {
    id: "launcher",
    page: "launcher",
    label: m.desktop_launcher(),
    icon: "lucide:search",
  },
  {
    id: "tray",
    page: "tray",
    label: m.desktop_tray(),
    icon: "lucide:layout-grid",
  },
  { id: "clock", page: "tray", label: m.desktop_clock(), icon: "lucide:clock" },
  { id: "media", page: "tray", label: m.desktop_media(), icon: "lucide:music" },
  {
    id: "claude",
    page: "tray",
    label: m.desktop_claude(),
    icon: "lucide:gauge",
  },
]

export const MAIN_SETTINGS = "main:settings"

export const TRIGGERS: { id: LauncherTrigger; label: string }[] = [
  { id: "win", label: m.desktop_trigger_win() },
  { id: "shortcut", label: m.desktop_trigger_shortcut() },
  { id: "both", label: m.desktop_trigger_both() },
]

export const openMainSettings = (tab: SettingsTab) =>
  emitTo("main", MAIN_SETTINGS, tab)

export const openDesktopSettings = (section?: DesktopSection) =>
  invoke<void>("desktop_settings_open", { section: section ?? null })

export const loadComponents = () => invoke<Components>("desktop_components_get")

export const launchedComponents = () =>
  invoke<Components>("desktop_components_launched")

export const agentLaunched = () =>
  launchedComponents()
    .then(c => c.agent)
    .catch(() => true)

export const saveComponents = (components: Components) =>
  invoke<void>("desktop_components_set", { components })
