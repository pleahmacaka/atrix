<script lang="ts">
import Icon from "@iconify/svelte"
import { isTauri } from "@tauri-apps/api/core"
import { onMount } from "svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { updater } from "#lib/update/updater.svelte.ts"
import { updated } from "$app/state"
import UpdateButton from "./UpdateButton.svelte"

let dismissed = $state(false)

const web = !isTauri()

onMount(() => {
  if (desktop && !import.meta.env.DEV) {
    updater.check()
  }
})

const pending = $derived(
  updater.phase === "found" ||
    updater.phase === "downloading" ||
    updater.phase === "ready" ||
    updater.phase === "installing",
)

const visible = $derived(!dismissed && (pending || (web && updated.current)))
</script>

{#if visible}
  <div class="toast toast-top toast-end top-10 z-50">
    <div role="status" class="alert border border-base-300 bg-raised text-sm shadow-lg">
      <Icon icon="lucide:circle-arrow-up" class="size-4 shrink-0 text-primary" />
      <span class="min-w-0 break-words">
        {pending ? m.update_desktop({ version: updater.version ?? "" }) : m.update_web()}
      </span>
      {#if pending}
        <UpdateButton size="xs" />
      {:else}
        <button type="button" class="btn btn-primary btn-xs" onclick={() => location.reload()}>
          {m.update_reload()}
        </button>
      {/if}
      <IconButton
        icon="lucide:x"
        label={m.update_later()}
        size="xs"
        disabled={updater.phase === "installing"}
        onclick={() => {
          dismissed = true
        }}
      />
    </div>
  </div>
{/if}
