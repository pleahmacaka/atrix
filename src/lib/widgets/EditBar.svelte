<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { layout } from "./layout.svelte.ts"
import { WIDGETS } from "./registry.ts"
</script>

{#if layout.editing}
  <div
    class={[
      "fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 p-1.5",
      "rounded-box border border-base-300 bg-raised shadow-lg",
    ]}
    role="toolbar"
    aria-label={m.widget_edit()}
  >
    {#each layout.hidden as leaf (leaf.id)}
      <button
        type="button"
        class="btn btn-ghost btn-sm gap-1.5 font-normal"
        title={m.widget_show()}
        onclick={() => layout.setHidden(leaf.id, false)}
      >
        <Icon icon={WIDGETS[leaf.type].icon} class="size-4" />
        {WIDGETS[leaf.type].label()}
        <Icon icon="lucide:plus" class="size-3.5 opacity-60" />
      </button>
    {/each}
    {#if layout.hidden.length}
      <span class="mx-1 h-5 w-px bg-base-300"></span>
    {/if}
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      aria-label={m.widget_reset()}
      title={m.widget_reset()}
      onclick={layout.reset}
    >
      <Icon icon="lucide:rotate-ccw" class="size-4" />
    </button>
    <button
      type="button"
      class="btn btn-primary btn-sm btn-square"
      aria-label={m.widget_done()}
      title="{m.widget_done()} (Ctrl+E)"
      onclick={() => {
        layout.editing = false
      }}
    >
      <Icon icon="lucide:check" class="size-4" />
    </button>
  </div>
{/if}
