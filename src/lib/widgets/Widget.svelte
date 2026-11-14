<script lang="ts">
import Icon from "@iconify/svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Side } from "#lib/store/panes.svelte.ts"
import { layout, type WidgetLeaf } from "./layout.svelte.ts"
import { WIDGETS } from "./registry.ts"

let { leaf }: { leaf: WidgetLeaf } = $props()

const uid = $props.id()

const DRAG_TYPE = "application/x-atrix-widget"

const definition = $derived(WIDGETS[leaf.type])

const Body = $derived(definition.body)

let zone = $state<Side | null>(null)

const zoneOf = (e: DragEvent): Side => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const edges: [Side, number][] = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ]

  return edges.toSorted((p, q) => p[1] - q[1])[0][0]
}

const HINTS: Record<Side, string> = {
  left: "inset-y-1 left-1 w-1/3",
  right: "inset-y-1 right-1 w-1/3",
  top: "inset-x-1 top-1 h-1/3",
  bottom: "inset-x-1 bottom-1 h-1/3",
}
</script>

<section
  class={[
    "island @container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
    layout.editing && "ring-1 ring-primary/30",
  ]}
  aria-label={definition.label()}
  ondragover={e => {
    if (layout.editing && e.dataTransfer?.types.includes(DRAG_TYPE)) {
      e.preventDefault()
      zone = zoneOf(e)
    }
  }}
  ondragleave={e => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      zone = null
    }
  }}
  ondrop={e => {
    const id = e.dataTransfer?.getData(DRAG_TYPE)
    const side = zone

    zone = null

    if (id && side) {
      e.preventDefault()
      layout.move(id, leaf.id, side)
    }
  }}
>
  <div class="flex min-h-0 flex-1 flex-col" inert={layout.editing}>
    <Body {leaf} />
  </div>

  {#if layout.editing}
    <button
      type="button"
      class={[
        "absolute inset-0 z-10 flex cursor-grab items-center justify-center gap-2",
        "bg-raised/80 text-base-content/80 backdrop-blur-md active:cursor-grabbing",
      ]}
      aria-label="{m.widget_move()}: {definition.label()}"
      title={m.widget_move()}
      draggable="true"
      ondragstart={e => {
        e.dataTransfer?.setData(DRAG_TYPE, leaf.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move"
        }
      }}
    >
      <Icon icon={definition.icon} class="size-5 opacity-70" />
      <span class="truncate text-sm font-medium">{definition.label()}</span>
    </button>
    <div class="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5">
      {#if definition.options.length}
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.widget_options()}
          title={m.widget_options()}
          popovertarget="{uid}-options"
          style:anchor-name="--{uid}-options"
        >
          <Icon icon="lucide:sliders-horizontal" class="size-4" />
        </button>
      {/if}
      {#if definition.closable}
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.widget_hide()}
          title={m.widget_hide()}
          onclick={() => layout.setHidden(leaf.id, true)}
        >
          <Icon icon="lucide:minus" class="size-4" />
        </button>
      {/if}
    </div>
    {#if definition.options.length}
      <div
        id="{uid}-options"
        popover="auto"
        style:position-anchor="--{uid}-options"
        class={[
          "options popover-box fixed inset-auto m-0 my-1 hidden flex-col gap-3 p-3",
          "text-sm open:flex",
        ]}
      >
        {#each definition.options as option (option.key)}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-base-content/60">{option.label()}</span>
            <Segmented
              items={option.choices.map(c => ({
                id: c.value,
                label: c.label(),
                icon: c.icon,
              }))}
              value={leaf.options[option.key] ?? option.choices[0].value}
              onpick={value => layout.setOption(leaf.id, option.key, value)}
            />
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if zone}
    <div
      class={[
        "pointer-events-none absolute z-20 rounded-field border-2 border-primary bg-primary/12",
        HINTS[zone],
      ]}
    ></div>
  {/if}
</section>

<style>
  .options {
    position-area: block-end span-inline-start;
    position-try-fallbacks: flip-block, flip-inline;
  }
</style>
