<script lang="ts">
import Icon from "@iconify/svelte"
import { ACCENTS, settings } from "#lib/store/settings.svelte.ts"
</script>

<div class="flex flex-wrap gap-2">
  {#each ACCENTS as accent (accent.id)}
    {@const selected = settings.accent === accent.id}
    <button
      type="button"
      class={[
        "grid size-7 cursor-pointer place-items-center rounded-full",
        "ring-offset-2 ring-offset-base-100 transition",
        selected && "ring-2 ring-base-content/60",
      ]}
      style:background-color="oklch(62% 0.17 {accent.hue})"
      aria-label={accent.label}
      title={accent.label}
      aria-pressed={selected}
      onclick={() => settings.setAccent(accent.id)}
    >
      {#if selected}
        <Icon icon="lucide:check" class="size-4 text-white" />
      {/if}
    </button>
  {/each}
</div>