import type { Profile } from "@atrix/settings"
import type {
  Result,
  ResultGroup,
  ResultKind,
} from "#lib/desktop/launcher/core/index.ts"
import {
  groupResults,
  looksLikeMath,
  openTarget,
  type Route,
  rank,
} from "#lib/desktop/launcher/core/index.ts"
import type { AppEntry } from "#lib/desktop/native/apps.js"
import type { ClipEntry } from "#lib/desktop/native/clipboard.js"
import type { WindowEntry } from "#lib/desktop/native/windows.js"
import { m } from "#lib/paraglide/messages.js"
import { boost } from "./frecency"
import {
  appResult,
  atrixNewResult,
  calcResult,
  clearClipsResult,
  clipResults,
  emojiResults,
  newTimerResult,
  openResult,
  pendingTimerResult,
  runResult,
  todoResult,
  unitResult,
  webResult,
  windowResult,
} from "./providers"
import { parseTimer, type Timer } from "./timers"

export const RECENT = 6

const GROUP_LABELS: Record<ResultKind, () => string> = {
  app: m.launcher_group_app,
  window: m.launcher_group_window,
  command: m.launcher_group_command,
  calc: m.launcher_group_calc,
  unit: m.launcher_group_unit,
  todo: m.launcher_group_todo,
  timer: m.launcher_group_timer,
  emoji: m.launcher_group_emoji,
  web: m.launcher_group_web,
  run: m.launcher_group_run,
  setting: m.common_settings,
  clip: m.launcher_group_clip,
  atrix: m.launcher_group_atrix,
  conversation: m.launcher_group_conversation,
  doc: m.shell_page_knowledge,
}

const groupLabel = (kind: ResultKind) => GROUP_LABELS[kind]()

export type GroupSource = {
  route: Route
  profile: Profile
  apps: AppEntry[]
  windows: WindowEntry[]
  pinned: AppEntry[]
  timers: Timer[]
  clips: ClipEntry[]
  icons: Record<string, string>
  dockPinned: Set<string>
  recentIds: string[]
  commandRows: Result[]
  atrixRows: Result[]
  extrasById: Map<string, Result>
}

const limitFor = (s: GroupSource) => (kind: ResultKind) => {
  const max = s.profile.launcher.maxResults

  if (kind === "app" || kind === "clip" || kind === "emoji") {
    return max
  }

  if (kind === "timer") {
    return Math.max(4, max)
  }

  if (
    kind === "window" ||
    kind === "command" ||
    kind === "setting" ||
    kind === "conversation" ||
    kind === "doc"
  ) {
    return Math.max(3, Math.ceil(max / 2))
  }

  return 2
}

const grouped = (s: GroupSource, items: Result[]) =>
  items.length ? groupResults(items, limitFor(s), groupLabel) : []

const asApp = (s: GroupSource, a: AppEntry) =>
  appResult(a, s.icons[a.path], s.dockPinned.has(a.path))

const emptyGroups = (s: GroupSource): ResultGroup[] => {
  const { launcher } = s.profile
  const byId = new Map(s.apps.map(a => [`app:${a.id}`, a]))
  const recent = s.recentIds
    .flatMap(id => {
      const app = byId.get(id)

      if (app) {
        return [asApp(s, app)]
      }

      const extra = s.extrasById.get(id)

      return extra ? [extra] : []
    })
    .slice(0, RECENT)
  const running = launcher.showWindows
    ? s.windows
        .slice(0, launcher.maxResults)
        .map(w => windowResult(w, s.icons[w.process]))
    : []
  const starred = recent.length
    ? recent
    : s.pinned.slice(0, RECENT).map(a => asApp(s, a))
  const groups: ResultGroup[] = []

  if (starred.length) {
    groups.push({
      kind: "app",
      label: recent.length ? m.palette_recent() : m.launcher_section_pinned(),
      start: 0,
      items: starred,
    })
  }

  if (s.timers.length) {
    groups.push({
      kind: "timer",
      label: m.launcher_group_timer(),
      start: 0,
      items: s.timers.map(t => pendingTimerResult(t)),
    })
  }

  if (running.length) {
    groups.push({
      kind: "window",
      label: m.launcher_section_running(),
      start: 0,
      items: running,
    })
  }

  let start = 0

  for (const group of groups) {
    group.start = start
    start += group.items.length
  }

  return groups
}

export const buildGroups = (s: GroupSource): ResultGroup[] => {
  const { route } = s
  const { mode, text } = route
  const { launcher } = s.profile

  if (mode === "run") {
    return text ? grouped(s, [runResult(text)]) : []
  }

  if (mode === "todo") {
    const todo = todoResult(text)

    return grouped(s, todo ? [todo] : [])
  }

  if (mode === "calc") {
    const outcome = unitResult(text) ?? calcResult(text)

    return grouped(s, outcome ? [outcome] : [])
  }

  if (route.mode === "timer") {
    const draft = parseTimer(text, route.kind)

    return grouped(s, [
      ...(draft ? [newTimerResult(draft)] : []),
      ...s.timers.map(t => pendingTimerResult(t)),
    ])
  }

  if (mode === "emoji") {
    return grouped(s, emojiResults(text))
  }

  if (mode === "clip") {
    const rows = clipResults(s.clips, text)

    return grouped(s, rows.length ? [...rows, clearClipsResult()] : [])
  }

  if (!text) {
    return emptyGroups(s)
  }

  const candidates: Result[] = [
    ...s.apps.map(a => asApp(s, a)),
    ...(launcher.showWindows
      ? s.windows.map(w => windowResult(w, s.icons[w.process]))
      : []),
    ...(launcher.showCommands ? s.commandRows : []),
    ...s.atrixRows,
  ]
  const extras: Result[] = []
  const conversion = launcher.calculator ? unitResult(text) : null
  const calc =
    launcher.calculator && !conversion && looksLikeMath(text)
      ? calcResult(text)
      : null
  const target = openTarget(text)

  if (conversion) {
    extras.push(conversion)
  }

  if (calc) {
    extras.push(calc)
  }

  if (target) {
    extras.push(openResult(target))
  }

  extras.push(atrixNewResult(text), webResult(text, launcher.webSearch))

  return grouped(s, [...rank(candidates, text, boost), ...extras])
}
