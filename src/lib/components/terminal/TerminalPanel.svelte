<script lang="ts">
import { Channel, invoke } from "@tauri-apps/api/core"
import { FitAddon, init, Terminal } from "ghostty-web"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"

let { cwd }: { cwd: string } = $props()

let generation = $state(0)

let exited = $state(false)

let failure = $state<string | null>(null)

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const rgbOf = (color: string) => {
  const ctx = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  })

  if (!ctx) {
    return color
  }

  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)

  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data

  return `rgb(${r}, ${g}, ${b})`
}

const mount = (el: HTMLElement) => {
  const id = crypto.randomUUID()
  const fit = new FitAddon()
  let term: Terminal | null = null
  let disposed = false

  const start = async () => {
    await init()

    if (disposed) {
      return
    }

    const next = new Terminal({
      fontSize: 13,
      fontFamily: cssVar("--font-mono"),
      cursorBlink: true,
      theme: {
        background: rgbOf(cssVar("--color-base-100")),
        foreground: rgbOf(cssVar("--color-base-content")),
        cursor: rgbOf(cssVar("--color-primary")),
      },
    })

    term = next
    next.loadAddon(fit)
    next.open(el)
    fit.fit()
    fit.observeResize()

    const channel = new Channel<ArrayBuffer>(data => {
      if (data.byteLength === 0) {
        exited = true

        return
      }

      next.write(new Uint8Array(data))
    })

    await invoke("pty_open", { id, cwd, cols: next.cols, rows: next.rows, channel })

    next.onData(data => {
      invoke("pty_write", { id, data }).catch(() => {})
    })
    next.onResize(({ cols, rows }) => {
      invoke("pty_resize", { id, cols, rows }).catch(() => {})
    })
    next.focus()
  }

  exited = false
  failure = null
  start().catch((e: unknown) => {
    failure = errorText(e)
  })

  return () => {
    disposed = true
    fit.dispose()
    term?.dispose()
    invoke("pty_close", { id }).catch(() => {})
  }
}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2 p-2">
  {#key generation}
    <div class="min-h-0 flex-1 overflow-hidden rounded-field" {@attach mount}></div>
  {/key}
  {#if exited}
    <EmptyState icon="lucide:square-terminal" text={m.terminal_exited()}>
      <button
        type="button"
        class="btn btn-sm"
        onclick={() => {
          generation++
        }}
      >
        {m.terminal_restart()}
      </button>
    </EmptyState>
  {/if}
  <ErrorAlert message={failure} />
</div>
