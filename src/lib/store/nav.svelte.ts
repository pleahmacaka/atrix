import { DEFAULT_MODEL } from "#lib/chat/chats.svelte.ts"
import { panes } from "./panes.svelte.ts"

export type Page = "chat" | "harness"

export type SettingsTab =
  | "appearance"
  | "harness"
  | "sync"
  | "openrouter"
  | "shortcuts"
  | "device"

export type Current =
  | { kind: "chat"; id: string }
  | { kind: "session"; host: string; id: string }
  | null

export type Target =
  | { kind: "openrouter"; model: string }
  | { kind: "harness"; host: string; harness: string; cwd: string }

const SIDEBAR = "sidebar-open"

export const nav = $state<{
  page: Page
  harness: { host: string; id: string } | null
  target: Target
  sidebar: boolean
  peek: boolean
  palette: boolean
  find: boolean
  settings: boolean
  settingsTab: SettingsTab
}>({
  page: "chat",
  harness: null,
  target: { kind: "openrouter", model: DEFAULT_MODEL },
  sidebar: localStorage.getItem(SIDEBAR) !== "false" && innerWidth >= 1024,
  peek: false,
  palette: false,
  find: false,
  settings: false,
  settingsTab: "appearance",
})

export const setSidebar = (open: boolean) => {
  nav.sidebar = open
  nav.peek = false
  localStorage.setItem(SIDEBAR, String(open))
}

export const openSettings = (tab: SettingsTab) => {
  nav.settingsTab = tab
  nav.palette = false
  nav.settings = true
}

export const openConversation = (current: Current) => {
  nav.page = "chat"
  panes.open(current)

  if (innerWidth < 1024) {
    nav.sidebar = false
  }
}
