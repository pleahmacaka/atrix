<script lang="ts">
import Icon from "@iconify/svelte"
import type { Choice } from "#lib/components/ui/IconSelect.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  models,
  model,
  efforts,
  effort,
  onmodel,
  oneffort,
}: {
  models: Choice[]
  model: string
  efforts: Choice[]
  effort: string
  onmodel: (value: string) => void
  oneffort: (value: string) => void
} = $props()

let open = $state(false)

const modelName = $derived(models.find(c => c.value === model)?.name ?? m.chat_model())

const effortName = $derived(efforts.find(c => c.value === effort)?.name)

const fresh = $derived(models.filter(c => !c.older))
</script>

<Popover label={m.chat_model()} placement="top-start" width="w-72" bind:open>
  {#snippet trigger(p)}
    <button {...p} type="button" class="btn btn-ghost btn-sm max-w-72 min-w-0 font-normal">
      <Icon icon="lucide:cpu" class="size-4 shrink-0 opacity-60" />
      <span class="min-w-0 truncate">{modelName}</span>
      {#if effortName && efforts.length > 0}
        <span class="shrink-0 text-base-content/55">{effortName}</span>
      {/if}
      <Icon icon="lucide:chevron-down" class="size-4 shrink-0 opacity-60" />
    </button>
  {/snippet}
  <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
    <MenuLabel text={m.chat_model()} />
    {#each fresh as choice (choice.value)}
      <MenuItem
        label={choice.name}
        selected={choice.value === model}
        onclick={() => {
          open = false
          onmodel(choice.value)
        }}
      />
    {/each}
    {#if efforts.length > 0}
      <MenuLabel text={m.chat_effort()} />
      <div class="grid grid-cols-3 gap-1 px-1 pb-1">
        {#each efforts as choice (choice.value)}
          <button
            type="button"
            class={[
              "btn btn-sm font-normal",
              choice.value === effort ? "bg-primary/8 text-primary" : "btn-ghost",
            ]}
            aria-pressed={choice.value === effort}
            onclick={() => {
              open = false
              oneffort(choice.value)
            }}
          >
            {choice.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</Popover>
