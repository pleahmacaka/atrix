<script lang="ts">
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager"
import type { FitAddon, Terminal as Screen } from "ghostty-web"
import { untrack } from "svelte"
import { on } from "svelte/events"
import { settings } from "#lib/store/settings.svelte.ts"
import { conpty, escapeKey } from "./escape"
import { type Attachment, attach, resize, spawn, write } from "./pty"
import { loadFont, prepare } from "./ready"
import { THEME_ATTRIBUTES, terminalTheme } from "./theme"

let {
  shell,
  cwd = null,
  pty = null,
  run,
  active = true,
  shown = true,
  onexit,
  onpty,
  ontitle,
  oninput,
  class: className,
}: {
  shell: string
  cwd?: string | null
  pty?: number | null
  run?: string
  active?: boolean
  shown?: boolean
  onexit?: (code: number) => void
  onpty?: (id: number) => void
  ontitle?: (title: string) => void
  oninput?: (data: string) => void
  class?: string
} = $props()

let host = $state<HTMLDivElement>()

let term = $state.raw<Screen>()

let background = $state<string>()

let fit: FitAddon | undefined

let attachment: Attachment | undefined

let fontRequest = 0

const copy = () => {
  if (!term?.hasSelection()) {
    return
  }

  writeText(term.getSelection())
  term.clearSelection()
}

// an image clipboard has no text; Claude Code reads it on Alt+V under Windows and on Ctrl+V elsewhere, WSL included
const imagePasteKey = () =>
  navigator.userAgent.includes("Windows") && !shell.startsWith("wsl:")
    ? "\x1bv"
    : "\x16"

const paste = async () => {
  const text = await readText().catch(() => "")

  if (text) {
    term?.paste(text.replaceAll("\r\n", "\r").replaceAll("\n", "\r"))
  } else {
    term?.input(imagePasteKey(), true)
  }
}

const latin = (e: KeyboardEvent) => {
  if (e.code.startsWith("Key")) {
    const letter = e.code.slice(3).toLowerCase()

    return e.shiftKey ? letter.toUpperCase() : letter
  }

  return e.key.length === 1 ? e.key : null
}

const keys = (e: KeyboardEvent) => {
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey
  const bare = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey

  if (e.key === "Escape" && bare && conpty(shell)) {
    term?.input(escapeKey(shell), true)

    return true
  }

  if (ctrl && e.code === "KeyV") {
    paste()

    return true
  }

  if (ctrl && e.code === "KeyC" && (e.shiftKey || term?.hasSelection())) {
    copy()

    return true
  }

  const key = e.altKey && !e.ctrlKey && !e.metaKey ? latin(e) : null

  // ghostty-web sends Alt+key as the bare key, so TUI shortcuts such as Alt+V never arrive
  if (key) {
    term?.input(`\x1b${key}`, true)

    return true
  }

  return false
}

// keys an IME passes through outside a composition, like the space that commits Hangul, only arrive here
const onbeforeinput = (e: InputEvent) => {
  if (e.inputType === "insertText" && !e.isComposing && e.data) {
    term?.input(e.data, true)
  }
}

const oncontextmenu = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()

  if (term?.hasSelection()) {
    copy()
  } else {
    paste()
  }
}

const listen = (node: HTMLDivElement) => {
  const stops = [
    on(node, "keydown", e => e.stopPropagation()),
    on(node, "beforeinput", onbeforeinput),
    on(node, "contextmenu", oncontextmenu, { capture: true }),
  ]

  return () => {
    for (const stop of stops) {
      stop()
    }
  }
}

const scroller = (screen: Screen, node: HTMLElement) => {
  let wheel = 0

  return (e: WheelEvent) => {
    const speed = settings.terminalScroll / 100

    if (speed === 1 || screen.buffer.active.type === "alternate") {
      return false
    }

    const row = node.clientHeight / screen.rows
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY : e.deltaY / row

    wheel += delta * speed

    const lines = Math.trunc(wheel)

    wheel -= lines
    screen.scrollLines(lines)

    return true
  }
}

$effect(() => {
  const node = host

  if (!node) {
    return
  }

  let disposed = false
  const start = untrack(() => ({
    shell,
    cwd,
    pty,
    run,
    font: settings.terminalFont,
    weight: settings.terminalWeight,
    size: settings.terminalSize,
  }))

  const open = async () => {
    const fontFamily = await prepare(start.font, start.weight)
    const ghostty = await import("ghostty-web")

    if (disposed) {
      return
    }

    const theme = terminalTheme()
    const screen = new ghostty.Terminal({
      fontFamily,
      fontSize: start.size,
      theme,
      cursorBlink: untrack(() => active),
    })

    background = theme.background
    fit = new ghostty.FitAddon()
    screen.loadAddon(fit)
    screen.open(node)
    fit.fit()
    fit.observeResize()
    screen.attachCustomKeyEventHandler(keys)
    screen.attachCustomWheelEventHandler(scroller(screen, node))
    screen.onTitleChange(title => ontitle?.(title))
    term = screen

    const live = {
      onData: (data: Uint8Array) => {
        if (!disposed) {
          screen.write(data)
        }
      },
      onExit: (code: number) => !disposed && onexit?.(code),
    }

    const id =
      start.pty ??
      (await spawn({
        shell: start.shell,
        cwd: start.cwd,
        cols: screen.cols,
        rows: screen.rows,
      }).catch((reason: unknown) => {
        screen.write(`\r\n${String(reason)}\r\n`)

        return null
      }))

    if (id === null) {
      return
    }

    onpty?.(id)

    const attached = await attach(id, live).catch(() => null)

    if (!attached) {
      live.onExit(1)

      return
    }

    if (disposed) {
      attached.detach()

      return
    }

    attachment = attached

    // ghostty answers queries inside write, so history replays before onData; it also throws on empty input
    if (attached.history.length > 0) {
      screen.write(attached.history)
    }

    resize(id, screen.cols, screen.rows)
    screen.onData(data => {
      write(id, data)
      oninput?.(data)
    })
    screen.onResize(size => resize(id, size.cols, size.rows))
    attached.flow()

    if (start.pty === null && start.run) {
      write(id, `${start.run}\r`)
    }
  }

  open()

  const recolor = new MutationObserver(() => {
    const theme = terminalTheme()

    background = theme.background
    term?.renderer?.setTheme(theme)
  })

  recolor.observe(document.documentElement, {
    attributes: true,
    attributeFilter: THEME_ATTRIBUTES,
  })

  return () => {
    disposed = true
    recolor.disconnect()
    attachment?.detach()
    fit?.dispose()
    term?.dispose()
  }
})

$effect(() => {
  const screen = term
  const font = settings.terminalFont
  const weight = settings.terminalWeight
  const size = settings.terminalSize

  if (!screen) {
    return
  }

  const request = ++fontRequest

  loadFont(font, weight).then(fontFamily => {
    if (request !== fontRequest) {
      return
    }

    screen.options.fontFamily = fontFamily
    screen.options.fontSize = size
    fit?.fit()
  })
})

$effect(() => {
  if (term) {
    term.options.cursorBlink = active
  }
})

$effect(() => {
  const screen = term

  if (!screen) {
    return
  }

  if (shown) {
    screen.startRenderLoop()

    return
  }

  // ghostty-web redraws every frame until disposed and restarts the loop after each resize
  const pause = () => screen.cancelRenderLoop()
  const resized = screen.onResize(() => queueMicrotask(pause))

  pause()

  return () => resized.dispose()
})

$effect(() => {
  if (active && term) {
    fit?.fit()
    term.focus()
  }
})
</script>

<div
  class={["size-full overflow-hidden py-1.5 ps-3 pe-1", className]}
  style:background-color={background}
  {@attach listen}
>
  <div bind:this={host} class="size-full caret-transparent"></div>
</div>
