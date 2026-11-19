<script lang="ts">
import Icon from "@iconify/svelte"
import { useComposer } from "#lib/chat/composer.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"

type Action = {
  icon: string
  label: string
  run: () => void
  tone: "btn-error" | "btn-primary"
  disabled?: boolean
}

const composer = useComposer()

const action = $derived.by((): Action => {
  if (composer.empty && composer.talking) {
    return {
      icon: "lucide:phone-off",
      label: m.voice_end(),
      run: conversation.end,
      tone: "btn-error",
    }
  }

  if (composer.stoppable) {
    return { icon: "lucide:square", label: m.chat_stop(), run: composer.stop, tone: "btn-primary" }
  }

  if (composer.empty && composer.callable) {
    return {
      icon: "lucide:audio-lines",
      label: voice.ready ? m.voice_mode() : m.voice_setup(),
      run: composer.call,
      tone: "btn-primary",
    }
  }

  return {
    icon: "lucide:arrow-up",
    label: m.chat_send(),
    run: composer.submit,
    tone: "btn-primary",
    disabled: composer.empty || composer.props.disabled,
  }
})
</script>

<button
  type="button"
  class={["btn btn-sm btn-circle size-full min-h-0", action.tone]}
  aria-label={action.label}
  title={action.label}
  disabled={action.disabled}
  onclick={action.run}
>
  <Icon icon={action.icon} class="size-4" />
</button>