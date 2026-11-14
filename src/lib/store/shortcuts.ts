import { m } from "#lib/paraglide/messages.js"
import { layout } from "#lib/widgets/layout.svelte.ts"
import { nav, openConversation, setSidebar } from "./nav.svelte.ts"
import { panes } from "./panes.svelte.ts"

export type Shortcut = {
  keys: string[]
  label: string
  icon: string
  matches: (e: KeyboardEvent) => boolean
  run: () => void
}

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey

export const SHORTCUTS: Shortcut[] = [
  {
    keys: ["Ctrl", "K"],
    label: m.shortcut_palette(),
    icon: "lucide:search",
    matches: e => mod(e) && e.key.toLowerCase() === "k",
    run: () => {
      nav.palette = !nav.palette
    },
  },
  {
    keys: ["Ctrl", "F"],
    label: m.shortcut_find(),
    icon: "lucide:text-search",
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "f",
    run: () => {
      nav.find = true
    },
  },
  {
    keys: ["Ctrl", ","],
    label: m.common_settings(),
    icon: "lucide:settings",
    matches: e => mod(e) && e.key === ",",
    run: () => {
      nav.settings = !nav.settings
    },
  },
  {
    keys: ["Ctrl", "N"],
    label: m.shortcut_new(),
    icon: "lucide:square-pen",
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "n",
    run: () => openConversation(null),
  },
  {
    keys: ["Ctrl", "E"],
    label: m.widget_edit(),
    icon: "lucide:layout-dashboard",
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "e",
    run: () => {
      layout.editing = !layout.editing
    },
  },
  {
    keys: ["Ctrl", "B"],
    label: m.shortcut_sidebar(),
    icon: "lucide:panel-left",
    matches: e => mod(e) && e.key.toLowerCase() === "b",
    run: () => setSidebar(!nav.sidebar),
  },
  {
    keys: ["Ctrl", "\\"],
    label: m.shell_split_right(),
    icon: "lucide:columns-2",
    matches: e => mod(e) && !e.shiftKey && e.code === "Backslash",
    run: () => panes.split(panes.active.id, "right"),
  },
  {
    keys: ["Ctrl", "Shift", "\\"],
    label: m.shell_split_down(),
    icon: "lucide:rows-2",
    matches: e => mod(e) && e.shiftKey && e.code === "Backslash",
    run: () => panes.split(panes.active.id, "bottom"),
  },
  {
    keys: ["Ctrl", "W"],
    label: m.shortcut_close_pane(),
    icon: "lucide:x",
    matches: e => mod(e) && e.key.toLowerCase() === "w",
    run: () => panes.close(panes.active.id),
  },
  {
    keys: ["Ctrl", "Shift", "H"],
    label: m.shortcut_harness(),
    icon: "lucide:bot",
    matches: e => mod(e) && e.shiftKey && e.key.toLowerCase() === "h",
    run: () => {
      nav.page = nav.page === "agent" ? "chat" : "agent"
    },
  },
]

export const handleShortcut = (e: KeyboardEvent) => {
  const found = SHORTCUTS.find(s => s.matches(e))

  if (found) {
    e.preventDefault()
    found.run()
  }
}
