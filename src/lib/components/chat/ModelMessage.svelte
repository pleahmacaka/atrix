<script lang="ts">
import Icon from "@iconify/svelte"
import type { UIMessage } from "ai"
import { blocksOf } from "#lib/chat/blocks.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import Attachments from "./Attachments.svelte"
import CopyButton from "./CopyButton.svelte"
import Markdown from "./Markdown.svelte"
import UiBlocks from "./UiBlocks.svelte"

let { message }: { message: UIMessage } = $props()

const mine = $derived(message.role === "user")

const files = $derived(
  message.parts.flatMap(p =>
    p.type === "file"
      ? [{ name: p.filename ?? "file", mimeType: p.mediaType, url: p.url }]
      : [],
  ),
)

const text = $derived(
  message.parts.flatMap(p => (p.type === "text" ? [p.text] : [])).join("\n\n"),
)
</script>

<article
  class={["group flex min-w-0 flex-col gap-2", mine && "items-end"]}
  oncontextmenu={e => {
    if (text && !getSelection()?.toString()) {
      contextMenu.show(e, [
        {
          label: m.menu_copy_message(),
          icon: "lucide:copy",
          run: () => navigator.clipboard.writeText(text),
        },
      ])
    }
  }}
>
  {#if files.length}
    <Attachments {files} {mine} />
  {/if}
  {#each message.parts as part, index (index)}
    {#if part.type === "text" && mine}
      <div
        class={[
          "max-w-xl min-w-0 rounded-box bg-base-200 px-4 py-2",
          "break-keep whitespace-pre-wrap wrap-anywhere",
        ]}
      >
        {part.text}
      </div>
    {:else if part.type === "text"}
      <Markdown text={part.text} />
    {:else if part.type === "reasoning" && part.text}
      <details class="collapse collapse-arrow rounded-box border border-base-300">
        <summary class="collapse-title flex items-center gap-2 py-2 text-sm opacity-70">
          <Icon icon="lucide:brain" class="size-4" />
          {m.chat_reasoning()}
        </summary>
        <div class="collapse-content text-sm whitespace-pre-wrap opacity-70">
          {part.text}
        </div>
      </details>
    {:else if part.type === "tool-show_ui"}
      {@const blocks = blocksOf(part)}
      {#if blocks}
        <UiBlocks {blocks} />
      {:else if part.state === "output-error"}
        <p class="text-sm text-error">{m.chat_view_failed()}</p>
      {:else}
        <div class="skeleton h-24 w-full rounded-box"></div>
      {/if}
    {/if}
  {/each}
  {#if !mine && text}
    <div class="transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
      <CopyButton {text} />
    </div>
  {/if}
</article>
