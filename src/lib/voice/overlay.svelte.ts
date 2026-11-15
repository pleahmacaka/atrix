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

  $effect(() => {
    const stops = [
      win.onFocusChanged(e => {
        focused = e.payload
      }),
      listen<CallCommand>(COMMAND_EVENT, e => {
        if (e.payload === "ready") {
          sent = ""
        } else if (e.payload === "open") {
          win
            .unminimize()
            .then(() => win.setFocus())
            .catch(console.error)
          handlers.open()
        } else {
          handlers[e.payload]()
        }
      }),
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
      console.error,
    )
    const timer = setInterval(() => {
      const next = JSON.stringify(payload())

      if (next !== sent) {
        sent = next
        emitTo(OVERLAY, STATE_EVENT, JSON.parse(next)).catch(console.error)
      }
    }, SYNC_MS)

    return () => {
      clearInterval(timer)
      sent = ""
      opened
        .then(() => Window.getByLabel(OVERLAY))
        .then(w => w?.destroy())
        .catch(console.error)
    }
  })
}
