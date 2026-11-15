<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import type { CallState } from "#lib/voice/call.svelte.ts"

let {
  call,
  large = false,
  onMute,
  onEnd,
}: { call: CallState; large?: boolean; onMute: () => void; onEnd: () => void } = $props()

const button = $derived(["btn btn-circle shrink-0", large ? "btn-lg" : "btn-sm"])

const icon = $derived(large ? "size-5" : "size-4")
</script>

<button
  type="button"
  class={[
    button,
    "transition-colors duration-140",
    call.muted ? "bg-primary/8 text-primary" : "btn-ghost",
  ]}
  aria-label={call.muted ? m.voice_unmute() : m.voice_mute()}
  aria-pressed={call.muted}
  title={call.muted ? m.voice_unmute() : m.voice_mute()}
  disabled={call.failed}
  onclick={onMute}
>
  <Icon icon={call.muted ? "lucide:mic-off" : "lucide:mic"} class={icon} />
</button>
<button
  type="button"
  class={[button, "btn-error"]}
  aria-label={m.voice_end()}
  title={m.voice_end()}
  onclick={onEnd}
>
  <Icon icon="lucide:x" class={icon} />
</button>
