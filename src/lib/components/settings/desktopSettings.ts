import type { LauncherTrigger } from "@atrix/settings"
import { invoke } from "@tauri-apps/api/core"
import { emitTo } from "@tauri-apps/api/event"
import { m } from "#lib/paraglide/messages.js"

export type Components = { shell: boolean; files: boolean; terminal: boolean }

export type DesktopSection =
  | "components"
  | "dock"
  | "topbar"
  | "panel"
  | "launcher"
  | "tray"
  | "clock"
  | "media"
  | "claude"
  | "experimental"

export const DESKTOP_SECTIONS: {
  id: DesktopSection
  label: string
  icon: string
}[] = [
  {
    id: "components",
    label: m.desktop_components(),
    icon: "lucide:blocks",
  },
  { id: "dock", label: m.desktop_dock(), icon: "lucide:panel-bottom" },
  { id: "topbar", label: m.desktop_topbar(), icon: "lucide:panel-top" },
  { id: "panel", label: m.desktop_panel(), icon: "lucide:calendar" },
  { id: "launcher", label: m.desktop_launcher(), icon: "lucide:search" },
  { id: "tray", label: m.desktop_tray(), icon: "lucide:layout-grid" },
  { id: "clock", label: m.desktop_clock(), icon: "lucide:clock" },
  { id: "media", label: m.desktop_media(), icon: "lucide:music" },
  { id: "claude", label: m.desktop_claude(), icon: "lucide:gauge" },
  {
    id: "experimental",
    label: m.desktop_experimental(),
    icon: "lucide:flask-conical",
  },
]

export const DESKTOP_SETTINGS = "desktop:settings"

export const TRIGGERS: { id: LauncherTrigger; label: string }[] = [
  { id: "win", label: m.desktop_trigger_win() },
  { id: "shortcut", label: m.desktop_trigger_shortcut() },
  { id: "both", label: m.desktop_trigger_both() },
]

export const openDesktopSettings = (section?: DesktopSection) =>
  emitTo("main", DESKTOP_SETTINGS, section ?? null)

export const loadComponents = () => invoke<Components>("desktop_components_get")

export const saveComponents = (components: Components) =>
  invoke<void>("desktop_components_set", { components })
