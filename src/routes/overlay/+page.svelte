<script lang="ts">
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window"
import CallBubble from "#lib/components/chat/CallBubble.svelte"
import { bubble, type CallSync } from "#lib/voice/call.svelte.ts"
import { onCallState, sendCommand } from "#lib/voice/overlay.svelte.ts"

const root = document.documentElement

const win = getCurrentWindow()

let sync = $state<CallSync | null>(null)

let box = $state<HTMLElement>()

root.dataset.overlay = ""

$effect(() => {
  const stops = [
    onCallState(next => {
      sync = next
      root.dataset.theme = next.theme
      root.style.setProperty("--color-primary", next.ink)
    }),
    win.onMoved(async e => {
      const { x, y } = e.payload.toLogical(await win.scaleFactor())

      bubble.set("overlay", { x, y })
    }),
  ]

  sendCommand("ready")

  return () => {
    for (const stop of stops) {
      stop.then(f => f())
    }
  }
})

$effect(() => {
  if (!box) {
    return
  }

  const observer = new ResizeObserver(([entry]) => {
    const { inlineSize, blockSize } = entry.borderBoxSize[0]

    win.setSize(new LogicalSize(Math.ceil(inlineSize), Math.ceil(blockSize))).catch(console.error)
  })

  observer.observe(box)

  return () => observer.disconnect()
})
</script>

{#if sync}
  <div bind:this={box} class="w-max p-2">
    <CallBubble
      call={sync.call}
      collapsed={sync.collapsed}
      onToggle={() => sendCommand("toggle")}
      onOpen={() => sendCommand("open")}
      onMute={() => sendCommand("mute")}
      onEnd={() => sendCommand("end")}
      onDragStart={() => win.startDragging()}
    />
  </div>
{/if}
