import type {
  DeviceSettings,
  ShellBar,
  ShellGroup,
  ShellItem,
  ShellItemKind,
  ShellLayout,
  ShellZone,
  ShellZoneId,
  ShellZoneSize,
  TraySlot,
} from "@atrix/settings"

export type BarId = "dock" | "top"

export type ItemTarget = {
  bar: BarId
  zone: ShellZoneId
  group: number
  index: number
}

export type GroupTarget = { bar: BarId; zone: ShellZoneId; at: number }

export type Target = ItemTarget | GroupTarget

export type Location = ItemTarget & { item: ShellItem }

type Flag = {
  [K in keyof DeviceSettings]: DeviceSettings[K] extends boolean ? K : never
}[keyof DeviceSettings]

export const BARS: BarId[] = ["top", "dock"]

export const ZONES: ShellZoneId[] = ["start", "center", "end"]

export const ZONE_SIZES: ShellZoneSize[] = ["auto", "compact", "regular"]

export const DEFAULT_KEY = "default"

export const FLAGS: Partial<Record<ShellItemKind, Flag>> = {
  launcher: "showLauncherButton",
  taskview: "showTaskView",
  claude: "showClaudeUsage",
  tray: "showTrayIcons",
  media: "showMedia",
  input: "showInputLanguage",
  meters: "showMeters",
  network: "showNetwork",
  bluetooth: "showBluetooth",
  battery: "showBattery",
  volume: "showVolume",
  bell: "showNotifications",
  settings: "showSettingsButton",
  desktop: "showDesktopButton",
}

export const WIDGETS: ShellItemKind[] = [
  "launcher",
  "apps",
  "taskview",
  "claude",
  "media",
  "tray",
  "input",
  "meters",
  "network",
  "bluetooth",
  "battery",
  "volume",
  "clock",
  "bell",
  "settings",
  "desktop",
]

const KINDS = new Set<string>([...WIDGETS, "separator"])

const TRAY: ShellItemKind[] = [
  "taskview",
  "tray",
  "input",
  "meters",
  "network",
  "bluetooth",
  "battery",
  "volume",
  "clock",
  "bell",
  "settings",
  "desktop",
]

export const newId = () => crypto.randomUUID()

const item = (kind: ShellItemKind): ShellItem => ({ id: kind, kind })

const group = (id: string, kinds: ShellItemKind[]): ShellGroup => ({
  id,
  items: kinds.map(item),
})

const zone = (align: ShellZoneId, groups: ShellGroup[] = []): ShellZone => ({
  align,
  size: "auto",
  groups,
})

const bar = (
  start: ShellGroup[] = [],
  center: ShellGroup[] = [],
  end: ShellGroup[] = [],
): ShellBar => ({
  start: zone("start", start),
  center: zone("center", center),
  end: zone("end", end),
})

export const defaultLayout = (): ShellLayout => ({
  top: bar([group("lead", ["claude", "media"])], [], [group("tray", TRAY)]),
  dock: bar([], [group("launcher", ["launcher"]), group("apps", ["apps"])]),
})

const legacyTray = (device: DeviceSettings): ShellItemKind[] => {
  const slots: TraySlot[] = [...device.traySlots, ...TRAY_SLOTS]
  const seen = new Set<ShellItemKind>()

  return slots.flatMap(slot => {
    const kinds: ShellItemKind[] =
      slot === "meters"
        ? ["meters", "network"]
        : slot === "claude" && device.claudeUsageSide !== "right"
          ? []
          : slot === "media" && device.mediaSide !== "right"
            ? []
            : [slot]

    return kinds.filter(kind => !seen.has(kind) && seen.add(kind))
  })
}

const TRAY_SLOTS: TraySlot[] = [
  "taskview",
  "claude",
  "tray",
  "media",
  "input",
  "meters",
  "bluetooth",
  "battery",
  "volume",
  "clock",
  "bell",
  "settings",
  "desktop",
]

export const legacyLayout = (device: DeviceSettings): ShellLayout => {
  const layout: ShellLayout = { top: bar(), dock: bar() }
  const order = device.dockWidgets
    .map(widget => widget.kind)
    .filter(kind => kind !== "spacer")
  const lead: ShellItemKind[] = [
    ...(device.claudeUsageSide === "left" ? (["claude"] as const) : []),
    ...(device.mediaSide === "left" ? (["media"] as const) : []),
  ]

  order.forEach((kind, at) => {
    const id = ZONES[Math.min(at, ZONES.length - 1)]

    if (kind === "apps") {
      layout.dock[id].groups.push(group("launcher", ["launcher"]))
      layout.dock[id].groups.push(group("apps", ["apps"]))
      layout.dock[id].align = id === "center" ? device.dockAlign : id
    } else if (kind === "lead") {
      layout.top[id].groups.push(group("lead", lead))
    } else {
      layout.top[id].groups.push(group("tray", legacyTray(device)))
    }
  })

  return sanitize(layout)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const cleanZone = (
  value: unknown,
  fallback: ShellZoneId,
  bar: BarId,
  seen: Set<string>,
  ids: Set<string>,
): ShellZone => {
  const raw = isRecord(value) ? value : {}
  const groups = Array.isArray(raw.groups) ? raw.groups : []

  return {
    align: ZONES.includes(raw.align as ShellZoneId)
      ? (raw.align as ShellZoneId)
      : fallback,
    size: ZONE_SIZES.includes(raw.size as ShellZoneSize)
      ? (raw.size as ShellZoneSize)
      : "auto",
    groups: groups.filter(isRecord).map(entry => {
      const id =
        typeof entry.id === "string" && !ids.has(entry.id) ? entry.id : newId()
      const items = Array.isArray(entry.items) ? entry.items : []

      ids.add(id)

      return {
        id,
        items: items.filter(isRecord).flatMap((entry): ShellItem[] => {
          const kind = entry.kind as ShellItemKind

          if (!KINDS.has(kind) || (kind === "apps" && bar !== "dock")) {
            return []
          }

          if (kind === "separator") {
            const id =
              typeof entry.id === "string" && !seen.has(entry.id)
                ? entry.id
                : newId()

            seen.add(id)

            return [{ id, kind }]
          }

          if (seen.has(kind)) {
            return []
          }

          seen.add(kind)

          return [item(kind)]
        }),
      }
    }),
  }
}

const cleanBar = (
  value: unknown,
  bar: BarId,
  seen: Set<string>,
  ids: Set<string>,
): ShellBar => {
  const raw = isRecord(value) ? value : {}

  return {
    start: cleanZone(raw.start, "start", bar, seen, ids),
    center: cleanZone(raw.center, "center", bar, seen, ids),
    end: cleanZone(raw.end, "end", bar, seen, ids),
  }
}

export const locate = (layout: ShellLayout, id: string): Location | null => {
  for (const bar of BARS) {
    for (const zone of ZONES) {
      const groups = layout[bar][zone].groups

      for (const [group, entry] of groups.entries()) {
        const index = entry.items.findIndex(found => found.id === id)

        if (index >= 0) {
          return { bar, zone, group, index, item: entry.items[index] }
        }
      }
    }
  }

  return null
}

const home = (kind: ShellItemKind): GroupTarget & { id: string } => {
  const fallback = defaultLayout()

  for (const bar of BARS) {
    for (const zone of ZONES) {
      const found = fallback[bar][zone].groups.find(entry =>
        entry.items.some(item => item.kind === kind),
      )

      if (found) {
        return { bar, zone, at: 0, id: found.id }
      }
    }
  }

  return { bar: "dock", zone: "end", at: 0, id: "tray" }
}

export const sanitize = (value: unknown): ShellLayout => {
  const raw = isRecord(value) ? value : {}
  const seen = new Set<string>()
  const ids = new Set<string>()
  const layout: ShellLayout = {
    top: cleanBar(raw.top, "top", seen, ids),
    dock: cleanBar(raw.dock, "dock", seen, ids),
  }

  for (const kind of WIDGETS.filter(kind => !seen.has(kind))) {
    const spot = home(kind)
    const groups = layout[spot.bar][spot.zone].groups
    const target = groups.find(entry => entry.id === spot.id) ?? groups.at(-1)

    if (target) {
      target.items.push(item(kind))
    } else {
      groups.push(group(ids.has(spot.id) ? newId() : spot.id, [kind]))
      ids.add(spot.id)
    }
  }

  return layout
}

export const layoutKey = (device: DeviceSettings) =>
  device.dockMonitor && device.shellLayouts[device.dockMonitor]
    ? device.dockMonitor
    : DEFAULT_KEY

export const layoutOf = (device: DeviceSettings) => {
  const stored = device.shellLayouts[layoutKey(device)]

  return stored ? sanitize(stored) : legacyLayout(device)
}

export const fold = (layout: ShellLayout): ShellLayout => {
  const { dock, top } = layout

  return {
    dock: {
      start: {
        ...dock.start,
        groups: [...top.start.groups, ...dock.start.groups],
      },
      center: {
        ...dock.center,
        groups: [...dock.center.groups, ...top.center.groups],
      },
      end: { ...dock.end, groups: [...dock.end.groups, ...top.end.groups] },
    },
    top: {
      start: { ...top.start, groups: [] },
      center: { ...top.center, groups: [] },
      end: { ...top.end, groups: [] },
    },
  }
}

export const viewOf = (device: DeviceSettings) =>
  device.topBar ? layoutOf(device) : fold(layoutOf(device))

export const enabled = (kind: ShellItemKind, device: DeviceSettings) => {
  const flag = FLAGS[kind]

  if (kind === "launcher" && !device.features.launcher) {
    return false
  }

  return flag ? device[flag] : true
}

export const removable = (kind: ShellItemKind) =>
  kind === "separator" || FLAGS[kind] !== undefined

export const canPlace = (kind: ShellItemKind, bar: BarId) =>
  kind !== "apps" || bar === "dock"

export const visibleItems = (group: ShellGroup, device: DeviceSettings) => {
  const shown: ShellItem[] = []

  for (const entry of group.items) {
    if (entry.kind !== "separator") {
      if (enabled(entry.kind, device)) {
        shown.push(entry)
      }
    } else if (shown.length > 0 && shown.at(-1)?.kind !== "separator") {
      shown.push(entry)
    }
  }

  return shown.at(-1)?.kind === "separator" ? shown.slice(0, -1) : shown
}

export const place = (
  layout: ShellLayout,
  entry: ShellItem,
  target: Target,
): ShellLayout => {
  const next = structuredClone(layout)
  const source = locate(next, entry.id)
  const original = source
    ? next[source.bar][source.zone].groups[source.group]
    : null
  const zone = next[target.bar][target.zone]
  const moved = { ...entry }

  if ("at" in target) {
    zone.groups.splice(target.at, 0, { id: newId(), items: [moved] })
  } else {
    zone.groups[target.group]?.items.splice(target.index, 0, moved)
  }

  if (source && original) {
    original.items = original.items.filter(found => found !== source.item)

    if (original.items.length === 0) {
      const groups = next[source.bar][source.zone].groups

      groups.splice(groups.indexOf(original), 1)
    }
  }

  return next
}

export const removeItem = (layout: ShellLayout, id: string) => {
  const next = structuredClone(layout)
  const found = locate(next, id)

  if (!found) {
    return layout
  }

  const groups = next[found.bar][found.zone].groups

  groups[found.group].items.splice(found.index, 1)

  if (groups[found.group].items.length === 0) {
    groups.splice(found.group, 1)
  }

  return next
}

export const addGroup = (
  layout: ShellLayout,
  bar: BarId,
  zone: ShellZoneId,
) => {
  const next = structuredClone(layout)

  next[bar][zone].groups.push({ id: newId(), items: [] })

  return next
}

export const groupRemovable = (zone: ShellZone, index: number) =>
  zone.groups[index]?.items.length === 0 || zone.groups.length > 1

export const removeGroup = (
  layout: ShellLayout,
  bar: BarId,
  zone: ShellZoneId,
  index: number,
) => {
  const next = structuredClone(layout)
  const groups = next[bar][zone].groups
  const [removed] = groups.splice(index, 1)
  const neighbor = groups[index - 1] ?? groups[index]

  if (!removed || (removed.items.length > 0 && !neighbor)) {
    return layout
  }

  if (neighbor === groups[index - 1]) {
    neighbor?.items.push(...removed.items)
  } else {
    neighbor?.items.unshift(...removed.items)
  }

  return next
}

export const setZone = (
  layout: ShellLayout,
  bar: BarId,
  zone: ShellZoneId,
  patch: Partial<Pick<ShellZone, "align" | "size">>,
) => {
  const next = structuredClone(layout)

  next[bar][zone] = { ...next[bar][zone], ...patch }

  return next
}

const sequence = (layout: ShellLayout, kind: ShellItemKind, bars: BarId[]) =>
  bars
    .filter(bar => canPlace(kind, bar))
    .flatMap(bar =>
      ZONES.map(zone => ({ bar, zone, groups: layout[bar][zone].groups })),
    )

export const stepTarget = (
  layout: ShellLayout,
  id: string,
  dir: -1 | 1,
  bars: BarId[] = BARS,
): Target | null => {
  const found = locate(layout, id)

  if (!found) {
    return null
  }

  const groups = layout[found.bar][found.zone].groups
  const size = groups[found.group].items.length

  if (dir < 0 && found.index > 0) {
    return { ...found, index: found.index - 1 }
  }

  if (dir > 0 && found.index < size - 1) {
    return { ...found, index: found.index + 2 }
  }

  const neighbor = found.group + dir

  if (groups[neighbor]) {
    return {
      bar: found.bar,
      zone: found.zone,
      group: neighbor,
      index: dir > 0 ? 0 : groups[neighbor].items.length,
    }
  }

  const zones = sequence(layout, found.item.kind, bars)
  const at = zones.findIndex(
    entry => entry.bar === found.bar && entry.zone === found.zone,
  )
  const next = zones[at + dir]

  if (!next) {
    return null
  }

  if (next.groups.length === 0) {
    return { bar: next.bar, zone: next.zone, at: 0 }
  }

  const edge = dir > 0 ? 0 : next.groups.length - 1

  return {
    bar: next.bar,
    zone: next.zone,
    group: edge,
    index: dir > 0 ? 0 : next.groups[edge].items.length,
  }
}

export const zoneEnd = (
  layout: ShellLayout,
  bar: BarId,
  zone: ShellZoneId,
): Target => {
  const groups = layout[bar][zone].groups
  const last = groups.length - 1

  return last < 0
    ? { bar, zone, at: 0 }
    : { bar, zone, group: last, index: groups[last].items.length }
}
