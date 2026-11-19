import { m } from "#lib/paraglide/messages.js"
import type { MenuAction } from "#lib/store/contextMenu.svelte.ts"
import { VIEW_LABELS } from "../labels"
import type { Explorer } from "./explorer.svelte"
import {
  prefs,
  VIEW_ICONS,
  VIEW_KEYS,
  VIEWS,
  type ViewMode,
} from "./prefs.svelte"
import { toggleTerminal } from "./terminal.svelte"

export type Command = {
  label: () => string
  icon: string
  keys?: string[]
  globalKeys?: string[]
  captureKeys?: string[]
  enabled?: (x: Explorer) => boolean
  run: (x: Explorer) => unknown
}

const selected = (x: Explorer) => x.selected.length > 0

const local = (x: Explorer) =>
  x.tab.kind !== "archive" && x.tab.kind !== "device"

const editable = (x: Explorer) => selected(x) && local(x)

const viewCommand = (mode: ViewMode): Command => ({
  label: VIEW_LABELS[mode],
  icon: VIEW_ICONS[mode],
  globalKeys: [`Ctrl+Shift+${VIEW_KEYS[mode]}`],
  enabled: x => x.arrangeable,
  run: x => x.setView(mode),
})

const BASE = {
  refresh: {
    label: m.files_nav_refresh,
    icon: "lucide:rotate-cw",
    globalKeys: ["F5", "Ctrl+R"],
    run: x => x.tab.refresh(),
  },
  newTab: {
    label: m.files_tabs_new,
    icon: "lucide:plus",
    globalKeys: ["Ctrl+T"],
    run: x => x.newTab(),
  },
  closeTab: {
    label: m.files_tabs_close,
    icon: "lucide:x",
    globalKeys: ["Ctrl+W"],
    run: x => x.close(),
  },
  nextTab: {
    label: m.files_tabs_next,
    icon: "lucide:chevron-right",
    globalKeys: ["Ctrl+Tab"],
    run: x => x.cycleTab(1),
  },
  previousTab: {
    label: m.files_tabs_previous,
    icon: "lucide:chevron-left",
    globalKeys: ["Ctrl+Shift+Tab"],
    run: x => x.cycleTab(-1),
  },
  newFolder: {
    label: m.files_commands_new_folder,
    icon: "lucide:folder-plus",
    globalKeys: ["Ctrl+Shift+N"],
    enabled: x => x.filesystem,
    run: x => x.newFolder(),
  },
  newWindow: {
    label: m.files_commands_new_window,
    icon: "lucide:app-window",
    globalKeys: ["Ctrl+N"],
    run: x => x.openWindow(x.tab.location),
  },
  back: {
    label: m.files_nav_back,
    icon: "lucide:arrow-left",
    globalKeys: ["Alt+ArrowLeft"],
    keys: ["Backspace"],
    enabled: x => x.tab.canBack,
    run: x => x.tab.back(),
  },
  forward: {
    label: m.files_nav_forward,
    icon: "lucide:arrow-right",
    globalKeys: ["Alt+ArrowRight"],
    enabled: x => x.tab.canForward,
    run: x => x.tab.forward(),
  },
  up: {
    label: m.files_nav_up,
    icon: "lucide:arrow-up",
    globalKeys: ["Alt+ArrowUp"],
    enabled: x => x.tab.canUp,
    run: x => x.tab.up(),
  },
  preview: {
    label: m.files_commands_preview,
    icon: "lucide:panel-right",
    globalKeys: ["Alt+P"],
    run: () => {
      prefs.preview = !prefs.preview
    },
  },
  properties: {
    label: m.files_commands_properties,
    icon: "lucide:info",
    globalKeys: ["Alt+Enter"],
    enabled: local,
    run: x => x.properties(),
  },
  open: {
    label: m.files_commands_open,
    icon: "lucide:square-arrow-out-up-right",
    keys: ["Enter"],
    enabled: selected,
    run: x => x.openSelected(),
  },
  rename: {
    label: m.files_commands_rename,
    icon: "lucide:pencil",
    keys: ["F2"],
    enabled: x => x.selected.length === 1 && x.renamable(x.selected[0]),
    run: x => x.rename(),
  },
  delete: {
    label: m.files_commands_delete,
    icon: "lucide:trash-2",
    keys: ["Delete"],
    enabled: editable,
    run: x => x.remove(false),
  },
  deletePermanently: {
    label: m.files_commands_delete_permanently,
    icon: "lucide:trash-2",
    keys: ["Shift+Delete"],
    enabled: editable,
    run: x => x.remove(true),
  },
  cut: {
    label: m.files_commands_cut,
    icon: "lucide:scissors",
    keys: ["Ctrl+X"],
    enabled: editable,
    run: x => x.clip(true),
  },
  copy: {
    label: m.files_commands_copy,
    icon: "lucide:copy",
    keys: ["Ctrl+C"],
    enabled: editable,
    run: x => x.clip(false),
  },
  copyPath: {
    label: m.files_commands_copy_path,
    icon: "lucide:link",
    keys: ["Ctrl+Shift+C"],
    enabled: selected,
    run: x => x.copyPath(),
  },
  paste: {
    label: m.files_commands_paste,
    icon: "lucide:clipboard-paste",
    keys: ["Ctrl+V"],
    enabled: x => x.filesystem,
    run: x => x.paste(),
  },
  selectAll: {
    label: m.files_commands_select_all,
    icon: "lucide:check-check",
    keys: ["Ctrl+A"],
    run: x => x.selectAll(),
  },
  selectNone: {
    label: m.files_commands_select_none,
    icon: "lucide:square-dashed",
    run: x => x.tab.select([]),
  },
  invertSelection: {
    label: m.files_commands_invert_selection,
    icon: "lucide:arrow-left-right",
    run: x => x.invertSelection(),
  },
  restore: {
    label: m.files_commands_restore,
    icon: "lucide:undo-2",
    enabled: selected,
    run: x => x.restore(),
  },
  emptyBin: {
    label: m.files_commands_empty_recycle_bin,
    icon: "lucide:trash",
    run: x => x.emptyBin(),
  },
  settings: {
    label: m.files_commands_settings,
    icon: "lucide:settings",
    run: x => {
      x.settingsOpen = true
    },
  },
  terminal: {
    label: m.files_terminal_title,
    icon: "lucide:square-terminal",
    captureKeys: ["Ctrl+Backquote"],
    run: () => toggleTerminal(),
  },
} satisfies Record<string, Command>

export type CommandId = keyof typeof BASE | `view.${ViewMode}`

export const COMMANDS: Record<CommandId, Command> = {
  ...BASE,
  ...(Object.fromEntries(
    VIEWS.map(mode => [`view.${mode}`, viewCommand(mode)]),
  ) as Record<`view.${ViewMode}`, Command>),
}

const keyName = (e: KeyboardEvent) => {
  if (e.code.startsWith("Key")) {
    return e.code.slice(3)
  }

  if (e.code.startsWith("Digit")) {
    return e.code.slice(5)
  }

  if (e.code === "Backquote") {
    return e.code
  }

  return e.key === " " ? "Space" : e.key
}

export const comboOf = (e: KeyboardEvent) =>
  [
    e.ctrlKey || e.metaKey ? "Ctrl" : "",
    e.shiftKey ? "Shift" : "",
    e.altKey ? "Alt" : "",
    keyName(e),
  ]
    .filter(Boolean)
    .join("+")

const bind = (field: "keys" | "globalKeys" | "captureKeys") =>
  new Map(
    (Object.entries(COMMANDS) as [CommandId, Command][]).flatMap(
      ([id, command]) => (command[field] ?? []).map(combo => [combo, id]),
    ),
  )

export const BINDINGS = {
  local: bind("keys"),
  global: bind("globalKeys"),
  capture: bind("captureKeys"),
}

export const usable = (id: CommandId, x: Explorer) =>
  COMMANDS[id].enabled?.(x) ?? true

export const runCommand = (id: CommandId, x: Explorer) => {
  if (usable(id, x)) {
    COMMANDS[id].run(x)
  }
}

const DISPLAY: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Delete: "Del",
  Backquote: "`",
}

export const hintOf = (id: CommandId) => {
  const { globalKeys = [], keys = [], captureKeys = [] } = COMMANDS[id]
  const combo = [...globalKeys, ...keys, ...captureKeys][0]

  return combo
    ?.split("+")
    .map(part => DISPLAY[part] ?? part)
    .join("+")
}

export const menuItem = (id: CommandId, x: Explorer): MenuAction => ({
  label: COMMANDS[id].label(),
  icon: COMMANDS[id].icon,
  hint: hintOf(id),
  disabled: !usable(id, x),
  run: () => COMMANDS[id].run(x),
})
