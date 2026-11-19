<script lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window"
import { m } from "#lib/paraglide/messages.js"
import IconButton from "./IconButton.svelte"

const win = getCurrentWindow()

let maximized = $state(false)

$effect(() => {
  const sync = async () => {
    maximized = await win.isMaximized()
  }

  const stop = win.onResized(sync)

  sync().catch(() => undefined)

  return () => {
    stop.then(unlisten => unlisten())
  }
})
</script>

<span
  class="mx-1.5 h-4 w-hairline shrink-0 bg-base-content/15"
  aria-hidden="true"
></span>
<div class="-me-1.5 flex h-full shrink-0 items-center self-stretch">
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
