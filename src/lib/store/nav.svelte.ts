import { panes } from "./panes.svelte.ts"
import { shell } from "./shell.svelte.ts"

export type Page =
  | "chat"
  | "knowledge"
  | "data"
  | "calendar"
  | "agent"
  | "apps"
  | "files"

export type SettingsTab =
  | "general"
  | "appearance"
  | "harness"
  | "datasource"
  | "gateway"
  | "channels"
  | "calendar"
  | "shortcuts"
  | "security"
  | "devices"

export type Current =
  | { kind: "chat"; id: string }
  | {
      kind: "session"
      host: string
      id: string
      agent?: { id: string; description: string }
    }
  | null

export type Target =
  | { kind: "model"; gateway: string; model: string }
  | { kind: "harness"; host: string; harness: string; cwd: string }
  | { kind: "agent"; id: string; cwd: string }

export const nav = $state<{
  page: Page
  harness: { host: string; id: string } | null
  doc: string | null
  agent: string | null
  table: { name: string; table: string } | null
  target: Target
  space: { host: string; id: string } | null
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
  space: null,
  palette: false,
  find: false,
  settingsTab: "general",
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
  nav.space = null

  panes.show(current)
  goPage("chat")
}
