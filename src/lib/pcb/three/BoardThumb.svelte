<script lang="ts">
import { Canvas } from "@threlte/core"
import { NeutralToneMapping } from "three"
import { m } from "#lib/paraglide/messages.js"
import type { Outputs } from "../derived.ts"
import type { Layer } from "../types.ts"
import BoardScene from "./BoardScene.svelte"
import { boardQueries } from "./board.svelte.ts"
import { Inspect, type Selection } from "./inspect.svelte.ts"
import { Measure } from "./measure.svelte.ts"

let { outputs, target }: { outputs: Outputs; target: Selection | null } = $props()

const board = boardQueries(() => outputs)

const layers: Record<Layer, boolean> = {
  body: true,
  copper: true,
  mask: true,
  silk: true,
  parts: true,
}

const measure = new Measure()

const inspect = new Inspect(
  () => board.pcb.data ?? null,
  () => board.copper.data ?? null,
  true,
)

$effect(() => {
  inspect.select(target)
})
</script>

<div class="flex size-full flex-col">
  <div class="border-base-300 flex flex-col border-b px-2 py-1 text-xs">
    <span class="truncate">
      <span class="font-semibold">
        {target?.kind === "part" ? target.ref : target?.kind === "group" ? target.label : ""}
      </span>
      <span class="opacity-70">
        {target?.kind === "group" ? m.pcb_3d_ref_count({ count: target.refs.length }) : inspect.part?.category}
      </span>
    </span>
    {#if inspect.part?.purpose}
      <span class="truncate opacity-70">{inspect.part.purpose}</span>
    {/if}
  </div>
  <div class="bg-base-200 min-h-0 flex-1 select-none">
  {#if board.ready && board.pcb.data && board.urls}
    <Canvas
      renderMode="on-demand"
      dpr={Math.min(devicePixelRatio, 1.5)}
      shadows={false}
      toneMapping={NeutralToneMapping}
    >
      <BoardScene
        pcb={board.pcb.data}
        copper={board.copper.data ?? null}
        urls={board.urls}
        {layers}
        wireframe={false}
        explode={0}
        section={null}
        {measure}
        {inspect}
        overview={false}
        onerror={() => {}}
      />
    </Canvas>
  {:else}
    <div class="flex size-full items-center justify-center">
      <span class="loading loading-spinner loading-sm opacity-60"></span>
    </div>
  {/if}
  </div>
</div>
