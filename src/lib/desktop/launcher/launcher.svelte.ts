import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import {
  type Components,
  launchedComponents,
} from "#lib/components/settings/desktopSettings.ts"
import type { Result } from "#lib/desktop/launcher/core/index.ts"
import { parseQuery, type Route } from "#lib/desktop/launcher/core/index.ts"
import {
  type AppEntry,
  listApps,
  pinnedApps,
} from "#lib/desktop/native/apps.js"
import {
  type ClipEntry,
  clipboardHistory,
} from "#lib/desktop/native/clipboard.js"
import {
  hideWindow,
  listWindows,
  type WindowEntry,
} from "#lib/desktop/native/windows.js"
import {
  type DeviceSettings,
  defaultDevice,
  defaultProfile,
  type Profile,
} from "#lib/desktop/settings/index.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { type AtrixItems, askAtrix } from "./atrix"
import { settingsLinks, systemCommands } from "./commands"
import { record, top } from "./frecency"
import { buildGroups, RECENT } from "./groups"
import {
  alignApps,
  atrixOpenResult,
  conversationResult,
  docResult,
  mergeApps,
} from "./providers"
import type { Timer } from "./timers"

const APPS_STALE = 300_000

const COPIES = new Set(["calc", "unit", "emoji"])

export class Launcher {
  profile = $state<Profile>(defaultProfile)

  device = $state<DeviceSettings>(defaultDevice)

  apps = $state.raw<AppEntry[]>([])

  clips = $state.raw<ClipEntry[]>([])

  pinned = $state.raw<AppEntry[]>([])

  windows = $state.raw<WindowEntry[]>([])

  timers = $state.raw<Timer[]>([])

  components = $state<Components>({
    agent: true,
    shell: true,
    files: true,
    terminal: true,
  })

  agent = $derived(this.components.agent)

  atrix = $state.raw<AtrixItems>({ conversations: [], docs: [] })

  icons = $state<Record<string, string>>({})

  query = $state("")

  cursor = $state(0)

  usage = $state(0)

  error = $state<string | null>(null)

  input = $state<HTMLInputElement>()

  list = $state<HTMLElement>()

  private appsAt = 0

  commandRows = $derived([
    ...systemCommands(this.components, this.device.terminal),
    ...settingsLinks(),
  ])

  atrixOpen = atrixOpenResult()

  atrixRows = $derived(
    this.agent
      ? [
          this.atrixOpen,
          ...this.atrix.conversations.map(conversationResult),
          ...this.atrix.docs.map(docResult),
        ]
      : [],
  )

  extrasById = $derived(
    new Map(
      [
        ...(this.profile.launcher.showCommands ? this.commandRows : []),
        ...(this.agent ? [this.atrixOpen] : []),
      ].map(r => [r.id, r]),
    ),
  )

  route = $derived.by((): Route => {
    const parsed = parseQuery(this.query)
    const { launcher } = this.profile
    const blocked =
      (parsed.mode === "todo" && !launcher.showTodos) ||
      (parsed.mode === "calc" && !launcher.calculator)

    return blocked ? { mode: "search", text: this.query.trim() } : parsed
  })

  clipMode = $derived(this.route.mode === "clip")

  dockPinned = $derived(new Set(this.device.pinnedApps))

  recentIds = $derived.by(() => {
    void this.usage

    return top(RECENT * 4)
  })

  groups = $derived(buildGroups(this))

  flat = $derived(this.groups.flatMap(g => g.items))

  active = $derived(Math.min(this.cursor, Math.max(this.flat.length - 1, 0)))

  current = $derived(this.flat[this.active])

  reset() {
    this.cursor = 0
    this.error = null
  }

  setQuery(value: string) {
    this.query = value
    this.reset()
  }

  async refreshApps() {
    this.appsAt = Date.now()

    const [all, taskbar] = await Promise.all([
      listApps().catch(() => [] as AppEntry[]),
      pinnedApps().catch(() => [] as AppEntry[]),
    ])

    this.apps = mergeApps([all, taskbar])
    this.pinned = alignApps(this.apps, taskbar)
  }

  async refreshWindows() {
    this.windows = await listWindows().catch(() => [])
  }

  async refreshClips() {
    this.clips = await clipboardHistory().catch(() => [])
  }

  refreshAtrix() {
    return askAtrix({
      kind: "list",
      reply: getCurrentWebviewWindow().label,
    }).catch(() => undefined)
  }

  async refreshAgent() {
    this.components = await launchedComponents().catch(() => this.components)
  }

  refresh() {
    return Promise.all([
      this.refreshAgent(),
      this.refreshApps(),
      this.refreshWindows(),
      this.refreshAtrix(),
    ])
  }

  // the app list rescans itself only when read after it went stale, so an open still reads it now and then
  reopen() {
    return Promise.all([
      Date.now() - this.appsAt > APPS_STALE ? this.refreshApps() : undefined,
      this.refreshWindows(),
      this.refreshAtrix(),
    ])
  }

  async hide() {
    contextMenu.close()
    await hideWindow("launcher")
    this.setQuery("")
  }

  async perform(item: Result, run: () => void | Promise<void>, stay = false) {
    try {
      await run()
    } catch (e) {
      this.error = m.launcher_could_not_open({
        title: item.title,
        error: String(e),
      })

      return
    }

    if (item.kind === "app" || this.extrasById.has(item.id)) {
      record(item.id).then(() => {
        this.usage += 1
      })
    }

    if (stay) {
      await this.refreshClips()

      return
    }

    await this.hide()
  }

  primaryLabel(item: Result | undefined) {
    if (item?.kind === "clip") {
      return m.launcher_key_paste()
    }

    return item && COPIES.has(item.kind)
      ? m.launcher_key_copy()
      : m.launcher_key_open()
  }

  secondary(item: Result | undefined, id: "admin" | "location") {
    return item?.secondaryActions.find(a => a.id === id)
  }

  run(
    item: Result | undefined,
    variant: "open" | "admin" | "location" = "open",
  ) {
    if (!item) {
      return
    }

    const alt = variant === "open" ? undefined : this.secondary(item, variant)

    this.perform(item, alt?.run ?? item.action, alt?.stay ?? item.stay)
  }

  move(delta: number) {
    const count = this.flat.length

    if (count) {
      this.cursor = (((this.active + delta) % count) + count) % count
    }
  }

  jumpGroup(direction: 1 | -1) {
    if (this.groups.length < 2) {
      return
    }

    const current = this.groups.findIndex(
      g => this.active >= g.start && this.active < g.start + g.items.length,
    )
    const next = (current + direction + this.groups.length) % this.groups.length

    this.cursor = this.groups[next].start
  }

  actionsOf(item: Result): MenuItem[] {
    return [
      {
        label: this.primaryLabel(item),
        icon:
          item.kind === "clip"
            ? "lucide:clipboard-paste"
            : COPIES.has(item.kind)
              ? "lucide:copy"
              : "lucide:arrow-up-right",
        run: () => this.perform(item, item.action, item.stay),
      },
      ...item.secondaryActions.map(a => ({
        label: a.label,
        icon: a.icon,
        run: () => this.perform(item, a.run, a.stay),
      })),
    ]
  }

  openMenu(index: number, e: MouseEvent) {
    const item = this.flat[index]

    if (!item) {
      return
    }

    this.cursor = index
    contextMenu.show(e, this.actionsOf(item))
  }

  openMenuAtActive() {
    const rect = this.list
      ?.querySelector(`[data-index="${this.active}"]`)
      ?.getBoundingClientRect()

    if (rect) {
      this.openMenu(
        this.active,
        new MouseEvent("contextmenu", {
          clientX: rect.left + rect.height,
          clientY: rect.bottom,
        }),
      )
    }
  }

  insertPrefix(prefix: string) {
    this.setQuery(prefix)
    this.input?.focus()
  }
}
