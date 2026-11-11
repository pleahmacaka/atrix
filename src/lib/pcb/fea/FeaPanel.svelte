<script lang="ts">
import Icon from "@iconify/svelte"
import { createQuery } from "@tanstack/svelte-query"
import { Canvas } from "@threlte/core"
import { NoToneMapping } from "three"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { keyOf, loadDerived, type Outputs } from "../derived.ts"
import { TOOLBAR } from "../ToolChip.svelte"
import { loadStressModel } from "./assets.ts"
import FeaScene from "./FeaScene.svelte"
import { FEA_DIR, FEA_INDEX, type Fea, VERDICT, verdictOf } from "./types.ts"

let { assembly }: { assembly: Outputs } = $props()

let picked = $state<string>()

let panel = $state(true)

const fea = createQuery(() => ({
  queryKey: keyOf(assembly, "fea", [FEA_INDEX]),
  queryFn: () => loadDerived<Fea>(assembly, FEA_INDEX),
  staleTime: Number.POSITIVE_INFINITY,
}))

const selected = $derived(fea.data?.cases.find(c => c.id === picked) ?? fea.data?.cases[0])

const model = createQuery(() => ({
  queryKey: keyOf(assembly, "fea-model", [`${FEA_DIR}/${selected?.glb}`]),
  queryFn: () => (selected ? loadStressModel(assembly, selected.glb) : null),
  enabled: !!selected,
  staleTime: Number.POSITIVE_INFINITY,
}))

const range = $derived(selected?.colorRange ?? [0, 30])

const fixed = (v: number, digits = 1) => v.toFixed(digits)
</script>

<div class="flex size-full flex-col @3xl:flex-row">
  <div class="flex min-w-0 flex-1 flex-col">
    <div role="toolbar" aria-label={m.pcb_fea_toolbar()} class={TOOLBAR}>
      {#if selected}
        <span class="flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-sm">
          <span class="size-3 shrink-0 rounded-full border-2 border-red-500"></span>
          <span class="min-w-0 truncate" title={selected.description}>{selected.description}</span>
        </span>
      {/if}
      {#if !panel}
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square ml-auto"
          aria-label={m.pcb_fea_expand_panel()}
          title={m.pcb_fea_expand_panel()}
          onclick={() => (panel = true)}
        >
          <Icon icon="lucide:panel-right-open" class="size-4" />
        </button>
      {/if}
    </div>

    <div class="relative min-h-64 flex-1 touch-none select-none">
      {#if model.data && selected}
        <Canvas toneMapping={NoToneMapping}>
          <FeaScene model={model.data} marker={selected.locationXyzMm} loads={selected.loads} />
        </Canvas>
      {:else if fea.isError || model.isError}
        <div class="flex size-full items-center justify-center p-6">
          <div role="alert" class="alert alert-error alert-soft text-sm">
            {m.pcb_fea_load_failed()}
          </div>
        </div>
      {:else}
        <div class="size-full p-4" aria-busy="true">
          <div class="skeleton size-full"></div>
        </div>
      {/if}

      <div
        class={[
          "absolute top-2 left-2 flex flex-col gap-2 rounded-box bg-base-100/85 p-2",
          "text-xs backdrop-blur",
        ]}
      >
        <div class="flex items-center gap-2">
          <span class="size-4 rounded-field bg-fuchsia-500"></span>
          <span>{m.pcb_fea_over_limit()}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="size-4 rounded-field bg-orange-500"></span>
          <span>{m.pcb_fea_load()}</span>
        </div>
        <div class="flex gap-2">
          <div class="legend h-40 w-4 rounded-field"></div>
          <div class="flex flex-col justify-between tabular-nums">
            <span>{range[1]} MPa</span>
            <span>{(range[0] + range[1]) / 2}</span>
            <span>{range[0]}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  {#if panel}
    <aside
      class={[
        "flex max-h-80 shrink-0 flex-col gap-4 overflow-y-auto border-t border-base-300 p-4",
        "@3xl:max-h-none @3xl:w-80 @3xl:border-t-0 @3xl:border-l",
      ]}
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold">{m.pcb_fea_title()}</h3>
          {#if fea.data}
            <p class="text-xs text-base-content/60">
              {fea.data.material.name}, {fea.data.assumptions[0]}
            </p>
          {/if}
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.pcb_fea_collapse_panel()}
          title={m.pcb_fea_collapse_panel()}
          onclick={() => (panel = false)}
        >
          <Icon icon="lucide:panel-right-close" class="size-4" />
        </button>
      </div>

      {#if fea.data}
        <div role="note" class="alert alert-info alert-soft px-3 py-2 text-xs">
          <Icon icon="lucide:info" class="size-4" />
          <span>
            {m.pcb_fea_basis()}
            {#if fea.data.generatedAt}
              {m.pcb_fea_generated_at({ date: new Date(fea.data.generatedAt).toLocaleString(getLocale()) })}
            {/if}
            {m.pcb_fea_rerun_hint()}
          </span>
        </div>

        <details class="collapse collapse-arrow rounded-box border border-base-300">
          <summary class="collapse-title min-h-0 px-3 py-2 text-xs">{m.pcb_fea_conditions()}</summary>
          <ul class="collapse-content list-disc pl-7 text-xs text-base-content/70">
            {#each fea.data.assumptions as a (a)}
              <li>{a}</li>
            {/each}
          </ul>
        </details>

        <ul class="menu w-full gap-1 p-0">
          {#each fea.data.cases as c (c.id)}
            {@const v = VERDICT[verdictOf(c)]}
            <li>
              <button
                type="button"
                class={["flex flex-col items-stretch gap-1", selected?.id === c.id && "menu-active"]}
                aria-pressed={selected?.id === c.id}
                onclick={() => (picked = c.id)}
              >
                <span class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                  <span class={["badge badge-sm badge-soft", v.badge]}>{v.label()}</span>
                </span>
                <span class="grid grid-cols-2 gap-x-3 text-xs tabular-nums opacity-70">
                  <span>{m.pcb_fea_safety_factor({ value: fixed(c.safetyFactor, 2) })}</span>
                  <span>{m.pcb_fea_max_stress({ value: fixed(c.maxStressMPa) })}</span>
                  <span>{m.pcb_fea_plug_shift({ value: fixed(c.plugShiftMm, 3) })}</span>
                  <span class="truncate">{m.pcb_fea_location({ location: c.location })}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .legend {
    background: linear-gradient(
      to top,
      #440154,
      #482878,
      #3e4989,
      #31688e,
      #26828e,
      #1f9e89,
      #35b779,
      #6ece58,
      #b5de2b,
      #fde725
    );
  }
</style>
