<script lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import TabStrip from "./TabStrip.svelte"
import { session } from "./tabs.svelte"

const win = getCurrentWindow()

let maximized = $state(false)

$effect(() => {
  const sync = async () => {
    maximized = await win.isMaximized()
  }

  const stop = win.onResized(sync)

  sync()

  return () => {
    stop.then(unlisten => unlisten())
  }
})
</script>

<header
  class="flex h-10 shrink-0 items-center gap-1 ps-2 select-none"
  data-tauri-drag-region
>
  <TabStrip />
  <div class="h-full min-w-4 flex-1" data-tauri-drag-region></div>
  <IconButton
    icon="lucide:settings"
    label={m.common_settings()}
    class="shrink-0"
    onclick={() => (session.settingsOpen = true)}
  />
  <div class="flex h-full shrink-0 items-center self-stretch">
    <IconButton
      icon="lucide:minus"
      label={m.shell_minimize()}
      class="h-full w-11 rounded-none"
      onclick={() => win.minimize()}
    />
    <IconButton
      icon={maximized ? "lucide:copy" : "lucide:square"}
      label={maximized ? m.shell_restore() : m.shell_maximize()}
      iconClass="size-3.5"
      class="h-full w-11 rounded-none"
      onclick={() => win.toggleMaximize()}
    />
    <IconButton
      icon="lucide:x"
      label={m.common_close()}
      class="h-full w-11 rounded-none hover:bg-error hover:text-error-content"
      onclick={() => win.close()}
    />
  </div>
</header>
