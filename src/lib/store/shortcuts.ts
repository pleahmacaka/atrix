import { m } from "#lib/paraglide/messages.js"
import { goPage, nav, openConversation } from "./nav.svelte.ts"
import { panes, type Side } from "./panes.svelte.ts"
import { shell } from "./shell.svelte.ts"

export type ShortcutId =
  | "palette"
  | "find"
  | "settings"
  | "new"
  | "sidebar"
  | "splitRight"
  | "splitDown"
  | "closePane"
  | "harness"
  | "focusInput"
  | "focusPane"

export type Shortcut = {
  id: ShortcutId
  keys: string[]
  label: string
  icon: string
  matches: (e: KeyboardEvent) => boolean
  run: (e: KeyboardEvent) => void
}

const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey

const editing = (e: KeyboardEvent) =>
  e.target instanceof HTMLElement &&
  (e.target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))

const ARROWS: Record<string, Side> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "top",
  ArrowDown: "bottom",
}

export const SHORTCUTS: Shortcut[] = [
  {
    id: "palette",
    keys: ["Ctrl", "K"],
    label: m.shortcut_palette(),
    icon: "lucide:search",
    matches: e => mod(e) && e.key.toLowerCase() === "k",
    run: () => {
      nav.palette = !nav.palette
    },
  },
  {
    id: "find",
    keys: ["Ctrl", "F"],
    label: m.shortcut_find(),
    icon: "lucide:text-search",
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "f",
    run: () => {
      nav.find = true
    },
  },
  {
    id: "settings",
    keys: ["Ctrl", ","],
    label: m.common_settings(),
    icon: "lucide:settings",
    matches: e => mod(e) && e.key === ",",
    run: () => goPage(nav.page === "settings" ? "chat" : "settings"),
  },
  {
    id: "new",
    keys: ["Ctrl", "N"],
    label: m.shortcut_new(),
    icon: "lucide:square-pen",
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "n",
    run: () => openConversation(null),
  },
  {
    id: "sidebar",
    keys: ["Ctrl", "B"],
    label: m.shortcut_sidebar(),
    icon: "lucide:panel-left",
    matches: e => mod(e) && e.key.toLowerCase() === "b",
    run: shell.toggle,
  },
  {
    id: "splitRight",
    keys: ["Ctrl", "\\"],
    label: m.shell_split_right(),
    icon: "lucide:columns-2",
    matches: e => mod(e) && !e.shiftKey && e.code === "Backslash",
    run: () => panes.split(panes.active.id, "right"),
  },
  {
    id: "splitDown",
    keys: ["Ctrl", "Shift", "\\"],
    label: m.shell_split_down(),
    icon: "lucide:rows-2",
    matches: e => mod(e) && e.shiftKey && e.code === "Backslash",
    run: () => panes.split(panes.active.id, "bottom"),
  },
  {
    id: "closePane",
    keys: ["Ctrl", "W"],
    label: m.shortcut_close_pane(),
    icon: "lucide:x",
    matches: e => mod(e) && e.key.toLowerCase() === "w",
    run: () => panes.close(panes.active.id),
  },
  {
    id: "harness",
    keys: ["Ctrl", "Shift", "H"],
    label: m.shortcut_harness(),
    icon: "lucide:bot",
    matches: e => mod(e) && e.shiftKey && e.key.toLowerCase() === "h",
    run: () => {
      goPage(nav.page === "agent" ? "chat" : "agent")
    },
  },
  {
    id: "focusInput",
    keys: ["/"],
    label: m.shortcut_focus_input(),
    icon: "lucide:text-cursor-input",
    matches: e =>
      e.key === "/" &&
      !mod(e) &&
      !e.altKey &&
      nav.page === "chat" &&
      !editing(e),
    run: () => {
      panes.typing = panes.active.id
    },
  },
  {
    id: "focusPane",
    keys: ["Alt", "←↑→↓"],
    label: m.shortcut_focus_pane(),
    icon: "lucide:move",
    matches: e =>
      e.altKey &&
      !mod(e) &&
      !e.shiftKey &&
      e.key in ARROWS &&
      nav.page === "chat",
    run: e => panes.step(ARROWS[e.key]),
  },
]

export const keysOf = (id: ShortcutId) =>
  SHORTCUTS.find(s => s.id === id)?.keys.join("+")

export const withKeys = (label: string, id: ShortcutId) =>
  `${label} (${keysOf(id)})`

export const handleShortcut = (e: KeyboardEvent) => {
  const found = SHORTCUTS.find(s => s.matches(e))

  if (found) {
    e.preventDefault()
    found.run(e)
  }
}
