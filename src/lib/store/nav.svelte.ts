import { panes } from "./panes.svelte.ts"
import { shell } from "./shell.svelte.ts"

export type Page =
  | "chat"
  | "knowledge"
  | "data"
  | "calendar"
  | "agent"
  | "devices"
  | "apps"
  | "settings"

export type SettingsTab =
  | "appearance"
  | "harness"
  | "datasource"
  | "gateway"
  | "channels"
  | "shortcuts"
  | "device"

export type Current =
  | { kind: "chat"; id: string }
  | { kind: "session"; host: string; id: string }
  | { kind: "group"; id: string }
  | null

export type Target =
  | { kind: "model"; gateway: string; model: string }
  | { kind: "harness"; host: string; harness: string; cwd: string }

export const nav = $state<{
  page: Page
  harness: { host: string; id: string } | null
  doc: string | null
  agent: string | null
  table: { name: string; table: string } | null
  target: Target
  palette: boolean
  find: boolean
  settingsTab: SettingsTab
  settingsOpen: boolean
}>({
  page: "chat",
  harness: null,
  doc: null,
  agent: null,
  table: null,
  target: { kind: "model", gateway: "", model: "" },
  palette: false,
  find: false,
  settingsTab: "appearance",
  settingsOpen: false,
})

export const goPage = (page: Page) => {
  nav.page = page
  shell.closeDrawer()
}

export const openSettings = (tab: SettingsTab) => {
  nav.settingsTab = tab
  nav.palette = false
  nav.settingsOpen = true
}

export const openConversation = (current: Current) => {
  panes.show(current)
  goPage("chat")
}
