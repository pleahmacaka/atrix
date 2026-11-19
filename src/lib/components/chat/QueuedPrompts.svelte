<script lang="ts">
import { SvelteSet } from "svelte/reactivity"
import { splitQueued } from "#lib/acp/items.ts"
import { m } from "#lib/paraglide/messages.js"
import Attachments from "./Attachments.svelte"

let {
  queued,
  images = {},
  pending = {},
}: {
  queued: string[]
  images?: Record<string, string>
  pending?: Record<string, string[]>
} = $props()

const expanded = new SvelteSet<number>()

const entries = $derived(
  queued.map(text => {
    const entry = splitQueued(
      text,
      number => m.chat_queued_image({ number }),
      number => images[number],
    )
    const optimistic = (pending[text] ?? []).map((url, i) => ({
      name: m.chat_queued_image({ number: String(i + 1) }),
      mimeType: url.slice(5, url.indexOf(";")),
      url,
    }))

    return { ...entry, files: [...entry.files, ...optimistic] }
  }),
)
</script>

{#each entries as entry, i (i)}
  {@const open = expanded.has(i)}
  {#if entry.files.length}
    <Attachments files={entry.files} mine />
  {/if}
  {#if entry.text}
    <button
      type="button"
      class={[
        "max-w-xl min-w-0 cursor-pointer self-end rounded-box px-4 py-2 text-left",
        "border border-dashed border-base-content/30 text-base-content/85",
        "transition-colors duration-140 hover:bg-base-content/5",
        "break-keep whitespace-pre-wrap wrap-anywhere",
      ]}
      aria-expanded={open}
      title={open ? m.chat_queued_collapse() : m.chat_queued_expand()}
      onclick={() => (open ? expanded.delete(i) : expanded.add(i))}
    >
      <span class={[!open && "line-clamp-3"]}>{entry.text}</span>
    </button>
  {/if}
{/each}
