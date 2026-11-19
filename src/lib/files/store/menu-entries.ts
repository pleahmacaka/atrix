import { m } from "#lib/paraglide/messages.js"
import type { MenuAction } from "#lib/store/contextMenu.svelte.ts"
import { COMMANDS, type CommandId, menuItem } from "./commands"
import type { Explorer } from "./explorer.svelte"

export type FileAction = MenuAction & { id?: string }

type Look = { label: () => string; icon: string }

const command = (id: CommandId): Look => ({
  label: COMMANDS[id].label,
  icon: COMMANDS[id].icon,
})

const LOOKS: Record<string, Look> = {
  open: command("open"),
  openInNewTab: {
    label: m.files_commands_open_in_new_tab,
    icon: "lucide:panel-top",
  },
  openInNewWindow: {
    label: m.files_commands_open_in_new_window,
    icon: "lucide:app-window",
  },
  openWith: { label: m.files_commands_open_with, icon: "lucide:layout-grid" },
  view: { label: m.files_commands_view, icon: "lucide:table-2" },
  refresh: command("refresh"),
  extractHere: {
    label: m.files_bandizip_extract_here,
    icon: "lucide:package-open",
  },
  extractAuto: {
    label: m.files_bandizip_extract_auto,
    icon: "lucide:wand-sparkles",
  },
  extractNamed: {
    label: m.files_settings_context_menu_items_extract_named,
    icon: "lucide:folder-output",
  },
  compressZip: {
    label: m.files_settings_context_menu_items_compress_zip,
    icon: "lucide:file-archive",
  },
  compress7z: {
    label: m.files_settings_context_menu_items_compress7z,
    icon: "lucide:file-archive",
  },
  compressEach: {
    label: m.files_bandizip_compress_each,
    icon: "lucide:files",
  },
  cut: command("cut"),
  copy: command("copy"),
  paste: command("paste"),
  copyPath: command("copyPath"),
  rename: command("rename"),
  resetName: {
    label: m.files_commands_reset_name,
    icon: "lucide:rotate-ccw",
  },
  delete: command("delete"),
  restore: command("restore"),
  deletePermanently: command("deletePermanently"),
  newFolder: command("newFolder"),
  emptyBin: command("emptyBin"),
  pin: { label: m.files_commands_pin, icon: "lucide:pin" },
  private: { label: m.files_commands_mark_private, icon: "lucide:eye-off" },
  eject: { label: m.files_commands_eject, icon: "lucide:eject" },
  hideDevice: { label: m.files_commands_hide_device, icon: "lucide:eye-off" },
  hiddenDevices: {
    label: m.files_commands_show_hidden_devices,
    icon: "lucide:eye",
  },
  disconnect: { label: m.files_commands_disconnect, icon: "lucide:unplug" },
  mapDrive: {
    label: m.files_commands_map_drive,
    icon: "lucide:hard-drive-upload",
  },
  unmapDrive: { label: m.files_commands_unmap_drive, icon: "lucide:unplug" },
  addNetworkLocation: {
    label: m.files_commands_add_network_location,
    icon: "lucide:folder-plus",
  },
  properties: command("properties"),
  moreOptions: {
    label: m.files_commands_more_options,
    icon: "lucide:ellipsis",
  },
}

export const LOCKED_ITEMS = ["moreOptions"]

export const entryLabel = (id: string) => LOOKS[id]?.label() ?? id

export const entryIcon = (id: string) => LOOKS[id]?.icon ?? "lucide:circle"

export const entry = (
  id: string,
  run: MenuAction["run"],
  extra: Partial<FileAction> = {},
): FileAction => ({
  id,
  label: entryLabel(id),
  icon: entryIcon(id),
  run,
  ...extra,
})

export const commandEntry = (id: CommandId, x: Explorer): FileAction => ({
  ...menuItem(id, x),
  id,
})
