<script lang="ts">
import Icon from "@iconify/svelte"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { brandIcon, OFFICIAL } from "./brands.ts"

let {
  harnesses,
  busy = null,
  onToggle,
}: {
  harnesses: HarnessInfo[]
  busy?: string | null
  onToggle: (harness: HarnessInfo) => void
} = $props()

const id = $props.id()

let hoveredId = $state<string | null>(null)

const hovered = $derived(harnesses.find(h => h.id === hoveredId) ?? null)

const stateOf = (h: HarnessInfo) => {
  if (!h.enabled) {
    return { label: m.harness_off_toggle(), icon: "lucide:power-off", tone: "bg-base-300 text-base-content/70" }
  }

  return OFFICIAL.has(h.base)
    ? { label: m.harness_official_toggle(), icon: "lucide:check", tone: "bg-success text-success-content" }
    : { label: m.harness_acp_toggle(), icon: "lucide:check", tone: "bg-base-content text-base-100" }
}
</script>

{#if harnesses.length}
  <ul class="flex items-center -space-x-2">
    {#each harnesses as h (h.id)}
      {@const mark = stateOf(h)}
      <li
        class="relative hover:z-10"
        style:anchor-name={hoveredId === h.id ? `--${id}` : undefined}
        onpointerenter={() => (hoveredId = h.id)}
        onpointerleave={() => (hoveredId = null)}
      >
        <button
          type="button"
          class={[
            "relative grid size-10 cursor-pointer place-items-center rounded-full",
            "border-2 border-base-100 bg-base-200 transition-transform",
            "hover:-translate-y-1 disabled:cursor-wait",
          ]}
          aria-label="{h.name}, {mark.label}"
          aria-pressed={h.enabled}
          disabled={busy === h.id}
          onclick={() => onToggle(h)}
        >
          {#if busy === h.id}
            <span class="loading loading-spinner loading-sm"></span>
          {:else}
            <Icon
              icon={brandIcon(h.base)}
              class={["size-5", !h.enabled && "opacity-30 grayscale"]}
            />
          {/if}
          <span
            class={[
              "absolute -right-1 -bottom-1 grid size-4 place-items-center",
              "rounded-full ring-2 ring-base-100",
              mark.tone,
            ]}
          >
            <Icon icon={mark.icon} class="size-3" />
          </span>
        </button>
      </li>
    {/each}
  </ul>
  <div
    popover="manual"
    aria-hidden="true"
    style:position-anchor={`--${id}`}
    class={[
      "tip pointer-events-none fixed inset-auto m-0 my-2 flex-col rounded-field",
      "border-0 bg-neutral px-2 py-1 text-sm whitespace-nowrap text-neutral-content",
      "open:flex",
    ]}
    {@attach node => {
      if (hovered) {
        node.showPopover()

        return () => node.hidePopover()
      }
    }}
  >
    <span class="font-medium">{hovered?.name}</span>
    <span class="text-xs opacity-70">{hovered && stateOf(hovered).label}</span>
  </div>
{:else}
  <span class="flex items-center gap-2 text-sm text-base-content/60">
    <Icon icon="lucide:search-x" class="size-4" />
    {m.harness_not_detected()}
  </span>
{/if}

<style>
  .tip {
    position-area: block-end;
    position-try-fallbacks: flip-block;
  }
</style>
