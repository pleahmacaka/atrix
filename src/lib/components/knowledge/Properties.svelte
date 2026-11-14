<script lang="ts">
import Icon from "@iconify/svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import type { Draft } from "./draft.ts"

let {
  host,
  id,
  draft = $bindable(),
}: { host: HostView; id: string; draft: Draft } = $props()

const others = $derived(host.knowledge.filter(e => e.meta.id !== id))

const LABEL = "flex flex-col gap-1 px-2 text-xs text-base-content/55"
</script>

<div class="flex flex-col gap-3 py-1">
  <label class={LABEL}>
    {m.knowledge_description()}
    <textarea
      class="textarea textarea-sm w-full resize-none text-sm text-base-content"
      rows="2"
      bind:value={draft.description}
    ></textarea>
  </label>
  <label class={LABEL}>
    {m.knowledge_tags()}
    <input
      class="input input-sm w-full text-base-content"
      placeholder={m.knowledge_tags_hint()}
      bind:value={draft.tags}
    />
  </label>
  <label class={LABEL}>
    {m.knowledge_scope()}
    <input
      class="input input-sm w-full text-base-content"
      placeholder="network"
      bind:value={draft.scope}
    />
  </label>
  <div class={LABEL}>
    {m.knowledge_links()}
    {#each draft.links as link, i (i)}
      <div class="flex flex-col gap-1 rounded-field border border-base-300 p-1.5">
        <select
          class="select select-sm w-full text-base-content"
          aria-label={m.knowledge_target()}
          bind:value={link.to}
        >
          {#each others as other (other.meta.id)}
            <option value={other.meta.id}>{other.meta.title}</option>
          {/each}
        </select>
        <div class="flex items-center gap-1">
          <input
            class="input input-sm min-w-0 flex-1 text-base-content"
            aria-label={m.knowledge_rel()}
            placeholder={m.knowledge_rel()}
            bind:value={link.rel}
          />
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-square text-base-content"
            aria-label={m.common_delete()}
            title={m.common_delete()}
            onclick={() => {
              draft.links = draft.links.filter((_, j) => j !== i)
            }}
          >
            <Icon icon="lucide:x" class="size-4" />
          </button>
        </div>
      </div>
    {/each}
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square justify-start font-normal text-base-content"
      disabled={others.length === 0}
      onclick={() => {
        draft.links = [
          ...draft.links,
          { to: others[0]?.meta.id ?? "", rel: "related" },
        ]
      }}
      aria-label={m.knowledge_add_link()}
      title={m.knowledge_add_link()}
    >
      <Icon icon="lucide:link" class="size-4" />
    </button>
  </div>
</div>
