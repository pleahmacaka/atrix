import { z } from "zod"
import { lockKind, screen } from "#lib/lock/lock.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { goPage, nav, openConversation, openSettings } from "./nav.svelte.ts"
import { panes, type Side } from "./panes.svelte.ts"
import { shell } from "./shell.svelte.ts"
import { Stored } from "./stored.svelte.ts"

export type ShortcutId =
  | "palette"
  | "find"
  | "settings"
  | "new"
  | "sidebar"
  | "splitRight"
  | "splitDown"
  | "closePane"
  | "lock"
  | "harness"
  | "focusInput"
  | "focusPane"

export type Shortcut = {
  id: ShortcutId
  label: string
  run: (e: KeyboardEvent) => void
} & (
  | { binding: string; when?: (e: KeyboardEvent) => boolean }
  | { keys: string[]; chords: string[]; when?: (e: KeyboardEvent) => boolean }
)

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
    binding: "Ctrl+KeyK",
    label: m.shortcut_palette(),
    run: () => {
      nav.palette = !nav.palette
    },
  },
  {
    id: "find",
    binding: "Ctrl+KeyF",
    label: m.shortcut_find(),
    run: () => {
      nav.find = true
    },
  },
  {
    id: "settings",
    binding: "Ctrl+Comma",
    label: m.common_settings(),
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
    binding: "Ctrl+KeyN",
    label: m.shortcut_new(),
    run: () => openConversation(null),
  },
  {
    id: "sidebar",
    binding: "Ctrl+KeyB",
    label: m.shortcut_sidebar(),
    run: shell.toggle,
  },
  {
    id: "splitRight",
    binding: "Ctrl+Backslash",
    label: m.shell_split_right(),
    run: () => panes.split(panes.active.id, "right"),
  },
  {
    id: "splitDown",
    binding: "Ctrl+Shift+Backslash",
    label: m.shell_split_down(),
    run: () => panes.split(panes.active.id, "bottom"),
  },
  {
    id: "closePane",
    binding: "Ctrl+KeyW",
    label: m.shortcut_close_pane(),
    run: () => panes.close(panes.active.id),
  },
  {
    id: "lock",
    binding: "Ctrl+KeyL",
    label: m.lock_now(),
    run: () => screen.lock(),
  },
  {
    id: "harness",
    binding: "Ctrl+Shift+KeyH",
    label: m.shortcut_harness(),
    run: () => {
      goPage(nav.page === "agent" ? "chat" : "agent")
    },
  },
  {
    id: "focusInput",
    binding: "Slash",
    label: m.shortcut_focus_input(),
    when: () => nav.page === "chat",
    run: () => {
      panes.typing = panes.active.id
    },
  },
  {
    id: "focusPane",
    keys: ["Alt", "←↑→↓"],
    chords: Object.keys(ARROWS).map(key => `Alt+${key}`),
    label: m.shortcut_focus_pane(),
    when: () => nav.page === "chat",
    run: e => panes.step(ARROWS[e.key]),
  },
]

const NAMES: Record<string, string> = {
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
}

const MODIFIERS = new Set(["Control", "Meta", "Alt", "Shift"])

const keyName = (code: string) => {
  if (code.startsWith("Key")) {
    return code.slice(3)
  }

  if (code.startsWith("Digit")) {
    return code.slice(5)
  }

  return NAMES[code] ?? code
}

export const chordOf = (e: KeyboardEvent) => {
  if (MODIFIERS.has(e.key) || !e.code) {
    return null
  }

  return [mod(e) && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.code]
    .filter(Boolean)
    .join("+")
}

const overrides = new Stored("shortcut:", null, z.string().nullable())

export const defaultOf = (id: ShortcutId) => {
  const found = SHORTCUTS.find(s => s.id === id)

  return found && "binding" in found ? found.binding : null
}

export const bindingOf = (id: ShortcutId) => overrides.get(id) ?? defaultOf(id)

export const rebind = (id: ShortcutId, chord: string | null) =>
  overrides.set(id, chord === defaultOf(id) ? null : chord)

const chordsOf = (shortcut: Shortcut) =>
  "chords" in shortcut ? shortcut.chords : [bindingOf(shortcut.id)]

export const conflictOf = (id: ShortcutId, chord: string) =>
  SHORTCUTS.find(s => s.id !== id && chordsOf(s).includes(chord))

export const assignable = (chord: string) => {
  const key = chord.startsWith("Shift+") ? chord.slice(6) : chord

  return !key.startsWith("Key") && !key.startsWith("Digit")
}

export const keysFor = (shortcut: Shortcut) =>
  "keys" in shortcut
    ? shortcut.keys
    : (bindingOf(shortcut.id) ?? "").split("+").map(keyName)

export const keysOf = (id: ShortcutId) => {
  const found = SHORTCUTS.find(s => s.id === id)

  return found ? keysFor(found).join("+") : ""
}

export const withKeys = (label: string, id: ShortcutId) =>
  `${label} (${keysOf(id)})`

const fires = (shortcut: Shortcut, e: KeyboardEvent, chord: string | null) => {
  if (!chord || !chordsOf(shortcut).includes(chord)) {
    return false
  }

  const bare = !chord.startsWith("Ctrl+") && !chord.startsWith("Alt+")

  return (!bare || !editing(e)) && (shortcut.when?.(e) ?? true)
}

export const handleShortcut = (e: KeyboardEvent) => {
  if (screen.locked && lockKind()) {
    return
  }

  const chord = chordOf(e)
  const found = SHORTCUTS.find(s => fires(s, e, chord))

  if (found) {
    e.preventDefault()
    found.run(e)
  }
}
