<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { progress, type Routing } from "./routing.svelte.ts"
import type { LiveSeed } from "./types.ts"

let { routing, final }: { routing: Routing; final: boolean } = $props()

const seed = $derived(routing.seed)

const unrouted = $derived((routing.render ?? routing.best?.render)?.unrouted.length ?? 0)

const stats = $derived(
  !seed
    ? []
    : seed.errors !== null
      ? [
          { label: m.pcb_live_errors(), value: seed.errors, bad: seed.errors > 0 },
          { label: m.pcb_live_warnings(), value: seed.warnings ?? 0, bad: false },
          { label: m.pcb_live_unrouted(), value: unrouted, bad: unrouted > 0 },
        ]
      : [
          { label: m.pcb_live_pass(), value: seed.pass, bad: false },
          { label: m.pcb_live_unrouted(), value: seed.unrouted ?? "-", bad: false },
        ],
)

const meta = $derived(routing.render?.meta ?? null)

const showingFinal = $derived(final && routing.selected === null)

const passed = (s: LiveSeed) => s.seed === routing.best?.seed && s.errors === 0
</script>

{#snippet verdict(s: LiveSeed)}
  {#if s.state === "routing"}
    <span class="loading loading-spinner size-3 text-info" title={m.pcb_live_routing()}></span>
  {:else if s.state === "queued"}
    <span class="size-2 rounded-full bg-base-content/20" title={m.pcb_live_queued()}></span>
  {:else if passed(s)}
    <span title={m.pcb_live_accepted()}><Icon icon="lucide:circle-check-big" class="size-4 text-success" /></span>
  {:else}
    <span title={s.errors ? m.pcb_live_failed() : m.pcb_live_rejected()}>
      <Icon icon="lucide:x" class={["size-4", s.errors ? "text-error" : "text-base-content/40"]} />
    </span>
  {/if}
{/snippet}

<aside
  class={[
    "flex max-h-96 shrink-0 flex-col border-t border-base-300 bg-base-100",
    "@5xl:max-h-none @5xl:w-80 @5xl:border-t-0 @5xl:border-l",
  ]}
>
  <div class="flex flex-col gap-3 border-b border-base-300 p-4">
    <div class="flex items-center gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="text-sm font-semibold tabular-nums">
          {showingFinal ? m.pcb_live_final() : seed ? m.pcb_live_seed({ seed: seed.seed }) : m.pcb_live_placement()}
        </span>
        {#if seed && seed.seed === routing.best?.seed}
          <span class="badge badge-soft badge-success badge-sm">{showingFinal ? m.pcb_live_best_seed({ seed: seed.seed }) : m.pcb_live_best()}</span>
        {/if}
      </div>
      {#if routing.selected !== null && final}
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (routing.selected = null)}>{m.pcb_live_to_final()}</button>
      {:else if routing.selected !== null && routing.selected !== routing.best?.seed}
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (routing.selected = null)}>{m.pcb_live_to_best()}</button>
      {/if}
      <IconButton
        icon="lucide:panel-right-close"
        label={m.pcb_live_collapse()}
        onclick={() => (routing.open = false)}
      />
    </div>
    {#if meta}
      <p class="text-xs text-base-content/60 tabular-nums">
        {m.pcb_live_meta({ width: meta.width, height: meta.height, layers: meta.copperLayers, tracks: meta.tracks, vias: meta.vias })}
      </p>
    {/if}
  </div>

  <ul class="min-h-0 flex-1 overflow-y-auto p-2 text-xs">
    {#if final}
      <li>
        <button
          type="button"
          class={["flex h-6 w-full cursor-pointer items-center gap-2 rounded-field px-2 hover:bg-base-300/40", showingFinal && "bg-base-300/60"]}
          aria-pressed={showingFinal}
          onclick={() => (routing.selected = null)}
        >
          <Icon icon="lucide:layers" class="size-4 shrink-0 text-base-content/60" />
          <span class="flex-1 text-left font-medium">{m.pcb_live_final()}</span>
        </button>
      </li>
    {/if}
    {#each routing.seeds as s (s.seed)}
      <li>
        <button
          type="button"
          class={["flex h-6 w-full cursor-pointer items-center gap-2 rounded-field px-2 hover:bg-base-300/40", !showingFinal && seed?.seed === s.seed && "bg-base-300/60"]}
          onclick={() => (routing.selected = s.seed)}
          onmouseenter={() => routing.enter(s)}
          onmouseleave={() => (routing.hoveredSeed = null)}
          onfocus={() => routing.enter(s)}
          onblur={() => (routing.hoveredSeed = null)}
        >
          <span class="w-8 shrink-0 text-right tabular-nums text-base-content/60">#{s.seed}</span>
          <span class="relative h-2 flex-1 overflow-hidden rounded-full bg-base-300">
            <span class={["bar absolute inset-y-0 left-0", s.state]} style:width={`${progress(s)}%`}></span>
          </span>
          <span
            class={["w-8 shrink-0 text-right whitespace-nowrap tabular-nums", s.errors === null ? "text-info" : s.errors === 0 ? "text-success" : "text-base-content"]}
            title={s.errors !== null ? m.pcb_live_errors() : m.pcb_live_unrouted()}
          >
            {s.errors ?? s.unrouted ?? ""}
          </span>
          <span class="flex w-4 shrink-0 justify-center">{@render verdict(s)}</span>
        </button>
      </li>
    {:else}
      <li class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
        <Icon icon="lucide:hourglass" class="size-8" />
        {m.pcb_live_queued()}
      </li>
    {/each}
  </ul>

  <footer class="flex shrink-0 flex-col border-t border-base-300">
    {#if routing.problems.length > 0}
      <ul class="max-h-40 overflow-y-auto px-2 pt-2 text-xs" aria-label={m.pcb_live_problems()}>
        {#each routing.problems as [net, count] (net)}
          <li>
            <button
              type="button"
              class={["flex h-6 w-full cursor-pointer items-center gap-2 rounded-field px-2 text-left hover:bg-base-300/40", routing.pinnedNet === net && "bg-base-300/60"]}
              aria-pressed={routing.pinnedNet === net}
              onclick={() => (routing.pinnedNet = routing.pinnedNet === net ? null : net)}
              onmouseenter={() => (routing.hoveredNet = net)}
              onmouseleave={() => (routing.hoveredNet = null)}
              onfocus={() => (routing.hoveredNet = net)}
              onblur={() => (routing.hoveredNet = null)}
            >
              <Icon icon="lucide:circle-x" class="size-4 shrink-0 text-error" />
              <span class="min-w-0 flex-1 truncate">{net}</span>
              <span class="shrink-0 text-base-content/50 tabular-nums">{m.pcb_live_unrouted_count({ count })}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="flex h-10 items-center gap-2 px-4 text-xs">
      {#if routing.problems.length > 0}
        <Icon icon="lucide:circle-alert" class="size-4 text-error" />
        <span class="font-semibold">{m.pcb_live_problems()}</span>
        <span class="badge badge-ghost badge-xs tabular-nums">{routing.problems.length}</span>
      {:else}
        <Icon icon="lucide:circle-check" class="size-4 text-success" />
        <span class="text-base-content/60">{m.pcb_live_no_problems()}</span>
      {/if}
      <dl class="ml-auto flex items-center gap-3 tabular-nums">
        {#each stats as s (s.label)}
          <div class="flex items-center gap-1">
            <dt class="text-base-content/60">{s.label}</dt>
            <dd class={["font-semibold", s.bad && "text-error"]}>{s.value}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </footer>
</aside>

<style>
  .bar.routing {
    background: linear-gradient(90deg, #22d3ee, #fbbf24);
    box-shadow: 0 0 0.5rem rgb(34 211 238 / 0.8);
  }

  .bar.checked {
    background: #64748b;
  }

  .bar.clean {
    background: #4ade80;
    box-shadow: 0 0 0.5rem rgb(74 222 128 / 0.8);
  }
</style>
