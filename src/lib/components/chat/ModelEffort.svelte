<script lang="ts">
import Icon from "@iconify/svelte"
import type { Choice } from "#lib/components/ui/IconSelect.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover from "#lib/components/ui/Popover.svelte"
import { m } from "#lib/paraglide/messages.js"
import ModelLabel from "./ModelLabel.svelte"

let {
  models,
  model,
  efforts = [],
  effort = "",
  onmodel = () => {},
  oneffort = () => {},
  locked = false,
  title,
}: {
  models: Choice[]
  model: string
  efforts?: Choice[]
  effort?: string
  onmodel?: (value: string) => void
  oneffort?: (value: string) => void
  locked?: boolean
  title?: string
} = $props()

let open = $state(false)

let sliding = $state<number | null>(null)

const level = $derived(
  sliding ?? Math.max(0, efforts.findIndex(c => c.value === effort)),
)

const modelName = $derived(
  models.find(c => c.value === model)?.name ??
    (locked && model ? model : m.chat_model()),
)

const effortName = $derived(efforts.find(c => c.value === effort)?.name)

const fresh = $derived(models.filter(c => !c.older))
</script>

{#if locked && efforts.length === 0}
  <span class="inline-flex h-6 max-w-72 min-w-0 items-center gap-1 px-2 text-xs" title={title ?? model}>
    <ModelLabel name={modelName} effort={effortName} />
  </span>
{:else}
  <Popover label={m.chat_model()} placement="top-start" width="w-80" bind:open>
    {#snippet trigger(p)}
      <button {...p} type="button" class="btn btn-ghost btn-xs max-w-72 min-w-0 font-normal">
        <ModelLabel name={modelName} effort={effortName} />
        <Icon icon="lucide:chevron-down" class="size-3.5 shrink-0 opacity-60" />
      </button>
    {/snippet}
    <div role="menu" tabindex="-1" class="flex flex-col gap-3 p-1" {@attach menuKeys}>
      {#if !locked}
        <div class="grid grid-cols-2 gap-1.5">
          {#each fresh as choice (choice.value)}
            {@const picked = choice.value === model}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={picked}
              class={[
                "flex min-w-0 cursor-pointer flex-col items-start gap-0.5 rounded-field border px-3 py-2",
                "text-start transition-colors duration-140 focus:outline-none",
                picked
                  ? "border-primary/30 bg-primary/8 text-primary"
                  : "border-base-300 hover:bg-base-content/5 focus-visible:bg-base-content/5",
              ]}
              title={choice.name}
              onclick={() => {
                open = false
                onmodel(choice.value)
              }}
            >
              <span class="flex w-full min-w-0 items-center gap-1.5">
                <Icon icon={choice.icon ?? "lucide:cpu"} class="size-4 shrink-0 opacity-70" />
                <span class="min-w-0 flex-1 truncate text-sm font-medium">{choice.name}</span>
                {#if picked}
                  <Icon icon="lucide:check" class="size-3.5 shrink-0" />
                {/if}
              </span>
              {#if choice.detail}
                <span class={["w-full truncate text-xs", !picked && "text-base-content/55"]}>
                  {choice.detail}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
      {#if efforts.length > 0}
        <div class="flex flex-col gap-2 px-2 pb-2">
          <input
            type="range"
            class="range range-primary range-lg w-full"
            min="0"
            max={efforts.length - 1}
            step="1"
            value={level}
            aria-label={m.chat_effort()}
            aria-valuetext={efforts[level]?.name}
            oninput={e => {
              sliding = Number(e.currentTarget.value)
            }}
            onchange={e => {
              sliding = null
              oneffort(efforts[Number(e.currentTarget.value)].value)
            }}
          />
          <div class="flex justify-between text-xs text-base-content/60">
            {#each efforts as choice, i (choice.value)}
              <span class={[i === level && "font-semibold text-primary"]}>{choice.name}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Popover>
{/if}
