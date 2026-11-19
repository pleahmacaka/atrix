<script lang="ts">
import type { Attachment } from "svelte/attachments"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { Launcher } from "./launcher.svelte"
import { timerKindLabel } from "./timers"

let { launcher }: { launcher: Launcher } = $props()

const MODE_LABELS = {
  run: m.launcher_mode_run,
  todo: m.launcher_mode_todo,
  calc: m.launcher_mode_calc,
  clip: m.launcher_mode_clip,
  emoji: m.launcher_mode_emoji,
}

const route = $derived(launcher.route)

const modeLabel = $derived(
  route.mode === "timer"
    ? timerKindLabel(route.kind)
    : route.mode === "search"
      ? ""
      : MODE_LABELS[route.mode](),
)

const field: Attachment<HTMLElement> = node => {
  launcher.input = node.querySelector("input") ?? undefined

  return () => {
    launcher.input = undefined
  }
}
</script>

<div class="flex min-w-0 shrink-0 items-center gap-1" {@attach field}>
  <SearchField
    bind:value={launcher.query}
    label={m.launcher_placeholder()}
    class="h-10 flex-1"
    autocapitalize="off"
    oninput={() => launcher.reset()}
  />
  {#if modeLabel}
    <span class="badge badge-soft badge-primary badge-sm shrink-0 whitespace-nowrap">
      {modeLabel}
    </span>
  {/if}
</div>
