<script lang="ts">
import { type Block, splitUi } from "#lib/chat/blocks.ts"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import { copyMenu } from "./copy.ts"
import { REVEAL } from "./labels.ts"
import Markdown from "./Markdown.svelte"
import UiBlocks from "./UiBlocks.svelte"

let {
  text,
  onAction,
  onSave,
}: {
  text: string
  onAction: (text: string) => void
  onSave: (blocks: Block[]) => Promise<unknown>
} = $props()
</script>

<article class="group flex min-w-0 flex-col gap-1" oncontextmenu={e => copyMenu(e, text)}>
  {#each splitUi(text) as part, i (i)}
    {#if part.kind === "ui"}
      <UiBlocks blocks={part.blocks} {onAction} {onSave} />
    {:else}
      <Markdown text={part.text} />
    {/if}
  {/each}
  <div class={REVEAL}>
    <CopyButton {text} />
  </div>
</article>
