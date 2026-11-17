<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { updater } from "#lib/update/updater.svelte.ts"

let { size = "sm" }: { size?: "xs" | "sm" } = $props()

const busy = $derived(
  updater.phase === "checking" ||
    updater.phase === "downloading" ||
    updater.phase === "installing",
)

const label = $derived(
  updater.phase === "found"
    ? m.update_download({ version: updater.version ?? "" })
    : updater.phase === "downloading"
      ? m.update_downloading({ percent: updater.percent })
      : updater.phase === "ready" || updater.phase === "installing"
        ? m.update_restart()
        : updater.phase === "latest"
          ? m.update_latest()
          : m.update_check(),
)

const run = () => {
  if (updater.phase === "found") {
    updater.download()
  } else if (updater.phase === "ready") {
    updater.restart()
  } else {
    updater.check()
  }
}
</script>

<button
  type="button"
  class={[
    "btn whitespace-nowrap tabular-nums",
    size === "xs" ? "btn-xs" : "btn-sm",
    (updater.phase === "found" || updater.phase === "ready") && "btn-primary",
  ]}
  disabled={busy}
  onclick={run}
>
  {#if busy}
    <span class="loading loading-spinner loading-xs"></span>
  {:else if updater.phase === "ready"}
    <Icon icon="lucide:rotate-cw" class="size-4" />
  {:else if updater.phase === "found"}
    <Icon icon="lucide:download" class="size-4" />
  {/if}
  {label}
</button>
