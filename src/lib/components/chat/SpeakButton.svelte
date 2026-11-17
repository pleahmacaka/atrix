<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { voice } from "#lib/voice/voice.svelte.ts"

let { text }: { text: string } = $props()

let playing = $state(false)

const toggle = async () => {
  if (playing) {
    voice.stopSpeaking()
    playing = false

    return
  }

  playing = true

  try {
    await voice.speak(text)
  } finally {
    playing = false
  }
}
</script>

{#if voice.canSpeak}
  <IconButton
    icon={playing ? "lucide:square" : "lucide:volume-2"}
    label={playing ? m.voice_stop_reading() : m.voice_read()}
    size="xs"
    aria-pressed={playing}
    onclick={toggle}
  />
{/if}
