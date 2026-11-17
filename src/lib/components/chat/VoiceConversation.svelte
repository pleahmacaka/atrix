<script lang="ts">
import Icon from "@iconify/svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import type { SessionView } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { callState } from "#lib/voice/call.svelte.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"
import CallControls from "./CallControls.svelte"
import CallOrb from "./CallOrb.svelte"
import RunningStatus from "./RunningStatus.svelte"

let { view, onPermit }: { view: SessionView; onPermit: (optionId: string) => void } =
  $props()

const call = $derived(callState(view.running, view.items))

const error = $derived(conversation.error ?? voice.error)

const ORB_SIZE = 176

const RATES = [0.8, 1, 1.2, 1.4, 1.6]
</script>

<svelte:window
  onkeydown={e => {
    if (e.key === "Escape") {
      e.preventDefault()
      conversation.full = false
    }
  }}
/>

<section
  class="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto p-6"
  aria-label={m.voice_conversation()}
>
  <CallOrb {call} size={ORB_SIZE} class="size-48 shrink-0" />
  <div class="flex min-w-0 flex-col items-center gap-3" aria-live="polite">
    <p class="text-lg font-semibold">{call.status}</p>
    {#if call.thinking && view.running}
      <RunningStatus since={view.since} tokens={view.tokens} agents={view.agents} />
    {:else if !voice.speaking && !call.thinking}
      <progress
        class={["progress w-32", call.quiet ? "opacity-40" : "progress-primary"]}
        value={Math.round(conversation.mic * 100)}
        max="100"
        aria-label={m.voice_level()}
      ></progress>
    {/if}
  </div>
  <div class="flex w-full max-w-xl min-w-0 flex-col gap-3 text-center">
    {#if call.said}
      <p
        class={[
          "line-clamp-3 break-keep transition-colors duration-140",
          call.hearing ? "text-base-content/80" : "text-base-content/55",
        ]}
      >
        {call.said}
      </p>
    {/if}
    {#if call.reply}
      <p class="line-clamp-4 break-keep">{call.reply}</p>
    {/if}
  </div>
  {#if view.ask}
    <div class="flex max-w-xl flex-col items-center gap-3">
      <p class="flex min-w-0 items-start gap-2 font-semibold">
        <Icon icon="lucide:shield-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
        <span class="min-w-0 break-words">{m.chat_permission({ title: view.ask.title })}</span>
      </p>
      <div class="flex flex-wrap justify-center gap-2">
        {#each view.ask.options as option (option.optionId)}
          <button
            type="button"
            class={["btn btn-sm", option.kind.startsWith("allow") ? "btn-primary" : "btn-ghost"]}
            onclick={() => onPermit(option.optionId)}
          >
            {option.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}
  {#if error}
    <div role="alert" class="alert alert-error alert-soft max-w-xl">
      <Icon icon="lucide:circle-alert" class="size-4 shrink-0" />
      <span class="min-w-0 break-keep">{error}</span>
      {#if call.failed}
        <button type="button" class="btn btn-sm" onclick={conversation.retry}>
          {m.voice_retry()}
        </button>
      {/if}
    </div>
  {/if}
  <div class="flex shrink-0 items-center gap-4">
    <IconSelect
      icon="lucide:gauge"
      label={m.voice_rate()}
      value={String(settings.voiceRate)}
      choices={RATES.map(r => ({ value: String(r), name: m.voice_rate_value({ rate: r }) }))}
      onchange={value => voice.setRate(Number(value))}
    />
    <CallControls
      {call}
      large
      onMute={() => conversation.setMuted(!conversation.muted)}
      onEnd={conversation.end}
    />
  </div>
</section>
