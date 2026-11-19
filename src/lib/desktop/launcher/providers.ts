import type { WebSearchEngine } from "@atrix/settings"
import { addTaskInMain } from "#lib/calendar/desktop.ts"
import { dueLabel, quickTask } from "#lib/calendar/tasks.ts"
import type { Result } from "#lib/desktop/launcher/core/index.ts"
import {
  convert,
  evaluate,
  formatNumber,
  matchEmoji,
  plainNumber,
} from "#lib/desktop/launcher/core/index.ts"
import { m } from "#lib/paraglide/messages.js"
import { toggleDockPin } from "../dock/dock.svelte"
import {
  type AppEntry,
  activateWindow,
  type ClipEntry,
  clipboardClear,
  clipboardCopy,
  clipboardPaste,
  clipboardPin,
  clipboardRemove,
  closeWindow,
  launchApp,
  openLocation,
  openUrl,
  runCommand,
  type WindowEntry,
} from "../native"
import { type AtrixConversation, type AtrixDoc, askAtrix } from "./atrix"
import { relativeTime } from "./relative"
import {
  addTimer,
  cancelTimer,
  formatClock,
  remaining,
  type Timer,
} from "./timers"

const FALLBACK_ICON = "lucide:app-window"

export const ATRIX_ICON = "/favicon.svg"

const CALC_ERRORS: Record<string, () => string> = {
  divisionByZero: m.launcher_calc_division_by_zero,
  undefined: m.launcher_calc_undefined,
  outOfRange: m.launcher_calc_out_of_range,
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

const appKey = (app: AppEntry) => app.name.trim().toLowerCase()

export const mergeApps = (lists: AppEntry[][]) => {
  const seen = new Set<string>()
  const merged: AppEntry[] = []

  for (const app of lists.flat()) {
    const key = appKey(app)

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(app)
  }

  return merged
}

export const alignApps = (apps: AppEntry[], list: AppEntry[]) => {
  const byName = new Map(apps.map(a => [appKey(a), a]))

  return mergeApps([list]).map(a => byName.get(appKey(a)) ?? a)
}

export const appResult = (
  app: AppEntry,
  icon?: string,
  dockPinned = false,
): Result => ({
  id: `app:${app.id}`,
  kind: "app",
  title: app.name,
  subtitle: app.subtitle,
  icon: icon || FALLBACK_ICON,
  iconPath: app.path,
  action: () => launchApp(app.path),
  secondaryActions: [
    {
      id: "admin",
      label: m.launcher_action_admin(),
      icon: "lucide:shield",
      run: () => launchApp(app.path, true),
    },
    ...(app.kind === "store"
      ? []
      : [
          {
            id: "location" as const,
            label: m.launcher_action_location(),
            icon: "lucide:folder-open",
            run: () => openLocation(app.path),
          },
        ]),
    {
      label: dockPinned
        ? m.launcher_action_unpin_dock()
        : m.launcher_action_pin_dock(),
      icon: dockPinned ? "lucide:pin-off" : "lucide:pin",
      run: () => toggleDockPin(app.path),
    },
  ],
  score: 0,
})

export const windowResult = (entry: WindowEntry, icon?: string): Result => ({
  id: `window:${entry.hwnd}`,
  kind: "window",
  title: entry.title,
  subtitle: fileName(entry.process),
  icon: icon || FALLBACK_ICON,
  iconPath: entry.process,
  chips: entry.minimized ? [m.launcher_chip_minimized()] : undefined,
  action: () => activateWindow(entry.hwnd),
  secondaryActions: [
    {
      label: m.launcher_action_close_window(),
      icon: "lucide:x",
      run: () => closeWindow(entry.hwnd),
    },
  ],
  score: 0,
})

export const calcResult = (expression: string): Result | null => {
  const outcome = evaluate(expression)

  if (!outcome) {
    return null
  }

  const base = {
    id: "calc",
    kind: "calc" as const,
    subtitle: expression.trim(),
    icon: "lucide:calculator",
    secondaryActions: [],
    score: 2000,
  }

  if ("error" in outcome) {
    return {
      ...base,
      title: CALC_ERRORS[outcome.error]?.() ?? outcome.error,
      action: () => undefined,
      stay: true,
    }
  }

  return {
    ...base,
    title: formatNumber(outcome.value),
    action: () => navigator.clipboard.writeText(plainNumber(outcome.value)),
  }
}

export const unitResult = (expression: string): Result | null => {
  const converted = convert(expression)

  if (!converted) {
    return null
  }

  return {
    id: "unit",
    kind: "unit",
    title: converted.formatted,
    subtitle: expression.trim(),
    icon: "lucide:arrow-left-right",
    action: () => navigator.clipboard.writeText(converted.formatted),
    secondaryActions: [],
    score: 2100,
  }
}

export const emojiResults = (query: string): Result[] =>
  matchEmoji(query).map(match => ({
    id: `emoji:${match.char}`,
    kind: "emoji",
    title: match.name,
    subtitle: "",
    icon: match.char,
    action: () => navigator.clipboard.writeText(match.char),
    secondaryActions: [],
    score: match.score,
  }))

export const newTimerResult = (draft: Omit<Timer, "id">): Result => ({
  id: "timer:new",
  kind: "timer",
  title:
    draft.kind === "alarm"
      ? m.launcher_timer_set_alarm({ label: draft.label })
      : m.launcher_timer_start({ label: draft.label }),
  subtitle: m.launcher_timer_fires_at({ time: formatClock(draft.fireAt) }),
  icon: draft.kind === "alarm" ? "lucide:alarm-clock" : "lucide:timer",
  action: () => addTimer(draft),
  secondaryActions: [],
  score: 2000,
})

export const pendingTimerResult = (timer: Timer, now = Date.now()): Result => ({
  id: `timer:${timer.id}`,
  kind: "timer",
  title: timer.label,
  subtitle: m.launcher_timer_left({
    remaining: remaining(timer, now),
    time: formatClock(timer.fireAt),
  }),
  icon: timer.kind === "alarm" ? "lucide:alarm-clock" : "lucide:hourglass",
  action: () => undefined,
  secondaryActions: [
    {
      id: "cancel",
      label: m.common_cancel(),
      icon: "lucide:circle-x",
      run: () => cancelTimer(timer.id),
      stay: true,
    },
  ],
  stay: true,
  score: Math.max(1, 1999 - Math.floor((timer.fireAt - now) / 1000)),
})

export const todoResult = (text: string): Result | null => {
  const task = quickTask(text)

  if (!task) {
    return null
  }

  return {
    id: "todo",
    kind: "todo",
    title: m.launcher_todo_add({ title: task.title }),
    subtitle: task.due ? dueLabel(task.due) : m.launcher_todo_saves(),
    icon: "lucide:list-plus",
    action: () => addTaskInMain(task.title, task.due),
    secondaryActions: [],
    score: 2000,
  }
}

const ENGINES: Record<WebSearchEngine, { name: string; url: string }> = {
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
  naver: {
    name: "Naver",
    url: "https://search.naver.com/search.naver?query=",
  },
}

export const engineName = (engine: WebSearchEngine) => ENGINES[engine].name

export const webResult = (query: string, engine: WebSearchEngine): Result => {
  const { name, url } = ENGINES[engine]

  return {
    id: "web",
    kind: "web",
    title: m.launcher_web_search({ query }),
    subtitle: name,
    icon: "lucide:globe",
    action: () => openUrl(url + encodeURIComponent(query)),
    secondaryActions: [],
    score: 0,
  }
}

export const runResult = (command: string): Result => ({
  id: "run",
  kind: "run",
  title: m.launcher_run_title({ command }),
  subtitle: m.launcher_run_subtitle(),
  icon: "lucide:terminal",
  action: () => runCommand(command),
  secondaryActions: [],
  score: 2000,
})

export const openResult = (target: string): Result => {
  const link = /^https?:\/\//i.test(target)

  return {
    id: "open",
    kind: "run",
    title: m.launcher_open_title({ target }),
    subtitle: link ? m.launcher_open_link() : m.launcher_open_path(),
    icon: link ? "lucide:external-link" : "lucide:folder-open",
    action: () => openUrl(target),
    secondaryActions: [],
    score: 700,
  }
}

const clipTitle = (text: string) =>
  text.trim().split("\n")[0].split(/\s+/).join(" ").slice(0, 120)

const clipResult = (entry: ClipEntry, score: number): Result => {
  const size = m.launcher_clip_size({
    lines: entry.text.trim().split("\n").length,
    chars: entry.text.length,
  })

  return {
    id: `clip:${entry.id}`,
    kind: "clip",
    title: clipTitle(entry.text) || m.launcher_clip_whitespace(),
    subtitle: `${relativeTime(entry.at)}, ${size}`,
    icon: entry.pinned ? "lucide:pin" : "lucide:clipboard",
    action: () => clipboardPaste(entry.id),
    secondaryActions: [
      {
        label: m.common_copy(),
        icon: "lucide:copy",
        run: () => clipboardCopy(entry.id),
      },
      {
        label: entry.pinned
          ? m.launcher_action_unpin()
          : m.launcher_action_pin(),
        icon: entry.pinned ? "lucide:pin-off" : "lucide:pin",
        run: () => clipboardPin(entry.id, !entry.pinned),
        stay: true,
      },
      {
        label: m.common_delete(),
        icon: "lucide:trash-2",
        run: () => clipboardRemove(entry.id),
        stay: true,
      },
    ],
    score,
  }
}

export const clipResults = (entries: ClipEntry[], query: string): Result[] => {
  const needle = query.toLowerCase()
  const matched = entries
    .filter(e => e.text.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at)

  return matched.map((e, i) => clipResult(e, matched.length - i))
}

export const clearClipsResult = (): Result => ({
  id: "clip:clear",
  kind: "command",
  title: m.launcher_clip_clear(),
  subtitle: m.launcher_clip_keeps_pinned(),
  icon: "lucide:trash-2",
  action: clipboardClear,
  secondaryActions: [],
  stay: true,
  score: 0,
})

export const atrixOpenResult = (): Result => ({
  id: "atrix:open",
  kind: "atrix",
  title: m.launcher_atrix_open(),
  subtitle: "",
  icon: ATRIX_ICON,
  keywords: ["atrix", "agent", "chat"],
  action: () => askAtrix({ kind: "open" }),
  secondaryActions: [],
  score: 0,
})

export const atrixNewResult = (prompt: string): Result => ({
  id: "atrix:new",
  kind: "atrix",
  title: m.launcher_atrix_new({ text: prompt }),
  subtitle: "",
  icon: "lucide:square-pen",
  action: () => askAtrix({ kind: "new", prompt }),
  secondaryActions: [],
  score: 1,
})

export const conversationResult = (entry: AtrixConversation): Result => ({
  id: `conversation:${entry.key}`,
  kind: "conversation",
  title: entry.title,
  subtitle: entry.source,
  icon: entry.icon,
  keywords: [entry.source],
  running: entry.running,
  action: () => askAtrix({ kind: "conversation", current: entry.current }),
  secondaryActions: [],
  score: 0,
})

export const docResult = (doc: AtrixDoc): Result => ({
  id: `doc:${doc.id}`,
  kind: "doc",
  title: doc.title,
  subtitle: doc.tags.join(", "),
  icon: "lucide:file-text",
  keywords: doc.tags,
  action: () => askAtrix({ kind: "doc", id: doc.id }),
  secondaryActions: [],
  score: 0,
})
