<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import type { HostEntry } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

const OPENROUTER = "openrouter"

let {
  hosts,
  value,
  onpick,
}: {
  hosts: HostEntry[]
  value: string
  onpick: (key: string) => void
} = $props()

const uid = $props.id()

const rows = $derived(
  hosts
    .map(h => ({
      id: h.id,
      name: h.name,
      harnesses: (h.view.state?.harnesses ?? []).filter(x => x.enabled),
    }))
    .filter(r => r.harnesses.length > 0),
)

const selected = $derived.by(() => {
  if (value === OPENROUTER) {
    return { icon: "lucide:sparkles", name: "OpenRouter" }
  }

  const [host, harness] = value.split("\n")
  const found = rows
    .find(r => r.id === host)
    ?.harnesses.find(h => h.id === harness)

  return found
    ? { icon: brandIcon(found.base), name: found.name }
    : { icon: "lucide:boxes", name: m.target_title() }
})

const pick = (key: string) => {
  document.getElementById(`${uid}-targets`)?.hidePopover()
  onpick(key)
}
</script>

{#snippet tile(key: string, icon: string, name: string, profile: string | null)}
  <button
    type="button"
    class={[
      "relative grid size-11 cursor-pointer place-items-center rounded-box border",
      "transition-colors",
      value === key
        ? "border-primary bg-primary/12 text-primary"
        : "border-base-300 hover:bg-base-content/8",
    ]}
    aria-label={name}
    aria-pressed={value === key}
    title={name}
    onclick={() => pick(key)}
  >
    <Icon {icon} class="size-5" />
    {#if profile}
      <span
        class={[
          "absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full",
          "bg-base-content text-base-100 ring-2 ring-base-100",
        ]}
      >
        <Icon icon="lucide:user-round" class="size-2.5" />
      </span>
    {/if}
  </button>
{/snippet}

<button
  type="button"
  class="btn btn-ghost btn-sm gap-2 font-normal"
  aria-label="{m.target_title()}: {selected.name}"
  title={selected.name}
  popovertarget="{uid}-targets"
  style:anchor-name="--{uid}-targets"
>
  <Icon icon={selected.icon} class="size-4 shrink-0" />
  <span class="max-w-40 truncate">{selected.name}</span>
  <Icon icon="lucide:chevron-down" class="size-4 shrink-0 opacity-60" />
</button>

<div
  id="{uid}-targets"
  popover="auto"
  style:position-anchor="--{uid}-targets"
  class={[
    "targets popover-box fixed inset-auto m-0 my-1 hidden max-w-sm flex-col gap-3 p-3",
    "text-sm text-base-content open:flex",
  ]}
>
  <div class="flex items-center gap-3">
    {@render tile(OPENROUTER, "lucide:sparkles", "OpenRouter", null)}
    <span class="text-xs text-base-content/60">OpenRouter</span>
  </div>
  {#each rows as row (row.id)}
    <div class="flex flex-col gap-1.5">
      <p class="flex items-center gap-1.5 text-xs text-base-content/50">
        <Icon icon="lucide:monitor" class="size-3.5" />
        <span class="truncate">{row.name}</span>
      </p>
      <div class="flex flex-wrap gap-2">
        {#each row.harnesses as h (h.id)}
          {@render tile(`${row.id}\n${h.id}`, brandIcon(h.base), h.name, h.profile)}
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .targets {
    position-area: block-start span-inline-end;
    position-try-fallbacks: flip-block, flip-inline;
  }
</style>
