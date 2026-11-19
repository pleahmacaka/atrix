import type { BarId } from "#lib/desktop/dock/zones.ts"
import type {
  ShellItemKind,
  ShellZoneId,
  ShellZoneSize,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"

export const ICONS: Record<ShellItemKind, string> = {
  launcher: "lucide:rocket",
  apps: "lucide:app-window",
  taskview: "lucide:layout-grid",
  claude: "simple-icons:claude",
  tray: "lucide:shapes",
  media: "lucide:music",
  input: "lucide:languages",
  meters: "lucide:cpu",
  network: "lucide:wifi",
  bluetooth: "lucide:bluetooth",
  battery: "lucide:battery-medium",
  volume: "lucide:volume-2",
  clock: "lucide:clock",
  bell: "lucide:bell",
  settings: "lucide:settings",
  desktop: "lucide:monitor",
  separator: "lucide:separator-vertical",
}

export const LABELS: Record<ShellItemKind, () => string> = {
  launcher: m.dock_item_launcher,
  apps: m.dock_item_apps,
  taskview: m.dock_item_taskview,
  claude: m.dock_item_claude,
  tray: m.dock_item_tray,
  media: m.dock_item_media,
  input: m.dock_item_input,
  meters: m.dock_item_meters,
  network: m.dock_item_network,
  bluetooth: m.dock_item_bluetooth,
  battery: m.dock_item_battery,
  volume: m.dock_item_volume,
  clock: m.dock_item_clock,
  bell: m.dock_item_bell,
  settings: m.dock_item_settings,
  desktop: m.dock_item_desktop,
  separator: m.dock_item_separator,
}

export const ZONE_LABELS: Record<ShellZoneId, () => string> = {
  start: m.dock_zone_start,
  center: m.dock_zone_center,
  end: m.dock_zone_end,
}

export const SIZE_LABELS: Record<ShellZoneSize, () => string> = {
  auto: m.dock_zone_size_auto,
  compact: m.dock_zone_size_compact,
  regular: m.dock_zone_size_regular,
}

type Place = { move: () => string; add: () => string }

export const PLACES: Record<BarId, Record<ShellZoneId, Place>> = {
  top: {
    start: { move: m.dock_move_top_start, add: m.dock_add_top_start },
    center: { move: m.dock_move_top_center, add: m.dock_add_top_center },
    end: { move: m.dock_move_top_end, add: m.dock_add_top_end },
  },
  dock: {
    start: { move: m.dock_move_dock_start, add: m.dock_add_dock_start },
    center: { move: m.dock_move_dock_center, add: m.dock_add_dock_center },
    end: { move: m.dock_move_dock_end, add: m.dock_add_dock_end },
  },
}
