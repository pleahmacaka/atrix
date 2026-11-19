import { isEqual, omit } from "es-toolkit"
import {
  addGroup,
  BARS,
  type BarId,
  canPlace,
  defaultLayout,
  enabled,
  FLAGS,
  layoutKey,
  layoutOf,
  newId,
  place,
  removable,
  removeGroup,
  removeItem,
  setZone,
  stepTarget,
  type Target,
  viewOf,
  WIDGETS,
} from "#lib/desktop/dock/zones.ts"
import {
  type DeviceSettings,
  defaultDevice,
  type ShellItem,
  type ShellItemKind,
  type ShellLayout,
  type ShellZone,
  type ShellZoneId,
  updateDevice,
} from "#lib/desktop/settings/index.ts"

const HISTORY = 100

const FIELDS: (keyof DeviceSettings)[] = [
  "shellLayouts",
  "topBar",
  "dockMonitor",
  "dockEdge",
  "dockStyle",
  "dockHeight",
  "dockIconSize",
  "dockWidth",
  "dockIslands",
  ...Object.values(FLAGS),
]

type Snapshot = Partial<DeviceSettings>

export type Drag = { entry: ShellItem; palette: boolean }

export type Hint = Target | "palette"

const snapshot = (device: DeviceSettings): Snapshot =>
  Object.fromEntries(FIELDS.map(key => [key, $state.snapshot(device[key])]))

export class Editor {
  device = $state<DeviceSettings>(defaultDevice)

  past = $state.raw<Snapshot[]>([])

  future = $state.raw<Snapshot[]>([])

  drag = $state<Drag | null>(null)

  hint = $state<Hint | null>(null)

  key = $derived(layoutKey(this.device))

  view = $derived(viewOf(this.device))

  separate = $derived(
    Boolean(
      this.device.dockMonitor &&
        this.device.shellLayouts[this.device.dockMonitor],
    ),
  )

  palette = $derived(
    WIDGETS.filter(
      kind =>
        FLAGS[kind] !== undefined &&
        !enabled(kind, this.device) &&
        (kind !== "launcher" || this.device.features.launcher),
    ),
  )

  private pending = 0

  accept = (device: DeviceSettings) => {
    if (this.pending === 0) {
      this.device = device
    }
  }

  private write(patch: Snapshot) {
    const change = $state.snapshot(patch)

    this.device = { ...this.device, ...change }
    this.pending += 1

    updateDevice(device => ({ ...device, ...change }))
      .catch(() => undefined)
      .finally(() => {
        this.pending -= 1
      })
  }

  commit(patch: Snapshot) {
    const before = snapshot(this.device)

    if (isEqual(before, { ...before, ...$state.snapshot(patch) })) {
      return
    }

    this.past = [...this.past.slice(1 - HISTORY), before]
    this.future = []
    this.write(patch)
  }

  undo = () => {
    const previous = this.past.at(-1)

    if (!previous) {
      return
    }

    this.past = this.past.slice(0, -1)
    this.future = [...this.future, snapshot(this.device)]
    this.write(previous)
  }

  redo = () => {
    const next = this.future.at(-1)

    if (!next) {
      return
    }

    this.future = this.future.slice(0, -1)
    this.past = [...this.past, snapshot(this.device)]
    this.write(next)
  }

  private setView(next: ShellLayout, extra: Snapshot = {}) {
    this.commit({
      shellLayouts: { ...this.device.shellLayouts, [this.key]: next },
      ...extra,
    })
  }

  reset = () => {
    const flags = Object.fromEntries(
      Object.values(FLAGS).map(flag => [flag, defaultDevice[flag]]),
    )

    this.setView(defaultLayout(), { ...flags, topBar: defaultDevice.topBar })
  }

  move = (entry: ShellItem, target: Target) => {
    if (canPlace(entry.kind, target.bar)) {
      this.setView(place(this.view, entry, target))
    }
  }

  show = (kind: ShellItemKind, target?: Target) => {
    const flag = FLAGS[kind]
    const extra = flag ? { [flag]: true } : {}

    if (kind === "separator") {
      if (target) {
        this.setView(place(this.view, { id: newId(), kind }, target))
      }

      return
    }

    if (target && canPlace(kind, target.bar)) {
      this.setView(place(this.view, { id: kind, kind }, target), extra)
    } else {
      this.commit(extra)
    }
  }

  hide = (entry: ShellItem) => {
    const flag = FLAGS[entry.kind]

    if (entry.kind === "separator") {
      this.setView(removeItem(this.view, entry.id))
    } else if (flag) {
      this.commit({ [flag]: false })
    }
  }

  step = (entry: ShellItem, dir: -1 | 1) => {
    const target = stepTarget(
      this.view,
      entry.id,
      dir,
      this.device.topBar ? BARS : ["dock"],
    )

    if (target) {
      this.move(entry, target)
    }

    return target !== null
  }

  addGroup = (bar: BarId, zone: ShellZoneId) => {
    this.setView(addGroup(this.view, bar, zone))
  }

  removeGroup = (bar: BarId, zone: ShellZoneId, index: number) => {
    this.setView(removeGroup(this.view, bar, zone, index))
  }

  setZone = (
    bar: BarId,
    zone: ShellZoneId,
    patch: Partial<Pick<ShellZone, "align" | "size">>,
  ) => {
    this.setView(setZone(this.view, bar, zone, patch))
  }

  setTopBar = (on: boolean) => this.commit({ topBar: on })

  setMonitor = (id: string | null) => this.commit({ dockMonitor: id })

  setSeparate = (on: boolean) => {
    const monitor = this.device.dockMonitor

    if (!monitor) {
      return
    }

    const rest = omit(this.device.shellLayouts, [monitor])

    this.commit({
      shellLayouts: on ? { ...rest, [monitor]: layoutOf(this.device) } : rest,
    })
  }

  dropOn = () => {
    const drag = this.drag
    const hint = this.hint

    this.drag = null
    this.hint = null

    if (!drag || !hint) {
      return
    }

    if (hint === "palette") {
      if (!drag.palette && removable(drag.entry.kind)) {
        this.hide(drag.entry)
      }

      return
    }

    if (drag.palette) {
      this.show(drag.entry.kind, hint)
    } else {
      this.move(drag.entry, hint)
    }
  }
}
