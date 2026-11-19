import { m } from "#lib/paraglide/messages.js"
import type { DriveKind, KnownId } from "./native"
import type {
  GroupKey,
  SidebarSection,
  SortKey,
  ViewMode,
} from "./store/prefs.svelte"

export const KNOWN_LABELS: Record<KnownId, () => string> = {
  home: m.files_places_home,
  desktop: m.files_places_desktop,
  downloads: m.files_places_downloads,
  documents: m.files_places_documents,
  pictures: m.files_places_pictures,
  music: m.files_places_music,
  videos: m.files_places_videos,
}

export const DRIVE_LABELS: Record<DriveKind, () => string> = {
  fixed: m.files_drive_local,
  removable: m.files_drive_removable,
  network: m.files_drive_network,
  optical: m.files_drive_optical,
  ram: m.files_drive_ram,
}

export const GROUP_LABELS: Record<string, () => string> = {
  today: m.files_groups_today,
  yesterday: m.files_groups_yesterday,
  thisWeek: m.files_groups_this_week,
  lastWeek: m.files_groups_last_week,
  thisMonth: m.files_groups_this_month,
  lastMonth: m.files_groups_last_month,
  thisYear: m.files_groups_this_year,
  older: m.files_groups_older,
  folders: m.files_groups_folders,
  drives: m.files_groups_drives,
  network: m.files_groups_network,
  linux: m.files_groups_linux,
}

export const VIEW_LABELS: Record<ViewMode, () => string> = {
  large: m.files_views_large,
  medium: m.files_views_medium,
  small: m.files_views_small,
  list: m.files_views_list,
  details: m.files_views_details,
  tiles: m.files_views_tiles,
}

export const SORT_LABELS: Record<SortKey, () => string> = {
  name: m.files_sort_name,
  modified: m.files_sort_modified,
  kind: m.files_sort_kind,
  size: m.files_sort_size,
}

export const COLUMN_LABELS: Record<SortKey, () => string> = {
  name: m.files_columns_name,
  modified: m.files_columns_modified,
  kind: m.files_columns_kind,
  size: m.files_columns_size,
}

export const GROUP_BY_LABELS: Record<GroupKey, () => string> = {
  none: m.files_groups_by_none,
  modified: m.files_groups_by_modified,
  kind: m.files_groups_by_kind,
}

export const SECTION_LABELS: Record<SidebarSection, () => string> = {
  home: m.files_sidebar_sections_home,
  pinned: m.files_sidebar_sections_pinned,
  folders: m.files_sidebar_sections_folders,
  drives: m.files_sidebar_sections_drives,
  network: m.files_sidebar_sections_network,
  linux: m.files_sidebar_sections_linux,
  recycleBin: m.files_sidebar_sections_recycle_bin,
}

export const KNOWN_ICONS: Record<KnownId, string> = {
  home: "lucide:house",
  desktop: "lucide:monitor",
  downloads: "lucide:download",
  documents: "lucide:file-text",
  pictures: "lucide:image",
  music: "lucide:music",
  videos: "lucide:film",
}

export const DRIVE_ICONS: Record<DriveKind, string> = {
  fixed: "lucide:hard-drive",
  removable: "lucide:usb",
  network: "lucide:server",
  optical: "lucide:disc-3",
  ram: "lucide:memory-stick",
}
