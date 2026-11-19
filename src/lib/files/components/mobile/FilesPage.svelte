<script lang="ts">
  import Icon from "@iconify/svelte"
  import { onBackButtonPress } from "@tauri-apps/api/app"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Modal from "#lib/components/ui/Modal.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { nav } from "#lib/store/nav.svelte.ts"
  import { shell } from "#lib/store/shell.svelte.ts"
  import Devices from "../share/Devices.svelte"
  import { share } from "../share/share.svelte"
  import Toasts from "../window/Toasts.svelte"
  import MobileFiles from "./MobileFiles.svelte"
  import { sendToBack } from "./mobile"

  let files = $state<MobileFiles>()
  let panel = $state<Devices>()
  let devices = $state(false)

  const back = () => {
    if (shell.overlay || nav.settingsOpen || nav.palette) {
      shell.closeDrawer()
      nav.settingsOpen = false
      nav.palette = false

      return
    }

    if (devices) {
      if (!panel?.back()) {
        devices = false
      }

      return
    }

    if (!files?.back()) {
      sendToBack().catch(() => undefined)
    }
  }

  $effect(() => {
    if (share.center) {
      share.center = false
      devices = true
    }
  })

  $effect(() => {
    const listener = onBackButtonPress(back)

    return () => {
      listener.then(handle => handle.unregister()).catch(() => undefined)
    }
  })
</script>

{#snippet actions()}
  <IconButton
    icon="lucide:monitor-smartphone"
    label={m.files_devices_title()}
    size="md"
    class="shrink-0"
    onclick={() => (devices = true)}
  />
{/snippet}

<MobileFiles bind:this={files} {actions} />

<Modal bind:open={devices} label={m.files_devices_title()} class="w-full max-w-lg">
  <header class="flex h-12 shrink-0 items-center gap-2 px-4">
    <Icon
      icon="lucide:monitor-smartphone"
      class="size-4 shrink-0 text-base-content/60"
    />
    <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">
      {m.files_devices_title()}
    </h2>
    <IconButton
      icon="lucide:x"
      label={m.common_close()}
      size="md"
      class="shrink-0"
      onclick={() => (devices = false)}
    />
  </header>

  <div class="px-4 pb-4">
    <Devices bind:this={panel} />
  </div>
</Modal>

<Toasts />
