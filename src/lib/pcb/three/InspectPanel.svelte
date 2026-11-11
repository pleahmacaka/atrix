<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { rem } from "../units.ts"
import type { Inspect, Selection } from "./inspect.svelte.ts"
import { palette } from "./palette.svelte.ts"

let { inspect }: { inspect: Inspect } = $props()

type Frame = { x: number; y: number; width: number | null; height: number | null }

const KEY = "pcb-inspect-panel"

const MIN = { width: 200, height: 96 }

const restore = (): Frame => {
  const fallback = { x: 8, y: 8, width: null, height: null }

  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
  } catch {
    return fallback
  }
}

let frame = $state(restore())

let panel = $state<HTMLElement>()

const linked = $derived(
  [...(inspect.chosen?.parts ?? [])]
    .filter(ref => ref !== inspect.part?.ref)
    .toSorted(),
)

$effect(() => {
  localStorage.setItem(KEY, JSON.stringify(frame))
})

const targetOf = (kind: "part" | "net", item: string): Selection =>
  kind === "part" ? { kind, ref: item } : { kind, name: item }

const clamp = (value: number, max: number) =>
  Math.min(Math.max(0, value), Math.max(0, max))

const drag = (e: PointerEvent, apply: (dx: number, dy: number) => void) => {
  const handle = e.currentTarget

  if (!(handle instanceof HTMLElement) || e.button !== 0) {
    return
  }

  const start = { x: e.clientX, y: e.clientY }

  const move = (m: PointerEvent) => apply(m.clientX - start.x, m.clientY - start.y)

  const stop = () => {
    handle.removeEventListener("pointermove", move)
    handle.removeEventListener("pointerup", stop)
    handle.removeEventListener("pointercancel", stop)
  }

  handle.setPointerCapture(e.pointerId)
  handle.addEventListener("pointermove", move)
  handle.addEventListener("pointerup", stop)
  handle.addEventListener("pointercancel", stop)
}

const moveFrom = (e: PointerEvent) => {
  const origin = { ...frame }
  const bounds = panel?.parentElement

  drag(e, (dx, dy) => {
    frame.x = clamp(origin.x + dx, (bounds?.clientWidth ?? 0) - (panel?.offsetWidth ?? 0))
    frame.y = clamp(origin.y + dy, (bounds?.clientHeight ?? 0) - (panel?.offsetHeight ?? 0))
  })
}

const movable = (node: HTMLElement) => {
  node.addEventListener("pointerdown", moveFrom)

  return () => node.removeEventListener("pointerdown", moveFrom)
}

const resizeFrom = (e: PointerEvent) => {
  const origin = {
    width: panel?.offsetWidth ?? MIN.width,
    height: panel?.offsetHeight ?? MIN.height,
  }

  drag(e, (dx, dy) => {
    frame.width = Math.max(MIN.width, origin.width + dx)
    frame.height = Math.max(MIN.height, origin.height + dy)
  })
}
</script>

{#snippet links(title: string, items: string[], kind: "part" | "net")}
  {#if items.length}
    <details class="group">
      <summary class="text-base-content/70 hover:text-base-content cursor-pointer text-xs select-none">
        {m.pcb_3d_link_count({ title, count: items.length })}
      </summary>
      <div class="mt-1 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {#each items as item (item)}
          {@const target = targetOf(kind, item)}
          <button
            type="button"
            class="badge badge-sm badge-ghost hover:badge-neutral cursor-pointer gap-1"
            onmouseenter={() => (inspect.preview = target)}
            onmouseleave={() => (inspect.preview = null)}
            onfocus={() => (inspect.preview = target)}
            onblur={() => (inspect.preview = null)}
            onclick={() => inspect.fly(target)}
          >
            <span class="size-2 shrink-0 rounded-full" style:background={palette.of(kind, item)}></span>
            {item}
          </button>
        {/each}
      </div>
    </details>
  {/if}
{/snippet}

{#if inspect.selection}
  <section
    bind:this={panel}
    data-tip-avoid
    aria-label={m.pcb_3d_selection()}
    class={[
      "card card-border bg-base-100 border-base-300 absolute flex flex-col text-xs shadow-sm",
      frame.width === null && "w-64",
      frame.height === null && "max-h-72",
    ]}
    style:left={rem(frame.x)}
    style:top={rem(frame.y)}
    style:width={frame.width === null ? undefined : rem(frame.width)}
    style:height={frame.height === null ? undefined : rem(frame.height)}
  >
    <header
      class="border-base-300 flex cursor-move touch-none items-center gap-2 border-b px-2 py-1 select-none"
      {@attach movable}
    >
      <Icon icon="lucide:grip-vertical" class="text-base-content/40 size-4 shrink-0" />
      <span class="min-w-0 flex-1 truncate font-semibold">
        {#if inspect.selection.kind === "part"}
          {inspect.selection.ref}
          <span class="font-normal opacity-70">{inspect.part?.value}</span>
        {:else if inspect.selection.kind === "group"}
          {inspect.selection.label}
          <span class="font-normal opacity-60">{m.pcb_3d_ref_count({ count: inspect.selection.refs.length })}</span>
        {:else}
          <span class="font-normal opacity-60">{m.pcb_3d_net()}</span>
          {inspect.selection.name}
        {/if}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square"
        aria-label={m.pcb_3d_deselect()}
        onpointerdown={e => e.stopPropagation()}
        onclick={() => inspect.select(null)}
      >
        <Icon icon="lucide:x" class="size-4" />
      </button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
      {#if inspect.part}
        {#if inspect.part.category}
          <span><span class="text-base-content/60">{m.pcb_3d_category()}</span> {inspect.part.category}</span>
        {/if}
        {#if inspect.part.purpose}
          <span><span class="text-base-content/60">{m.pcb_3d_purpose()}</span> {inspect.part.purpose}</span>
        {/if}
        {#if inspect.part.block}
          <span><span class="text-base-content/60">{m.pcb_3d_block()}</span> {inspect.part.block}</span>
        {/if}
        {@render links(m.pcb_3d_linked_nets(), inspect.part.nets ?? [], "net")}
      {/if}
      {@render links(m.pcb_3d_linked_parts(), linked, "part")}
    </div>

    <button
      type="button"
      aria-label={m.pcb_3d_resize()}
      class="text-base-content/40 absolute right-0 bottom-0 cursor-se-resize touch-none p-1"
      onpointerdown={resizeFrom}
    >
      <Icon icon="lucide:move-diagonal-2" class="size-3" />
    </button>
  </section>
{/if}
