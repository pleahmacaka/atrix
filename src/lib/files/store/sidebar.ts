import { DRIVE_ICONS, KNOWN_ICONS, KNOWN_LABELS } from "../labels"
import {
  baseName,
  HOME,
  isDevice,
  isVirtual,
  RECYCLE_BIN,
  sameLocation,
  THIS_PC,
} from "../locations"
import type { ShellEntry } from "../native"
import { driveName, places } from "./places.svelte"
import { prefs, type SidebarSection } from "./prefs.svelte"

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  "home",
  "pinned",
  "folders",
  "drives",
  "network",
  "linux",
  "recycleBin",
]

export const sectionShown = (id: SidebarSection) =>
  !prefs.sidebar.hidden.includes(id)

export const toggleSection = (id: SidebarSection) => {
  const { hidden } = prefs.sidebar

  prefs.sidebar.hidden = hidden.includes(id)
    ? hidden.filter(entry => entry !== id)
    : [...hidden, id]
}

export const pathShown = (path: string) =>
  !prefs.sidebar.hiddenPaths.some(hidden => sameLocation(hidden, path))

export const hidePath = (path: string) => {
  if (pathShown(path)) {
    prefs.sidebar.hiddenPaths = [...prefs.sidebar.hiddenPaths, path]
  }
}

export const showPath = (path: string) => {
  prefs.sidebar.hiddenPaths = prefs.sidebar.hiddenPaths.filter(
    hidden => !sameLocation(hidden, path),
  )
}

export const pinnedEntry = (path: string) =>
  places.pinned.find(pin => sameLocation(pin.path, path))

export const isPinned = (path: string) => pinnedEntry(path) !== undefined

export const orderedPins = (pins: ShellEntry[]) => {
  const rank = (pin: ShellEntry) => {
    const at = prefs.sidebar.order.findIndex(path =>
      sameLocation(path, pin.path),
    )

    return at < 0 ? Number.POSITIVE_INFINITY : at
  }

  return pins.toSorted((a, b) => rank(a) - rank(b))
}

export const movePin = (paths: string[], from: number, to: number) => {
  const next = [...paths]
  const [moved] = next.splice(from, 1)

  next.splice(to > from ? to - 1 : to, 0, moved)
  prefs.sidebar.order = next
}

export const sidebarLabel = (path: string) => {
  const known = places.known.find(entry => sameLocation(entry.path, path))
  const drive = places.drives.find(entry => sameLocation(entry.path, path))
  const place = [...places.network, ...places.linux].find(entry =>
    sameLocation(entry.path, path),
  )

  if (known) {
    return KNOWN_LABELS[known.id]()
  }

  if (drive) {
    return driveName(drive)
  }

  return place?.name ?? baseName(path)
}

export const sidebarIcon = (path: string) => {
  if (path === HOME) {
    return "lucide:house"
  }

  if (path === THIS_PC) {
    return "lucide:monitor"
  }

  if (path === RECYCLE_BIN) {
    return "lucide:trash-2"
  }

  if (isDevice(path)) {
    return "lucide:monitor-smartphone"
  }

  const known = places.known.find(entry => sameLocation(entry.path, path))
  const drive = places.drives.find(entry => sameLocation(entry.path, path))

  if (known) {
    return KNOWN_ICONS[known.id]
  }

  if (drive) {
    return DRIVE_ICONS[drive.kind]
  }

  if (places.network.some(entry => sameLocation(entry.path, path))) {
    return "lucide:folder-symlink"
  }

  if (places.linux.some(entry => sameLocation(entry.path, path))) {
    return "lucide:square-terminal"
  }

  return isVirtual(path) ? "lucide:layers" : "lucide:folder"
}
