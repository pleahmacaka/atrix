<script lang="ts">
import Icon from "@iconify/svelte"
import type { PlanEntry } from "#lib/acp/items.ts"
import type { Subagent } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { STATUS_ICONS } from "./labels.ts"

let {
  plan,
  agents,
  timeline = true,
}: { plan: PlanEntry[]; agents: Subagent[]; timeline?: boolean } = $props()

let open = $state(false)

let root = $state<HTMLElement>()

let toggle = $state<HTMLButtonElement>()

const done = $derived(plan.filter(e => e.status === "completed").length)

const visible = $derived(plan.length > 0 || agents.length > 0)
</script>

<svelte:window
  onkeydowncapture={e => {
    if (
      open &&
      e.key === "Escape" &&
      toggle?.checkVisibility() &&
      !document.querySelector("dialog[open], :popover-open:not([data-tooltip])")
    ) {
      e.preventDefault()
      e.stopPropagation()
      open = false
    }
  }}
  onpointerdown={e => {
    if (open && !(e.target instanceof Node && root?.contains(e.target))) {
      open = false
    }
  }}
/>

{#if visible}
  <div
    bind:this={root}
    class={[
      "pointer-events-none absolute top-2 z-10 flex flex-col items-end gap-1",
      "end-3",
      timeline && "pointer-fine:@4xl:end-12",
    ]}
  >
    <button
      bind:this={toggle}
      type="button"
      class={[
        "pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full px-2.5 py-1",
        "bg-base-100/80 text-xs text-base-content/70 backdrop-blur-sm",
        "transition-colors duration-140 hover:bg-base-content/8 @7xl:hidden",
      ]}
      aria-expanded={open}
      onclick={() => {
        open = !open
      }}
    >
      {#if plan.length}
        <span class="flex items-center gap-1 tabular-nums">
          <Icon icon="lucide:list-checks" class="size-3.5" />
          {done}/{plan.length}
        </span>
      {/if}
      {#if agents.length}
        <span class="flex items-center gap-1 tabular-nums">
          <span class="loading loading-spinner size-3 text-primary"></span>
          {agents.length}
        </span>
      {/if}
    </button>
    <div
      class={[
        "pointer-events-auto w-56 flex-col gap-3 rounded-box p-3",
        "bg-base-100/85 text-xs backdrop-blur-sm",
        open ? "flex" : "hidden",
        "@7xl:flex @7xl:bg-transparent @7xl:backdrop-blur-none",
      ]}
    >
      {#if plan.length}
        <section class="flex min-w-0 flex-col gap-1.5" aria-label={m.chat_plan()}>
          <h3 class="flex items-center gap-1.5 font-semibold text-base-content/70">
            <Icon icon="lucide:list-checks" class="size-3.5" />
            {m.chat_plan()}
            <span class="ms-auto font-normal text-base-content/45 tabular-nums">{done}/{plan.length}</span>
          </h3>
          <ul class="flex flex-col gap-1">
            {#each plan as entry, i (i)}
              <li
                class={[
                  "flex min-w-0 items-start gap-1.5",
                  entry.status === "completed" && "text-base-content/45 line-through",
                  entry.status === "in_progress" && "text-base-content",
                ]}
              >
                <Icon
                  icon={STATUS_ICONS[entry.status] ?? "lucide:circle-dashed"}
                  class={[
                    "mt-0.5 size-3.5 shrink-0",
                    entry.status === "in_progress" && "animate-spin text-primary",
                  ]}
                />
                <span class={["min-w-0 break-words", entry.status === "in_progress" && "shimmer"]}>
                  {entry.content}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if agents.length}
        <section class="flex min-w-0 flex-col gap-1.5" aria-label={m.chat_subagents()}>
          <h3 class="flex items-center gap-1.5 font-semibold text-base-content/70">
            <Icon icon="lucide:bot" class="size-3.5" />
            {m.chat_subagents()}
          </h3>
          <ul class="flex flex-col gap-1.5">
            {#each agents as agent (agent.id)}
              <li class="flex min-w-0 flex-col">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class="loading loading-spinner size-3 shrink-0 text-primary"></span>
                  <span class="min-w-0 truncate font-medium" title={agent.description}>
                    {agent.description}
                  </span>
                </span>
                {#if agent.step}
                  <span class="shimmer min-w-0 truncate ps-4.5" title={agent.step}>{agent.step}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </div>
{/if}
