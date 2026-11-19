<script lang="ts">
  import { cycleInputLanguage, type InputLanguage, inputLanguage } from "#lib/desktop/native/quick.js"
  import { m } from "#lib/paraglide/messages.js"
  import { dockAwake } from "./dock.svelte"

  let { compact = false }: { compact?: boolean } = $props()

  const POLL = 1_000
  const SETTLE = 150

  let info = $state<InputLanguage | null>(null)

  const refresh = async () => {
    info = await inputLanguage().catch(() => null)
  }

  $effect(() => {
    if (!dockAwake.visible) {
      return
    }

    refresh()

    const timer = setInterval(refresh, POLL)

    return () => clearInterval(timer)
  })

  const cycle = async () => {
    await cycleInputLanguage().catch(() => undefined)

    setTimeout(refresh, SETTLE)
  }
</script>

{#if info && info.layouts >= 2}
  {@const title = m.dock_input_language({ label: info.label })}

  <button
    type="button"
    class={["btn btn-ghost min-w-8 px-1.5 text-xs font-medium tabular-nums", compact ? "btn-xs" : "btn-sm"]}
    {title}
    aria-label={title}
    onclick={cycle}
  >
    {info.label}
  </button>
{/if}
