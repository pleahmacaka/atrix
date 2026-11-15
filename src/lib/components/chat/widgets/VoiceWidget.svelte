<script lang="ts">
import { useComposer } from "#lib/chat/composer.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"

const composer = useComposer()

const join = (text: string) => {
  const current = composer.text.trim()

  return current ? `${current} ${text}` : text
}

const insert = (text: string) => {
  composer.text = join(text)
}

const owner = $derived(composer.props.converse ? composer.props.draft : undefined)

const talking = $derived(!!owner && conversation.owner === owner)

const toggleTalk = () => {
  const { converse, draft } = composer.props

  if (talking) {
    conversation.end()
  } else if (converse) {
    conversation.start(draft, converse.host)
  }
}

const clock = $derived(
  `${Math.floor(voice.elapsed / 60)}:${String(voice.elapsed % 60).padStart(2, "0")}`,
)

const label = $derived(
  voice.recording
    ? m.voice_stop()
    : voice.transcribing
      ? m.voice_transcribing()
      : m.voice_record(),
)
</script>

{#if voice.ready}
  <div class="flex min-w-0 shrink-0 items-center gap-1">
    <IconButton
      icon={voice.recording ? "lucide:square" : "lucide:mic"}
      iconClass={voice.recording ? "size-3.5 animate-pulse" : "size-4"}
      {label}
      tone={voice.recording ? "error" : "ghost"}
      busy={voice.transcribing}
      class="relative transition-colors duration-140"
      aria-pressed={voice.recording}
      disabled={voice.transcribing || !!conversation.owner}
      onclick={() => voice.toggle(insert)}
    >
      {#if voice.recording && !voice.transcribing}
        <span
          class="badge badge-error badge-xs absolute -top-2 left-1/2 -translate-x-1/2 tabular-nums"
        >
          {clock}
        </span>
      {/if}
    </IconButton>
    {#if owner}
      <IconButton
        icon="lucide:audio-lines"
        iconClass={["size-4", talking && "animate-pulse"]}
        label={m.voice_mode()}
        class={["transition-colors duration-140", talking && "bg-primary/8 text-primary"]}
        aria-pressed={talking}
        disabled={voice.recording || voice.transcribing}
        onclick={toggleTalk}
      />
    {/if}
    {#if voice.error && !talking}
      <span role="alert" class="min-w-0 truncate text-xs text-error" title={voice.error}>
        {voice.error}
      </span>
    {/if}
  </div>
{/if}
