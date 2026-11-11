<script lang="ts">
import Icon from "@iconify/svelte"
import { Canvas } from "@threlte/core"
import type { CameraControlsRef } from "@threlte/extras"
import { NeutralToneMapping } from "three"
import { m } from "#lib/paraglide/messages.js"
import ToolChip, { RANGE, SEGMENTS, TOOLBAR } from "../ToolChip.svelte"
import type { Artwork, Copper, Layer, Pcb } from "../types.ts"
import BoardScene from "./BoardScene.svelte"
import ColorSettings from "./ColorSettings.svelte"
import InspectPanel from "./InspectPanel.svelte"
import { Inspect, located } from "./inspect.svelte.ts"
import { Measure } from "./measure.svelte.ts"
import { look, spanOf, VIEWS } from "./view.ts"

let {
  pcb,
  copper,
  artwork = null,
  urls,
}: {
  pcb: Pcb
  copper: Copper | null
  artwork?: Artwork | null
  urls: Record<Layer, string>
} = $props()

const LAYER_LABELS: { id: Layer; label: () => string }[] = [
  { id: "parts", label: m.pcb_3d_layer_parts },
  { id: "silk", label: m.pcb_3d_layer_silk },
  { id: "mask", label: m.pcb_3d_layer_mask },
  { id: "copper", label: m.pcb_3d_layer_copper },
  { id: "body", label: m.pcb_3d_layer_body },
]

let layers = $state<Record<Layer, boolean>>({
  body: true,
  copper: true,
  mask: true,
  silk: true,
  parts: true,
})

let wireframe = $state(false)

let sectioned = $state(false)

let cut = $state(0)

let explode = $state(0)

let failed = $state(false)

let controls = $state<CameraControlsRef>()

let coloring = $state(false)

const measure = new Measure()

const inspect = new Inspect(
  () => pcb,
  () => copper,
)

if (located.target) {
  inspect.select(located.target)
  located.target = null
}

const half = $derived((pcb.dims.board.max[0] - pcb.dims.board.min[0]) / 2)

const delta = $derived(measure.delta)

const mm = (value: number) => value.toFixed(2)

const toggle = (id: Layer) => {
  layers[id] = !layers[id]
}
</script>

<svelte:window
  onkeydown={e => {
    if (e.key === "Escape") {
      inspect.select(null)
    }
  }}
/>

<div class="flex size-full min-h-0 flex-col">
  <div role="toolbar" aria-label={m.pcb_3d_toolbar()} class={[TOOLBAR, "flex-wrap"]}>
    <fieldset aria-label={m.pcb_3d_views()} class={SEGMENTS}>
      {#each VIEWS as v (v.id)}
        <ToolChip
          label={v.label()}
          onclick={() => controls && look(controls, v.id, spanOf(pcb))}
        />
      {/each}
    </fieldset>

    <fieldset aria-label={m.pcb_3d_layers()} class={SEGMENTS}>
      {#each LAYER_LABELS as l (l.id)}
        <ToolChip label={l.label()} pressed={layers[l.id]} onclick={() => toggle(l.id)} />
      {/each}
    </fieldset>

    <fieldset aria-label={m.pcb_3d_tools()} class={SEGMENTS}>
      <ToolChip
        label={m.pcb_3d_wireframe()}
        icon="lucide:grid-3x3"
        pressed={wireframe}
        iconOnly
        onclick={() => (wireframe = !wireframe)}
      />
      <ToolChip
        label={m.pcb_3d_measure()}
        icon="lucide:ruler"
        pressed={measure.active}
        iconOnly
        onclick={() => {
          measure.active = !measure.active
          measure.clear()
          inspect.select(null)
        }}
      />
      <ToolChip
        label={m.pcb_3d_section()}
        icon="lucide:scissors"
        pressed={sectioned}
        iconOnly
        onclick={() => (sectioned = !sectioned)}
      />
      <ToolChip
        label={m.pcb_3d_colors()}
        icon="lucide:palette"
        pressed={coloring}
        iconOnly
        onclick={() => (coloring = true)}
      />
    </fieldset>

    <label class={RANGE}>
      <Icon icon="lucide:unfold-vertical" class="text-base-content/60 size-4" />
      <span class="text-base-content/70">{m.pcb_3d_explode()}</span>
      <input
        type="range"
        class="range range-xs w-24"
        min="0"
        max="12"
        step="0.5"
        bind:value={explode}
        aria-label={m.pcb_3d_explode_gap()}
      />
    </label>

    {#if sectioned}
      <label class={RANGE}>
        <span class="text-base-content/70">{m.pcb_3d_section_position()}</span>
        <input
          type="range"
          class="range range-xs w-32"
          min={-half}
          max={half}
          step="0.1"
          bind:value={cut}
          aria-label={m.pcb_3d_section_position()}
        />
        <span class="w-16 text-right tabular-nums">{mm(cut)} mm</span>
      </label>
    {/if}
  </div>

  <div class="bg-base-200 relative min-h-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing" data-tip-root>
    <Canvas
      renderMode="on-demand"
      dpr={Math.min(devicePixelRatio, 1.5)}
      shadows={false}
      toneMapping={NeutralToneMapping}
    >
      <BoardScene
        {pcb}
        {urls}
        {layers}
        {wireframe}
        {explode}
        section={sectioned ? cut : null}
        {measure}
        {inspect}
        {copper}
        {artwork}
        bind:controls
        onerror={() => (failed = true)}
      />
    </Canvas>

    {#if failed}
      <div role="alert" class="alert alert-error alert-soft absolute right-2 bottom-2 left-2 text-sm">
        {m.pcb_3d_load_failed()}
      </div>
    {/if}

    {#if !measure.active}
      <InspectPanel {inspect} />
      <ColorSettings {pcb} {copper} bind:open={coloring} />
    {/if}

    {#if measure.active}
      <div class="card card-border bg-base-100 border-base-300 absolute top-2 left-2 w-56 text-sm">
        <div class="card-body gap-1 p-4">
          {#if delta}
            <span class="font-semibold tabular-nums">{mm(measure.distance ?? 0)} mm</span>
            <span class="text-base-content/70 tabular-nums">ΔX {mm(delta.x)} mm</span>
            <span class="text-base-content/70 tabular-nums">ΔY {mm(delta.y)} mm</span>
            <span class="text-base-content/70 tabular-nums">ΔZ {mm(delta.z)} mm</span>
          {:else}
            <span class="text-base-content/70">
              {measure.points.length === 0 ? m.pcb_3d_pick_first() : m.pcb_3d_pick_second()}
            </span>
          {/if}
          <button
            type="button"
            class="btn btn-ghost btn-sm mt-1 self-start"
            disabled={measure.points.length === 0}
            onclick={measure.clear}
          >
            <Icon icon="lucide:eraser" class="size-4" />
            {m.pcb_3d_clear()}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
