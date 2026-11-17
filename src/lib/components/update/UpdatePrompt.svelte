<script lang="ts">
import Icon from "@iconify/svelte"
import { isTauri } from "@tauri-apps/api/core"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { onMount } from "svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { updated } from "$app/state"

let update = $state<Update | null>(null)

let dismissed = $state(false)

let installing = $state(false)

const web = !isTauri()

const install = async () => {
  if (!update) {
    return
  }

  installing = true

  try {
    await update.downloadAndInstall()
    await relaunch()
  } catch {
    installing = false
    dismissed = true
  }
}

onMount(() => {
  if (desktop && !import.meta.env.DEV) {
    check()
      .then(found => {
        update = found
      })
      .catch(() => {})
  }
})

const version = $derived(update?.version ?? null)

const visible = $derived(!dismissed && (version !== null || (web && updated.current)))
</script>

{#if visible}
  <div class="toast toast-end z-50">
    <div role="status" class="alert text-sm">
      <Icon icon="lucide:circle-arrow-up" class="size-4 shrink-0 text-primary" />
      <span class="min-w-0 break-words">
        {version ? m.update_desktop({ version }) : m.update_web()}
      </span>
      {#if version}
        <button type="button" class="btn btn-primary btn-xs" disabled={installing} onclick={install}>
          {#if installing}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          {m.update_install()}
        </button>
      {:else}
        <button type="button" class="btn btn-primary btn-xs" onclick={() => location.reload()}>
          {m.update_reload()}
        </button>
      {/if}
      <IconButton
        icon="lucide:x"
        label={m.update_later()}
        size="xs"
        disabled={installing}
        onclick={() => {
          dismissed = true
        }}
      />
    </div>
  </div>
{/if}
