<script lang="ts">
import type { Snippet } from "svelte"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { REVEAL } from "./labels.ts"
import SpeakButton from "./SpeakButton.svelte"

let {
  text,
  pace,
  onReply,
  extra,
}: {
  text: string
  pace?: { tokens: number; ms: number }
  onReply?: (text: string) => void
  extra?: Snippet
} = $props()

const decimal = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 })

const rate = $derived(
  pace && pace.ms > 0 && pace.tokens > 0
    ? decimal.format(pace.tokens / (pace.ms / 1000))
    : null,
)
</script>

<div class={["flex items-center gap-1", REVEAL]} data-reveal>
  <CopyButton {text} />
  <SpeakButton {text} />
  {#if onReply}
    <IconButton icon="lucide:reply" label={m.chat_reply()} size="xs" onclick={() => onReply(text)} />
  {/if}
  {@render extra?.()}
  {#if rate}
    <span class="text-xs tabular-nums">{m.chat_pace({ rate })}</span>
  {/if}
</div>
