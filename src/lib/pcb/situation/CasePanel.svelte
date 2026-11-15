<script lang="ts">
import Icon from "@iconify/svelte"
import { createQuery } from "@tanstack/svelte-query"
import { Canvas } from "@threlte/core"
import { NeutralToneMapping } from "three"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { derivedHrefs, type Outputs } from "../derived.ts"
import { RANGE, TOOLBAR } from "../ToolChip.svelte"
import type { Kit } from "./assets.ts"
import CaseScene from "./CaseScene.svelte"
import { type CaseInfo, partFile } from "./types.ts"

let { kit, info, assembly }: { kit: Kit; info: CaseInfo; assembly: Outputs } = $props()

let explode = $state(18)

let shown = $state<Record<string, boolean>>({})

let picked = $state<string>()

let panel = $state(true)

const variant = $derived(info.variants?.some(v => v.id === picked) ? picked : info.variants?.[0]?.id)

const variantTitle = $derived(info.variants?.find(v => v.id === variant)?.title)

const stl = (file: string) => `cases/${info.id}/${file}.stl`

const files = createQuery(() => ({
  queryKey: ["case-stl", info.id, variant, assembly.manifest.source.sha256],
  queryFn: () => derivedHrefs(assembly, info.parts.map(p => stl(partFile(p, variant)))),
  staleTime: Number.POSITIVE_INFINITY,
}))

const toggle = (name: string) => {
  shown[name] = shown[name] === false
}

const sizeText = $derived(info.size.map(v => v.toFixed(1)).join(" × "))
</script>

<div class="flex size-full flex-col @3xl:flex-row">
  <div class="flex min-w-0 flex-1 flex-col">
    <div role="toolbar" aria-label={m.pcb_sim_case_toolbar()} class={TOOLBAR}>
      <label class={RANGE}>
        <Icon icon="lucide:unfold-vertical" class="text-base-content/60 size-4" />
        <span class="text-base-content/70">{m.pcb_sim_explode()}</span>
        <input
          type="range"
          class="range range-xs w-24"
          min="0"
          max="40"
          step="0.5"
          bind:value={explode}
          aria-label={m.pcb_sim_explode_gap()}
        />
      </label>
      {#if !panel}
        <IconButton
          icon="lucide:panel-right-open"
          label={m.pcb_fea_expand_panel()}
          class="ml-auto"
          onclick={() => (panel = true)}
        />
      {/if}
    </div>
    <div class="relative min-h-64 flex-1 touch-none select-none">
      <Canvas toneMapping={NeutralToneMapping}>
        <CaseScene {kit} {info} {explode} {shown} {variant} />
      </Canvas>
    </div>
  </div>

  {#if panel}
    <aside
      class={[
        "flex max-h-72 shrink-0 flex-col gap-4 overflow-y-auto border-t border-base-300 p-4",
        "@3xl:max-h-none @3xl:w-72 @3xl:border-t-0 @3xl:border-l",
      ]}
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold">{info.title}</h3>
          <p class="text-xs text-base-content/60 tabular-nums">{m.pcb_sim_outline({ size: sizeText })}</p>
        </div>
        <IconButton
          icon="lucide:panel-right-close"
          label={m.pcb_fea_collapse_panel()}
          onclick={() => (panel = false)}
        />
      </div>

      {#if info.variants?.length}
        <div class="flex flex-col gap-2">
          <span class="text-xs text-base-content/60">{m.pcb_sim_fastening()}</span>
          <div class="join w-full">
            {#each info.variants as v (v.id)}
              <button
                type="button"
                class={["btn join-item btn-sm flex-1", variant === v.id && "btn-active"]}
                aria-pressed={variant === v.id}
                onclick={() => (picked = v.id)}
              >
                {v.title}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <ul class="flex flex-col gap-1">
        <li class="flex items-center gap-2">
          <IconButton
            icon={shown.board === false ? "lucide:eye-off" : "lucide:eye"}
            label={m.pcb_sim_show_board()}
            aria-pressed={shown.board !== false}
            onclick={() => toggle("board")}
          />
          <span class="flex-1 text-sm">{m.pcb_sim_board()}</span>
        </li>
        {#each info.parts as part, i (part.name)}
          <li class="flex items-center gap-2">
            <IconButton
              icon={shown[part.name] === false ? "lucide:eye-off" : "lucide:eye"}
              label={m.pcb_sim_show_part({ part: part.title })}
              aria-pressed={shown[part.name] !== false}
              onclick={() => toggle(part.name)}
            />
            <span class="min-w-0 flex-1 truncate text-sm">
              {part.title}
              {#if part.translucent}
                <span class="badge badge-ghost badge-xs">{m.pcb_sim_translucent()}</span>
              {/if}
            </span>
            {#if files.data?.[i]}
              <a
                class="btn btn-ghost btn-sm"
                href={files.data[i]}
                download={`${info.id}-${partFile(part, variant)}.stl`}
                title={part.variants?.length && variantTitle ? variantTitle : undefined}
              >
                <Icon icon="lucide:download" class="size-4" />
                STL
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    </aside>
  {/if}
</div>
