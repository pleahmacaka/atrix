<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import Select from "#lib/components/ui/Select.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Draft } from "./draft.ts"

let {
  host,
  id,
  draft = $bindable(),
}: { host: HostView; id: string; draft: Draft } = $props()

const targets = $derived(
  host.knowledge
    .filter(e => e.meta.id !== id)
    .map(e => ({ value: e.meta.id, label: e.meta.title })),
)

const LABEL = "flex flex-col gap-1 px-2 text-xs font-medium text-base-content/60"
</script>

<div class="flex flex-col gap-3 py-1">
  <label class={LABEL}>
    {m.knowledge_description()}
    <textarea
      class="textarea textarea-sm w-full resize-none text-sm font-normal text-base-content"
      rows="2"
      bind:value={draft.description}
    ></textarea>
  </label>
  <label class={LABEL}>
    {m.knowledge_tags()}
    <input
      class="input input-sm w-full font-normal text-base-content"
      placeholder={m.knowledge_tags_hint()}
      bind:value={draft.tags}
    />
  </label>
  <label class={LABEL}>
    {m.knowledge_scope()}
    <input
      class="input input-sm w-full font-normal text-base-content"
      placeholder={m.knowledge_scope_hint()}
      bind:value={draft.scope}
    />
  </label>
  <div class={LABEL}>
    {m.knowledge_links()}
    {#each draft.links as link, i (i)}
      <div class="flex flex-col gap-1 rounded-field bg-inset p-1.5 font-normal">
        <Select
          options={targets}
          label={m.knowledge_target()}
          class="select-sm w-full text-base-content"
          bind:value={link.to}
        />
        <div class="flex items-center gap-1">
          <input
            class="input input-sm min-w-0 flex-1 text-base-content"
            aria-label={m.knowledge_rel()}
            placeholder={m.knowledge_rel()}
            bind:value={link.rel}
          />
          <IconButton
            icon="lucide:x"
            label={m.common_delete()}
            class="text-base-content"
            onclick={() => {
              draft.links = draft.links.filter((_, j) => j !== i)
            }}
          />
        </div>
      </div>
    {/each}
    <IconButton
      icon="lucide:plus"
      label={m.knowledge_add_link()}
      class="self-start text-base-content"
      disabled={targets.length === 0}
      onclick={() => {
        draft.links = [
          ...draft.links,
          { to: targets[0]?.value ?? "", rel: "related" },
        ]
      }}
    />
  </div>
</div>
