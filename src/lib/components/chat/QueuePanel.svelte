<script lang="ts">
import Icon from "@iconify/svelte"
import { useComposer } from "#lib/chat/composer.svelte.ts"
import { editQueued, frontQueued, takeQueued } from "#lib/chat/queue.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"

const composer = useComposer()

let editing = $state<number | null>(null)

let draft = $state("")

const items = $derived(composer.queued)

const sendNow = (index: number) => {
  frontQueued(composer.props.draft, index)

  if (composer.props.busy) {
    composer.props.onStop()
  }
}

const cancel = (index: number) => {
  const taken = takeQueued(composer.props.draft, index)

  if (!taken) {
    return
  }

  const current = composer.text.trim()

  composer.text = [taken.text, current].filter(Boolean).join("\n\n")
  composer.add(taken.files)
}

const save = (index: number) => {
  const text = draft.trim()

  if (text) {
    editQueued(composer.props.draft, index, text)
  }

  editing = null
}
</script>

{#if items.length}
  <section
    class="flex flex-col gap-0.5 rounded-box border border-base-300 bg-raised p-1.5"
    aria-label={m.queue_title({ count: items.length })}
  >
    <h3 class="px-2 pt-0.5 pb-1 text-xs text-base-content/55">
      {m.queue_title({ count: items.length })}
    </h3>
    {#each items as item, index (index)}
      <div class="flex min-w-0 items-center gap-2 rounded-field px-2 py-1 hover:bg-base-content/5">
        <span
          class="grid size-5 shrink-0 place-items-center rounded-field bg-base-content/10 text-xs tabular-nums"
        >
          {index + 1}
        </span>
        {#if editing === index}
          <input
            class="input input-sm min-w-0 flex-1"
            aria-label={m.queue_edit()}
            bind:value={draft}
            {@attach node => node.focus()}
            onkeydown={e => {
              if (e.key === "Enter" && !e.isComposing) {
                e.preventDefault()
                save(index)
              } else if (e.key === "Escape") {
                editing = null
              }
            }}
            onblur={() => save(index)}
          />
        {:else}
          <span class="min-w-0 flex-1 truncate text-sm" title={item.text}>{item.text}</span>
          {#if item.files.length}
            <span class="flex shrink-0 items-center gap-1 text-xs text-base-content/55">
              <Icon icon="lucide:paperclip" class="size-3.5" />
              {item.files.length}
            </span>
          {/if}
          <IconButton
            icon="lucide:send-horizontal"
            label={m.queue_send_now()}
            size="xs"
            onclick={() => sendNow(index)}
          />
          <IconButton
            icon="lucide:pencil"
            label={m.queue_edit()}
            size="xs"
            onclick={() => {
              draft = item.text
              editing = index
            }}
          />
          <IconButton
            icon="lucide:x"
            label={m.queue_cancel()}
            size="xs"
            onclick={() => cancel(index)}
          />
        {/if}
      </div>
    {/each}
  </section>
{/if}
