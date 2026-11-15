<script lang="ts">
import type { ClassValue } from "svelte/elements"
import { ThinkingOrb } from "svelte-thinking-orbs"
import { type CallState, palette } from "#lib/voice/call.svelte.ts"

let { call, size, class: extra }: { call: CallState; size: number; class?: ClassValue } =
  $props()
</script>

<span
  class={["grid place-items-center transition duration-120", call.quiet && "opacity-40", extra]}
  style:transform="scale({0.92 + call.level * 0.2})"
>
  <ThinkingOrb
    state={call.orb}
    {size}
    theme={palette.dark ? "dark" : "light"}
    color={call.thinking ? undefined : palette.ink}
    paused={call.quiet}
    aria-label={call.status}
  />
</span>
