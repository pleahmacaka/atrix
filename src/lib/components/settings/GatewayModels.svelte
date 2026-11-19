<script lang="ts">
import Icon from "@iconify/svelte"
import type { ClassValue } from "svelte/elements"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import { modelIcon } from "#lib/store/gateways.svelte.ts"

let {
  models,
  enabled,
  ontoggle,
  class: extra,
}: {
  models: string[]
  enabled?: string[]
  ontoggle?: (next: string[] | undefined) => void
  class?: ClassValue
} = $props()

let filter = $state("")

const shown = $derived(models.filter(id => id.toLowerCase().includes(filter.trim().toLowerCase())))

const on = (id: string) => !enabled || enabled.includes(id)

const count = $derived(enabled ? enabled.length : models.length)

const toggle = (id: string) => {
  const current = enabled ?? models
  const next = on(id) ? current.filter(x => x !== id) : [...current, id]

  ontoggle?.(next.length === models.length ? undefined : next)
}
</script>

<div class={["flex flex-col gap-1.5", extra]}>
  <div class="flex items-center gap-2">
    <SearchField bind:value={filter} placeholder={m.gateway_model_filter()} class="min-w-0 flex-1" />
    <span class="shrink-0 text-xs text-base-content/55 tabular-nums">
      {m.gateway_models_enabled({ count, total: models.length })}
    </span>
    {#if ontoggle}
      <button
        type="button"
        class="btn btn-ghost btn-xs shrink-0"
        onclick={() => ontoggle(count === models.length ? [] : undefined)}
      >
        {count === models.length ? m.gateway_models_none() : m.gateway_models_all()}
      </button>
    {/if}
  </div>
  <ul class="flex max-h-56 flex-col overflow-y-auto" aria-label={m.gateway_models()}>
    {#each shown as id (id)}
      <li>
        <div
          class={[
            "flex items-center gap-2 rounded-field px-2 py-1 text-sm",
            "transition-colors duration-140 hover:bg-base-content/5",
            !on(id) && "text-base-content/45",
          ]}
          title={id}
        >
          <Icon icon={modelIcon(id)} class="size-4 shrink-0 opacity-80" />
          <span class="min-w-0 flex-1 truncate">{id}</span>
          {#if ontoggle}
            <input
              type="checkbox"
              class="toggle toggle-xs toggle-primary shrink-0"
              checked={on(id)}
              aria-label={id}
              onchange={() => toggle(id)}
            />
          {/if}
        </div>
      </li>
    {:else}
      <EmptyState icon="lucide:box" text={m.gateway_models_empty()} class="py-4" />
    {/each}
  </ul>
</div>