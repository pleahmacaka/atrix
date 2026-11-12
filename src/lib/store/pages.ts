import { m } from "#lib/paraglide/messages.js"
import type { Page } from "./nav.svelte.ts"

export const PAGES: { id: Page; label: () => string; icon: string }[] = [
  { id: "chat", label: m.shell_page_chat, icon: "lucide:messages-square" },
  { id: "knowledge", label: m.shell_page_knowledge, icon: "lucide:library" },
  { id: "agent", label: m.shell_page_agent, icon: "lucide:bot" },
  {
    id: "devices",
    label: m.shell_page_devices,
    icon: "lucide:monitor-smartphone",
  },
]
