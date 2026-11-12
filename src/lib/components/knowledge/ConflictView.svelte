<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { mergeWithAi } from "#lib/knowledge/merge.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  base,
  mine,
  theirs,
  busy,
  onsave,
  oncancel,
}: {
  base: string
  mine: string
  theirs: string
  busy: boolean
  onsave: (body: string) => void
  oncancel: () => void
} = $props()

const ai = new Attempt()

let merged = $state("")

$effect.pre(() => {
  merged = mine
})

const COLUMN = "textarea min-h-0 w-full flex-1 resize-none text-sm leading-relaxed"
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
  <div role="alert" class="alert alert-warning alert-soft text-sm">
    <Icon icon="lucide:git-merge" class="size-4" />
    {m.knowledge_conflict()}
  </div>
  <div class="grid min-h-0 flex-1 grid-cols-3 gap-3">
    <label class="flex min-h-0 flex-col gap-1 text-xs text-base-content/60">
      {m.knowledge_base()}
      <textarea class={COLUMN} readonly value={base}></textarea>
    </label>
    <label class="flex min-h-0 flex-col gap-1 text-xs text-base-content/60">
      {m.knowledge_mine()}
      <textarea class={[COLUMN, "border-primary"]} bind:value={merged}></textarea>
    </label>
    <label class="flex min-h-0 flex-col gap-1 text-xs text-base-content/60">
      {m.knowledge_theirs()}
      <textarea class={COLUMN} readonly value={theirs}></textarea>
    </label>
  </div>
  <ErrorAlert message={ai.failure} />
  <div class="flex justify-end gap-2">
    <button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>
      {m.common_cancel()}
    </button>
    <button
      type="button"
      class="btn btn-sm"
      disabled={ai.busy}
      onclick={() =>
        ai.run(async () => {
          merged = await mergeWithAi(base, merged, theirs)
        })}
    >
      {#if ai.busy}
        <span class="loading loading-spinner loading-xs"></span>
      {:else}
        <Icon icon="lucide:sparkles" class="size-4" />
      {/if}
      {m.knowledge_merge_ai()}
    </button>
    <button
      type="button"
      class="btn btn-primary btn-sm"
      disabled={busy}
      onclick={() => onsave(merged)}
    >
      <Icon icon="lucide:git-merge" class="size-4" />
      {m.knowledge_save_merged()}
    </button>
  </div>
</div>
