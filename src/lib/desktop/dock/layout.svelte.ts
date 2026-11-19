import {
  type DeviceSettings,
  defaultDevice,
  type ShellZoneId,
  updateDevice,
} from "@atrix/settings"
import { emit } from "@tauri-apps/api/event"
import { cubicOut } from "svelte/easing"
import { Tween } from "svelte/motion"
import { SvelteMap } from "svelte/reactivity"
import * as native from "#lib/desktop/native/index.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import { barHeightFor } from "./bar"
import { MAGNIFY_BOOST } from "./DockItem.svelte"
import { type DockGroup, dock, groupWindows, resolvePins } from "./dock.svelte"
import { DockOrdering, moveGroup } from "./order"
import { rem, rootFontSize } from "./rem.svelte"
import { locate, viewOf } from "./zones"

const STRIP = 6
const NAV_PAD = 16
const ZONE_GAP = 16

export const TOPBAR_H = 34

export type MenuBox = {
  left: number
  top: number
  right: number
  bottom: number
}

export class DockLayout {
  private surface = $state<"taskbar" | "topbar">("taskbar")

  constructor(surface: "taskbar" | "topbar" = "taskbar") {
    this.surface = surface
  }

  device = $state<DeviceSettings>(defaultDevice)

  collapsed = $state(false)

  hiding = $state(false)

  dockHidden = $state(false)

  maximized = $state(false)

  claims = new SvelteMap<string, MenuBox>()

  pointerX = $state<number | null>(null)

  magnet = new Tween(0, {
    duration: () =>
      document.documentElement.dataset.motion === "false" ? 0 : 140,
    easing: cubicOut,
  })

  inside = $state(false)

  navWidth = $state(0)

  zoneWidth = $state<Record<ShellZoneId, number>>({
    start: 0,
    center: 0,
    end: 0,
  })

  appsWidth = $state(0)

  dragPath = $state<string | null>(null)

  dropPath = $state<string | null>(null)

  dropBefore = $state(true)

  view = $derived(viewOf(this.device))

  bar = $derived(this.surface === "topbar" ? this.view.top : this.view.dock)

  mac = $derived(this.surface === "taskbar" && this.device.dockStyle === "mac")

  edge = $derived(this.surface === "topbar" ? "top" : this.device.dockEdge)

  desktop = $derived(this.mac && this.device.dockDesktop)

  edgeOnly = $derived(
    this.device.dockEdgeOnly === "always" ||
      (this.device.dockEdgeOnly === "maximized" && this.maximized),
  )

  hideSystemTaskbar = $derived(
    this.device.hideSystemTaskbar && this.device.onboarded,
  )

  hidden = $derived(new Set(this.device.hiddenApps))

  slotWidth = $derived(this.device.dockIconSize + 20)

  barHeight = $derived(
    this.surface === "topbar"
      ? TOPBAR_H
      : barHeightFor(this.device.dockHeight, this.device.dockIslands),
  )

  contentHeight = $derived(
    this.surface === "topbar"
      ? TOPBAR_H - (this.device.dockIslands ? 8 : 0)
      : this.device.dockHeight,
  )

  appsZone = $derived(locate(this.view, "apps")?.zone ?? "center")

  centered = $derived(this.bar.center.align === "center")

  fixed = $derived.by(() => {
    const widths = { ...this.zoneWidth }

    widths[this.appsZone] = Math.max(0, widths[this.appsZone] - this.appsWidth)

    return widths
  })

  roomForIcons = $derived.by(() => {
    const room = this.navWidth - NAV_PAD - ZONE_GAP
    const { start, center, end } = this.fixed

    if (!this.centered) {
      return room - start - center - end
    }

    if (this.appsZone === "center") {
      return room - 2 * Math.max(start, end) - center
    }

    return (room - center) / 2 - this.fixed[this.appsZone]
  })

  fits = $derived(
    this.navWidth === 0
      ? Number.POSITIVE_INFINITY
      : Math.floor(Math.max(0, this.roomForIcons) / this.slotWidth),
  )

  groups = $derived(
    this.ordered(
      groupWindows(
        dock.pinned,
        resolvePins(this.device.pinnedApps, dock.apps),
        dock.windows,
      ).filter(g => !(this.hidden.has(g.path) && g.windows.length === 0)),
    ),
  )

  maxDockWidth = $derived(
    Math.max(
      360,
      (typeof window === "undefined" ? 1920 : window.screen.width) - 160,
    ),
  )

  naturalWidth = $derived.by(() => {
    const widths = { ...this.fixed }

    widths[this.appsZone] += this.groups.length * this.slotWidth

    const content = this.centered
      ? 2 * Math.max(widths.start, widths.end) + widths.center
      : widths.start + widths.center + widths.end

    return content + NAV_PAD + ZONE_GAP
  })

  dockWidth = $derived.by(() => {
    if (!this.mac) {
      return this.device.dockWidth
    }

    const limit = this.device.dockWidth * (1 + this.device.dockGrowth)

    return Math.min(
      this.maxDockWidth,
      limit,
      Math.max(this.naturalWidth, this.device.dockWidth),
    )
  })

  shown = $derived(
    this.groups.length <= this.fits
      ? this.groups
      : this.groups.slice(0, Math.max(1, this.fits - 1)),
  )

  spilled = $derived(this.groups.slice(this.shown.length))

  menuBox = $derived.by((): MenuBox | null => {
    let box: MenuBox | null = null

    for (const rect of this.claims.values()) {
      box = box
        ? {
            left: Math.min(box.left, rect.left),
            top: Math.min(box.top, rect.top),
            right: Math.max(box.right, rect.right),
            bottom: Math.max(box.bottom, rect.bottom),
          }
        : { ...rect }
    }

    return box
  })

  lift = $derived(
    this.mac && this.inside && !this.collapsed
      ? Math.round(this.device.dockIconSize * MAGNIFY_BOOST) + 16
      : 0,
  )

  staticKey = $derived(
    [
      this.device.dockStyle,
      this.device.dockEdge,
      this.barHeight,
      this.device.dockAutoHide,
      this.desktop,
      this.hideSystemTaskbar,
      this.device.dockMonitor,
      this.collapsed,
      this.edgeOnly,
      rootFontSize(),
    ].join("|"),
  )

  closeLocal = () => {
    this.claims.clear()
    contextMenu.close()

    for (const open of document.querySelectorAll<HTMLElement>(
      ":popover-open",
    )) {
      open.hidePopover()
    }
  }

  closeMenus = () => {
    this.closeLocal()
    emit("atrix-close-menus").catch(() => undefined)
  }

  claim = (key: string, rect: MenuBox | null) => {
    if (rect) {
      this.claims.set(key, rect)
      this.pointerX = null
    } else {
      this.claims.delete(key)
    }
  }

  patch = (change: Partial<DeviceSettings>) => {
    this.device = { ...this.device, ...change }
    updateDevice(device => ({ ...device, ...change })).catch(() => undefined)
  }

  commitDrop = async () => {
    const from = this.dragPath
    const onto = this.dropPath
    const before = this.dropBefore

    this.dragPath = null
    this.dropPath = null

    if (!from || !onto || from === onto) {
      return
    }

    const paths = moveGroup(this.groups, from, onto, before, this.hidden)

    if (!paths) {
      return
    }

    this.ordering.commit(paths)

    const pinned = new Map(dock.pinned.map(app => [app.path, app]))
    const taskbar = paths.filter(
      path => pinned.has(path) && !this.hidden.has(path),
    )
    const moved = new Set(taskbar)
    let next = 0
    const reordered = dock.pinned.map(app =>
      moved.has(app.path) ? (pinned.get(taskbar[next++]) ?? app) : app,
    )

    if (reordered.some((app, at) => app.path !== dock.pinned[at]?.path)) {
      dock.pinned = reordered
      native.reorderPins(taskbar).catch(() => undefined)
    }

    this.device = { ...this.device, dockOrder: paths }
    await updateDevice(device => ({ ...device, dockOrder: paths }))
  }

  applyLayout = () => {
    if (this.dockHidden) {
      return Promise.resolve(undefined)
    }

    const root = document.documentElement

    root.dataset.surface = "dock"

    if (this.surface === "topbar") {
      root.dataset.dock = "windows"
      root.dataset.edge = "top"
      root.style.setProperty("--dock-height", rem(TOPBAR_H))
      root.style.setProperty("--dock-content-height", rem(this.contentHeight))

      return native
        .applyTopbar({
          edge: "top",
          height: TOPBAR_H,
          width: 0,
          floating: false,
          autoHide: false,
          desktop: false,
          hideSystemTaskbar: this.hideSystemTaskbar,
          monitor: this.device.dockMonitor,
        })
        .catch(() => undefined)
    }

    root.dataset.dock = this.device.dockStyle
    root.dataset.edge = this.device.dockEdge
    root.style.setProperty("--dock-height", rem(this.barHeight))
    root.style.setProperty("--dock-content-height", rem(this.device.dockHeight))

    return native
      .applyTaskbar({
        edge: this.device.dockEdge,
        height: this.collapsed ? (this.edgeOnly ? 0 : STRIP) : this.barHeight,
        width: this.dockWidth,
        floating: this.device.dockStyle !== "windows",
        autoHide: this.device.dockAutoHide,
        desktop: this.desktop,
        hideSystemTaskbar: this.hideSystemTaskbar,
        monitor: this.device.dockMonitor,
      })
      .catch(() => undefined)
  }

  private ordering = new DockOrdering()

  private ordered(list: DockGroup[]) {
    return this.ordering.arrange(list, this.device.dockOrder, this.hidden)
  }
}
