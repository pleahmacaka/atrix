import { lockKind, screen } from "#lib/lock/lock.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { goPage, nav, openConversation, openSettings } from "./nav.svelte.ts"
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
    matches: e => mod(e) && e.key.toLowerCase() === "k",
    run: () => {
      nav.palette = !nav.palette
    },
  },
  {
    id: "find",
    keys: ["Ctrl", "F"],
    label: m.shortcut_find(),
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "f",
    run: () => {
      nav.find = true
    },
  },
  {
    id: "settings",
    keys: ["Ctrl", ","],
    label: m.common_settings(),
    matches: e => mod(e) && e.key === ",",
    run: () => {
      if (nav.settingsOpen) {
        nav.settingsOpen = false
      } else {
        openSettings(nav.settingsTab)
      }
    },
  },
  {
    id: "new",
    keys: ["Ctrl", "N"],
    label: m.shortcut_new(),
    matches: e => mod(e) && !e.shiftKey && e.key.toLowerCase() === "n",
    run: () => openConversation(null),
  },
  {
    id: "sidebar",
    keys: ["Ctrl", "B"],
    label: m.shortcut_sidebar(),
    matches: e => mod(e) && e.key.toLowerCase() === "b",
    run: shell.toggle,
  },
  {
    id: "splitRight",
    keys: ["Ctrl", "\\"],
    label: m.shell_split_right(),
    matches: e => mod(e) && !e.shiftKey && e.code === "Backslash",
    run: () => panes.split(panes.active.id, "right"),
  },
  {
    id: "splitDown",
    keys: ["Ctrl", "Shift", "\\"],
    label: m.shell_split_down(),
    matches: e => mod(e) && e.shiftKey && e.code === "Backslash",
    run: () => panes.split(panes.active.id, "bottom"),
  },
  {
    id: "closePane",
    keys: ["Ctrl", "W"],
    label: m.shortcut_close_pane(),
    matches: e => mod(e) && e.key.toLowerCase() === "w",
    run: () => panes.close(panes.active.id),
  },
  {
    id: "harness",
    keys: ["Ctrl", "Shift", "H"],
    label: m.shortcut_harness(),
    matches: e => mod(e) && e.shiftKey && e.key.toLowerCase() === "h",
    run: () => {
      goPage(nav.page === "agent" ? "chat" : "agent")
    },
  },
  {
    id: "focusInput",
    keys: ["/"],
    label: m.shortcut_focus_input(),
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
  if (screen.locked && lockKind()) {
    return
  }

  const found = SHORTCUTS.find(s => s.matches(e))

  if (found) {
    e.preventDefault()
    found.run(e)
  }
}
