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

const STACK = 4

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
        "pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5",
        "border border-base-300 bg-raised text-xs font-medium text-base-content shadow-md",
        "transition-colors duration-140 hover:border-primary/50 @7xl:hidden",
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
        <span class="flex items-center" role="img" aria-label={m.chat_subagents()}>
          {#each agents.slice(0, STACK) as agent, i (agent.id)}
            <span
              class={[
                "grid size-6 place-items-center rounded-full border-2 border-raised",
                "bg-primary/15 text-xs font-semibold text-primary",
                i > 0 && "-ms-2",
              ]}
              title={agent.description}
            >
              {[...agent.description.trim()][0]?.toUpperCase() ?? "•"}
            </span>
          {/each}
          {#if agents.length > STACK}
            <span
              class="-ms-2 grid size-6 place-items-center rounded-full border-2 border-raised bg-primary text-xs font-semibold text-primary-content tabular-nums"
            >
              +{agents.length - STACK}
            </span>
          {/if}
          <span class="loading loading-spinner ms-1.5 size-3 text-primary"></span>
        </span>
      {/if}
    </button>
    <div
      class={[
        "pointer-events-auto w-64 flex-col gap-3 rounded-box p-3",
        "border border-base-300 bg-raised text-xs shadow-lg",
        open ? "flex" : "hidden",
        "@7xl:flex @7xl:bg-raised/85 @7xl:shadow-sm",
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
