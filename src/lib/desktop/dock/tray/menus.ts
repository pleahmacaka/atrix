import { exit } from "@tauri-apps/plugin-process"
import { openDesktopSettings } from "#lib/components/settings/desktopSettings.ts"
import { startEdit } from "#lib/desktop/edit/edit.svelte.ts"
import * as native from "#lib/desktop/native/index.js"
import {
  type ShellItemKind,
  updateDevice,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import type { MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { FLAGS } from "../zones"

export const openSettings = () => openDesktopSettings().catch(() => undefined)

const hide = (kind: ShellItemKind): MenuItem[] => {
  const flag = FLAGS[kind]

  if (!flag) {
    return []
  }

  return [
    {
      label: m.dock_hide(),
      icon: "lucide:eye-off",
      run: () =>
        updateDevice(device => ({ ...device, [flag]: false })).catch(
          () => undefined,
        ),
    },
  ]
}

const editLayout: MenuItem = {
  label: m.dock_edit_layout(),
  icon: "lucide:layout-template",
  run: startEdit,
}

export const barMenu = (settingsShown: boolean): MenuItem[] => [
  editLayout,
  {
    label: m.dock_task_manager(),
    icon: "lucide:activity",
    run: () => native.runCommand("taskmgr"),
  },
  {
    label: settingsShown
      ? m.dock_hide_settings_button()
      : m.dock_show_settings_button(),
    icon: "lucide:settings-2",
    run: () =>
      updateDevice(device => ({
        ...device,
        showSettingsButton: !settingsShown,
      })).catch(() => undefined),
  },
  "separator",
  { label: m.common_settings(), icon: "lucide:settings", run: openSettings },
]

const settingsMenu = (): MenuItem[] => [
  { label: m.common_settings(), icon: "lucide:settings", run: openSettings },
  {
    label: m.dock_calendar(),
    icon: "lucide:calendar",
    run: () => native.toggleWindow("panel"),
  },
  "separator",
  {
    label: m.dock_lock(),
    icon: "lucide:lock",
    run: () => native.powerAction("lock"),
  },
  {
    label: m.dock_sleep(),
    icon: "lucide:moon",
    run: () => native.powerAction("sleep"),
  },
  {
    label: m.dock_restart(),
    icon: "lucide:rotate-ccw",
    confirm: m.dock_restart_confirm(),
    run: () => native.powerAction("restart"),
  },
  {
    label: m.dock_shutdown(),
    icon: "lucide:power",
    confirm: m.dock_shutdown_confirm(),
    run: () => native.powerAction("shutdown"),
  },
  "separator",
  ...hide("settings"),
  {
    label: m.dock_quit(),
    icon: "lucide:circle-x",
    danger: true,
    confirm: m.dock_quit_confirm(),
    run: () => exit(0),
  },
]

const noticesMenu = (): MenuItem[] => [
  {
    label: m.dock_windows_notifications(),
    icon: "lucide:bell-ring",
    run: () => native.quickAction("notifications"),
  },
  {
    label: m.dock_quick_settings(),
    icon: "lucide:sliders-horizontal",
    run: () => native.quickAction("quicksettings"),
  },
  {
    label: m.dock_focus_assist(),
    icon: "lucide:moon-star",
    run: () => native.openUrl("ms-settings:quiethours"),
  },
  {
    label: m.dock_notification_settings(),
    icon: "lucide:settings-2",
    run: () => native.openUrl("ms-settings:notifications"),
  },
  "separator",
  ...hide("bell"),
]

export const itemMenu = (
  kind: ShellItemKind,
  volume: native.Volume | null,
  toggleMute: () => void,
): MenuItem[] => {
  if (kind === "settings") {
    return settingsMenu()
  }

  if (kind === "bell") {
    return noticesMenu()
  }

  const extra: MenuItem[] = []

  if (kind === "volume" && volume) {
    extra.push({
      label: volume.muted ? m.dock_unmute() : m.dock_mute(),
      icon: volume.muted ? "lucide:volume-2" : "lucide:volume-x",
      run: toggleMute,
    })
  }

  if (kind === "input") {
    extra.push({
      label: m.dock_language_settings(),
      icon: "lucide:settings-2",
      run: () => native.openUrl("ms-settings:regionlanguage"),
    })
  }

  const hidden = hide(kind)
  const items = [
    ...extra,
    ...(extra.length && hidden.length ? (["separator"] as const) : []),
    ...hidden,
  ]

  return items.length > 0 ? [...items, "separator", editLayout] : [editLayout]
}
