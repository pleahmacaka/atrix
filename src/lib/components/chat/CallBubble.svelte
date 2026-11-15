<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import type { CallState } from "#lib/voice/call.svelte.ts"
import CallControls from "./CallControls.svelte"
import CallOrb from "./CallOrb.svelte"

let {
  call,
  collapsed,
  onToggle,
  onOpen,
  onMute,
  onEnd,
  onDragStart,
  onDrag,
}: {
  call: CallState
  collapsed: boolean
  onToggle: () => void
  onOpen: () => void
  onMute: () => void
  onEnd: () => void
  onDragStart: () => void
  onDrag?: (dx: number, dy: number) => void
} = $props()

const ORB_SIZE = 40

const DRAG_START = 4

let dragged = false

const press = (e: PointerEvent & { currentTarget: HTMLElement }) => {
  dragged = false

  if (e.button !== 0) {
    return
  }

  const target = e.currentTarget
  const x = e.clientX
  const y = e.clientY

  const move = (p: PointerEvent) => {
    const dx = p.clientX - x
    const dy = p.clientY - y

    if (!dragged && Math.hypot(dx, dy) > DRAG_START) {
      dragged = true
      onDragStart()
    }

    if (dragged) {
      onDrag?.(dx, dy)
    }
  }

  const stop = () => {
    target.removeEventListener("pointermove", move)
    target.removeEventListener("lostpointercapture", stop)
  }

  target.setPointerCapture(e.pointerId)
  target.addEventListener("pointermove", move)
  target.addEventListener("lostpointercapture", stop)
}

const unlessDragged = (action: () => void) => () => {
  if (!dragged) {
    action()
  }
}
</script>

<section
  class={[
    "flex items-center gap-2 rounded-box border border-base-300 bg-raised p-2 shadow-lg",
    "dark:border-base-content/16 dark:shadow-black/60",
    collapsed ? "w-max" : "w-80",
  ]}
  aria-label={m.voice_conversation()}
>
  <button
    type="button"
    class="grid size-10 shrink-0 cursor-grab touch-none place-items-center rounded-full"
    aria-label={collapsed ? m.voice_expand() : m.voice_collapse()}
    aria-expanded={!collapsed}
    title={collapsed ? m.voice_expand() : m.voice_collapse()}
    onpointerdown={press}
    onclick={unlessDragged(onToggle)}
  >
    <CallOrb {call} size={ORB_SIZE} />
  </button>
  {#if !collapsed}
    <button
      type="button"
      class="flex min-w-0 flex-1 cursor-grab touch-none flex-col items-start gap-0.5 text-left"
      title={m.voice_return()}
      onpointerdown={press}
      onclick={unlessDragged(onOpen)}
      aria-live="polite"
    >
      <span
        class={[
          "text-xs font-semibold transition-colors duration-140",
          call.hearing ? "text-primary" : "text-base-content/55",
        ]}
      >
        {call.status}
      </span>
      {#if call.reply}
        <span class="line-clamp-2 w-full text-sm break-keep">{call.reply}</span>
      {/if}
      {#if call.said}
        <span
          class={[
            "w-full truncate text-xs transition-colors duration-140",
            call.hearing ? "text-base-content/80" : "text-base-content/55",
          ]}
        >
          {call.said}
        </span>
      {/if}
    </button>
    <CallControls {call} {onMute} {onEnd} />
  {/if}
</section>
