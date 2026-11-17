<script lang="ts">
import Icon from "@iconify/svelte"
import type { UIMessage } from "ai"
import { appTitleOf } from "#lib/apps/app.ts"
import { apps } from "#lib/apps/apps.svelte.ts"
import { blocksOf } from "#lib/chat/blocks.ts"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { m } from "#lib/paraglide/messages.js"
import Attachments from "./Attachments.svelte"
import { copyMenu } from "./copy.ts"
import { BUBBLE, REVEAL } from "./labels.ts"
import Markdown from "./Markdown.svelte"
import SpeakButton from "./SpeakButton.svelte"
import UiBlocks from "./UiBlocks.svelte"

let {
  message,
  onAction,
}: { message: UIMessage; onAction?: (text: string) => void } = $props()

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
  oncontextmenu={e => copyMenu(e, text)}
>
  {#if files.length}
    <Attachments {files} {mine} />
  {/if}
  {#each message.parts as part, index (index)}
    {#if part.type === "text" && mine}
      <div class={BUBBLE}>{part.text}</div>
    {:else if part.type === "text"}
      <Markdown text={part.text} />
    {:else if part.type === "reasoning" && part.text}
      <details class="group/reason">
        <summary class="badge badge-soft h-auto cursor-pointer list-none gap-1.5 py-1">
          <Icon icon="lucide:brain" class="size-3.5 shrink-0" />
          <span>{m.chat_reasoning()}</span>
          <Icon
            icon="lucide:chevron-down"
            class="size-3 transition-transform group-open/reason:rotate-180"
          />
        </summary>
        <p
          class={[
            "mt-2 border-l border-base-300 pl-3 text-xs whitespace-pre-wrap",
            "text-base-content/50",
          ]}
        >
          {part.text}
        </p>
      </details>
    {:else if part.type === "tool-show_ui"}
      {@const blocks = blocksOf(part)}
      {#if blocks}
        <UiBlocks
          {blocks}
          {onAction}
          onSave={b => apps.save(appTitleOf(b, ""), b)}
        />
      {:else if part.state === "output-error"}
        <ErrorAlert message={m.chat_view_failed()} />
      {:else}
        <div class="skeleton h-24 w-full rounded-box"></div>
      {/if}
    {/if}
  {/each}
  {#if !mine && text}
    <div class={REVEAL}>
      <CopyButton {text} />
      {#if !mine}
        <SpeakButton {text} />
      {/if}
    </div>
  {/if}
</article>
