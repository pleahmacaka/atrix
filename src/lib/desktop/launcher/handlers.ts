import { updateDevice } from "@atrix/settings"
import { openDesktopSettings } from "#lib/components/settings/desktopSettings.ts"
import { editing } from "#lib/desktop/edit/index.js"
import { type PowerAction, powerAction } from "#lib/desktop/native/system.js"
import { hideWindow } from "#lib/desktop/native/windows.js"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { powerLabel } from "./commands"
import type { Launcher } from "./launcher.svelte"

const PAGE = 5

const POWER: [PowerAction, string][] = [
  ["lock", "lucide:lock"],
  ["sleep", "lucide:moon"],
  ["restart", "lucide:rotate-cw"],
  ["shutdown", "lucide:power"],
]

export const keydown = (launcher: Launcher, e: KeyboardEvent) => {
  if (contextMenu.current) {
    return
  }

  if (e.altKey && e.key >= "1" && e.key <= "9") {
    e.preventDefault()
    launcher.run(launcher.flat[Number(e.key) - 1])

    return
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault()
      launcher.move(1)

      return
    case "ArrowUp":
      e.preventDefault()
      launcher.move(-1)

      return
    case "PageDown":
      e.preventDefault()
      launcher.cursor = Math.max(
        0,
        Math.min(launcher.active + PAGE, launcher.flat.length - 1),
      )

      return
    case "PageUp":
      e.preventDefault()
      launcher.cursor = Math.max(launcher.active - PAGE, 0)

      return
    case "Tab":
      e.preventDefault()
      launcher.jumpGroup(e.shiftKey ? -1 : 1)

      return
    case "Enter":
      if (e.isComposing) {
        return
      }

      e.preventDefault()
      launcher.run(
        launcher.current,
        e.shiftKey ? "admin" : e.ctrlKey ? "location" : "open",
      )

      return
    case "Escape":
      e.preventDefault()

      if (launcher.query) {
        launcher.setQuery("")
      } else {
        launcher.hide()
      }

      return
    case "ContextMenu":
      e.preventDefault()
      launcher.openMenuAtActive()

      return
  }

  const typing = e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey

  if (typing && document.activeElement !== launcher.input) {
    launcher.input?.focus()
  }
}

export const pointerdown = (e: PointerEvent) => {
  const target = e.target instanceof Element ? e.target : null

  if (
    contextMenu.current ||
    e.button !== 0 ||
    editing.on ||
    target?.closest("[data-launcher]")
  ) {
    return
  }

  hideWindow("launcher").catch(() => undefined)
}

const backdropItems = (launcher: Launcher): MenuItem[] => [
  {
    label: launcher.query
      ? m.launcher_search_clear()
      : m.launcher_search_focus(),
    icon: launcher.query ? "lucide:eraser" : "lucide:search",
    run: () => {
      launcher.setQuery("")
      launcher.input?.focus()
    },
  },
  {
    label: launcher.device.showKeymap
      ? m.launcher_keymap_hide()
      : m.launcher_keymap_show(),
    icon: launcher.device.showKeymap ? "lucide:eye-off" : "lucide:eye",
    run: () => updateDevice(d => ({ ...d, showKeymap: !d.showKeymap })),
  },
  "separator",
  {
    label: m.launcher_cmd_desktop_settings(),
    icon: "lucide:settings",
    run: () => openDesktopSettings(),
  },
  "separator",
  ...POWER.map(([id, icon]) => ({
    label: powerLabel(id),
    icon,
    run: () => powerAction(id),
  })),
]

export const contextmenu = (launcher: Launcher, e: MouseEvent) => {
  const target = e.target instanceof Element ? e.target : null

  if (target?.closest("[data-launcher]")) {
    return
  }

  contextMenu.show(e, backdropItems(launcher))
}
