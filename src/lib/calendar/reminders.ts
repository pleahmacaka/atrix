import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import { logFailure } from "#lib/logging.ts"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { holidays } from "./calendar.svelte.ts"
import { addDays, parseLocal } from "./dates.ts"
import { eventSpan } from "./format.ts"
import { listShared, type SharedEvent } from "./shared.svelte.ts"

const TICK_MS = 30_000

const CATCH_UP_MS = 5 * 60_000

const LOOKAHEAD_DAYS = 2

const MINUTE_MS = 60_000

const remindAt = (event: SharedEvent) =>
  event.allDay || event.reminder === null
    ? null
    : parseLocal(event.start).getTime() - event.reminder * MINUTE_MS

const keyOf = (event: SharedEvent) =>
  `${event.host.id}:${event.id}@${event.start}`

const allowed = async () =>
  (await isPermissionGranted()) || (await requestPermission()) === "granted"

export const startReminders = () => {
  const fired = new Set<string>()
  let last = Date.now()

  const tick = async () => {
    const now = Date.now()
    const since = Math.max(last, now - CATCH_UP_MS)
    const events = await listShared(
      hostList().map(h => h.view),
      new Date(since),
      addDays(new Date(now), LOOKAHEAD_DAYS),
      holidays.isHoliday,
    )

    last = now

    const due = events.filter(event => {
      const at = remindAt(event)

      return at !== null && at > since && at <= now && !fired.has(keyOf(event))
    })

    if (due.length === 0 || !(await allowed())) {
      return
    }

    for (const event of due) {
      fired.add(keyOf(event))
      sendNotification({
        title: event.title,
        body: eventSpan(event, m.calendar_all_day()),
      })
    }
  }

  void holidays.load()
  setInterval(() => {
    tick().catch(e => logFailure("calendar reminders", e))
  }, TICK_MS)
}
