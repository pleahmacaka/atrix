import { m } from "#lib/paraglide/messages.js"
import type { Page } from "./nav.svelte.ts"

type PageInfo = { id: Page; label: () => string; icon: string }

export const APPS_PAGE: PageInfo = {
  id: "apps",
  label: m.apps_title,
  icon: "lucide:layout-grid",
}

export const CALENDAR_PAGE: PageInfo = {
  id: "calendar",
  label: m.shell_page_calendar,
  icon: "lucide:calendar",
}

export const SETTINGS_PAGE = {
  label: m.common_settings,
  icon: "lucide:settings",
} satisfies Omit<PageInfo, "id">

export const PAGES: PageInfo[] = [
  { id: "chat", label: m.shell_page_chat, icon: "lucide:messages-square" },
  { id: "agent", label: m.shell_page_agent, icon: "lucide:contact-round" },
  { id: "knowledge", label: m.shell_page_knowledge, icon: "lucide:library" },
  { id: "data", label: m.shell_page_data, icon: "lucide:database" },
  {
    id: "devices",
    label: m.shell_page_devices,
    icon: "lucide:monitor-smartphone",
  },
]
