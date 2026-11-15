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
  | null

export type Target =
  | { kind: "model"; gateway: string; model: string }
  | { kind: "harness"; host: string; harness: string; cwd: string }

export const nav = $state<{
  page: Page
  harness: { host: string; id: string } | null
  doc: string | null
  table: { name: string; table: string } | null
  target: Target
  palette: boolean
  find: boolean
  settings: boolean
  settingsTab: SettingsTab
}>({
  page: "chat",
  harness: null,
  doc: null,
  table: null,
  target: { kind: "model", gateway: "", model: "" },
  palette: false,
  find: false,
  settings: false,
  settingsTab: "appearance",
})

export const openSettings = (tab: SettingsTab) => {
  nav.settingsTab = tab
  nav.palette = false
  nav.settings = true
}

export const goPage = (page: Page) => {
  nav.page = page
  shell.closeDrawer()
}

export const openConversation = (current: Current) => {
  panes.open(current)
  goPage("chat")
}
