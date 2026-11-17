<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import { callState } from "#lib/voice/call.svelte.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"

let { running, onopen }: { running: boolean; onopen: () => void } = $props()

const BARS = 32

const SAMPLE_MS = 60

const REACH = 40

const call = $derived(callState(running, []))

let levels = $state<number[]>(Array(BARS).fill(0))

let distance = $state(1)

let bar = $state<HTMLButtonElement>()

$effect(() => {
  const timer = setInterval(() => {
    levels = [...levels.slice(1), conversation.muted ? 0 : conversation.level]
  }, SAMPLE_MS)

  return () => clearInterval(timer)
})

const measure = (e: PointerEvent) => {
  const r = bar?.getBoundingClientRect()

  if (!r) {
    return
  }

  const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
  const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)

  distance = Math.min(1, Math.hypot(dx, dy) / REACH)
}
</script>

<svelte:window onpointermove={measure} />

<button
  bind:this={bar}
  type="button"
  class={[
    "absolute inset-y-0 start-0 end-10 flex cursor-text items-center gap-3 rounded-box px-4",
    "bg-raised/80 backdrop-blur-sm transition-opacity duration-140",
  ]}
  style:opacity={0.15 + 0.85 * distance}
  aria-label={m.voice_type()}
  onclick={onopen}
>
  <span class="w-20 shrink-0 truncate text-start text-sm text-base-content/70">
    {call.status}
  </span>
  <span class="flex h-6 min-w-0 flex-1 items-center justify-center gap-0.5">
    {#each levels as level, i (i)}
      <span
        class={[
          "w-1 rounded-full transition-[height] duration-120",
          call.muted ? "bg-base-content/30" : "bg-primary",
        ]}
        style:height="{Math.max(12, Math.min(100, level * 140))}%"
      ></span>
    {/each}
  </span>
</button>
