import { invoke } from "@tauri-apps/api/core"
import { emitTo, listen } from "@tauri-apps/api/event"
import { getCurrentWindow, Window } from "@tauri-apps/api/window"
import { bubble, type CallCommand, type CallSync } from "./call.svelte.ts"
import { conversation } from "./conversation.svelte.ts"

const OVERLAY = "overlay"

const STATE_EVENT = "call:state"

const COMMAND_EVENT = "call:command"

const SYNC_MS = 100

type Handlers = Record<Exclude<CallCommand, "ready">, () => void>

export const sendCommand = (command: CallCommand) =>
  emitTo("main", COMMAND_EVENT, command)

export const onCallState = (handler: (sync: CallSync) => void) =>
  listen<CallSync>(STATE_EVENT, e => handler(e.payload))

export const mirrorCall = (payload: () => CallSync, handlers: Handlers) => {
  const win = getCurrentWindow()

  let focused = $state(true)

  let sent = ""

  const report = (e: unknown) => console.error(e)

  const sync = (next: CallSync) => {
    const text = JSON.stringify(next)

    if (text === sent) {
      return
    }

    sent = text
    emitTo(OVERLAY, STATE_EVENT, JSON.parse(text)).catch(report)
  }

  const command = (e: { payload: CallCommand }) => {
    const next = e.payload

    if (next === "ready") {
      sent = ""
      return
    }

    if (next === "open") {
      win
        .unminimize()
        .then(() => win.setFocus())
        .catch(report)
      handlers.open()

      return
    }

    handlers[next]()
  }

  $effect(() => {
    const stops = [
      win.onFocusChanged(e => {
        focused = e.payload
      }),
      listen<CallCommand>(COMMAND_EVENT, command),
    ]

    win.isFocused().then(f => {
      focused = f
    })

    return () => {
      for (const stop of stops) {
        stop.then(f => f())
      }
    }
  })

  $effect(() => {
    if (!conversation.owner || focused) {
      return
    }

    const opened = invoke("overlay_open", bubble.get("overlay") ?? {}).catch(
      report,
    )
    const timer = setInterval(() => sync(payload()), SYNC_MS)

    return () => {
      clearInterval(timer)
      sent = ""
      opened
        .then(() => Window.getByLabel(OVERLAY))
        .then(w => w?.destroy())
        .catch(report)
    }
  })
}
