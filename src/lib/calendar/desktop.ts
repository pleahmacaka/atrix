import { launchedComponents } from "#lib/components/settings/desktopSettings.ts"
import { setShareWatch } from "#lib/desktop/native/share.ts"
import { logFailure } from "#lib/logging.ts"
import { remoteHost, serveWindow } from "#lib/p2p/float.svelte.ts"
import { hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import type { HostEvent } from "#lib/p2p/protocol.ts"
import { desktop, platform } from "#lib/platform.ts"
import { startReminders } from "./reminders.ts"
import { sharedTags } from "./shared.svelte.ts"
import { putEvent } from "./store.ts"
import { type Todo, todoEvent } from "./todo.ts"

const PANEL = "panel"

const PANEL_EVENTS = new Set<HostEvent["type"]>(["state", "ds", "kg"])

const SHARE_CHECK_MS = 30_000

const watchSharing = async () => {
  const tags = await sharedTags(hostList().map(h => h.view))

  await setShareWatch(tags.some(t => t.hideWhileSharing))
}

export const startDesktopCalendar = () => {
  if (!desktop) {
    return
  }

  const check = () =>
    watchSharing().catch(e => logFailure("calendar share watch", e))

  startReminders()
  serveWindow(PANEL, event => PANEL_EVENTS.has(event.type))

  if (platform !== "windows") {
    return
  }

  launchedComponents()
    .then(({ shell }) => {
      if (shell) {
        check()
        setInterval(check, SHARE_CHECK_MS)
      }
    })
    .catch(e => logFailure("calendar share watch", e))
}

export const addTodoInMain = async (todo: Todo) => {
  const remote = remoteHost(LOCAL)

  try {
    await remote.ready
    await putEvent(remote.view, todoEvent(todo))
  } finally {
    remote.stop()
  }
}
