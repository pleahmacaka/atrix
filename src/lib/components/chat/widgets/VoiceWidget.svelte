<script lang="ts">
import { useComposer } from "#lib/chat/composer.svelte.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"

const composer = useComposer()

const insert = (text: string) => {
  const current = composer.text.trim()

  composer.text = current ? `${current} ${text}` : text
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

const error = $derived(conversation.error ?? voice.error)
</script>

{#if voice.ready}
  <div class="flex min-w-0 shrink-0 items-center gap-1">
    {#if error}
      <span role="alert" class="min-w-0 truncate text-xs text-error" title={error}>
        {error}
      </span>
    {/if}
    {#if composer.talking}
      <IconButton
        icon={conversation.muted ? "lucide:mic-off" : "lucide:mic"}
        label={conversation.muted ? m.voice_unmute() : m.voice_mute()}
        class={["transition-colors duration-140", conversation.muted && "bg-primary/8 text-primary"]}
        aria-pressed={conversation.muted}
        onclick={() => conversation.setMuted(!conversation.muted)}
      />
      <IconButton
        icon={conversation.full ? "lucide:minimize-2" : "lucide:maximize-2"}
        label={conversation.full ? m.voice_exit_fullscreen() : m.voice_fullscreen()}
        aria-pressed={conversation.full}
        onclick={() => {
          conversation.full = !conversation.full
        }}
      />
    {:else}
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
    {/if}
  </div>
{/if}
