import { remoteHost, serveWindow } from "#lib/p2p/float.svelte.ts"
import { LOCAL } from "#lib/p2p/hosts.svelte.ts"
import type { HostEvent } from "#lib/p2p/protocol.ts"
import { desktop } from "#lib/platform.ts"
import { startReminders } from "./reminders.ts"
import { newTask, putTask } from "./store.ts"

const PANEL = "panel"

const PANEL_EVENTS = new Set<HostEvent["type"]>(["state", "ds", "kg"])

export const startDesktopCalendar = () => {
  if (!desktop) {
    return
  }

  startReminders()
  serveWindow(PANEL, event => PANEL_EVENTS.has(event.type))
}

export const addTaskInMain = async (title: string, due: string | null) => {
  const remote = remoteHost(LOCAL)

  try {
    await remote.ready
    await putTask(remote.view, newTask(title, due))
  } finally {
    remote.stop()
  }
}
