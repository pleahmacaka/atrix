<script lang="ts">
import Icon from "@iconify/svelte"
import { type Block, splitUi } from "#lib/chat/blocks.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { copyMenu } from "./copy.ts"
import Markdown from "./Markdown.svelte"
import ReplyActions from "./ReplyActions.svelte"
import UiBlocks from "./UiBlocks.svelte"

let {
  text,
  onAction,
  onSave,
  threads = 0,
  onThread,
  onOpenThread,
  onReply,
  pace,
}: {
  text: string
  pace?: { tokens: number; ms: number }
  onAction: (text: string) => void
  onSave: (blocks: Block[]) => Promise<unknown>
  threads?: number
  onThread?: () => void
  onOpenThread?: () => void
  onReply?: (text: string) => void
} = $props()
</script>

<article
  class="group flex min-w-0 flex-col gap-1"
  data-reply
  oncontextmenu={e => copyMenu(e, text)}
>
  {#each splitUi(text) as part, i (i)}
    {#if part.kind === "ui"}
      <UiBlocks blocks={part.blocks} {onAction} {onSave} />
    {:else}
      <Markdown text={part.text} />
    {/if}
  {/each}
  {#if threads > 0}
    <button
      type="button"
      class="btn btn-ghost btn-xs self-start font-normal text-primary"
      onclick={onOpenThread}
    >
      <Icon icon="lucide:messages-square" class="size-3.5" />
      {m.thread_count({ count: threads })}
    </button>
  {/if}
  <ReplyActions {text} {pace} {onReply}>
    {#snippet extra()}
      {#if onThread}
        <IconButton
          icon="lucide:message-square-reply"
          label={m.thread_start()}
          size="xs"
          onclick={onThread}
        />
      {/if}
    {/snippet}
  </ReplyActions>
</article>
