<script lang="ts">
import Icon from "@iconify/svelte"
import { onMount } from "svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { keysOf, withKeys } from "#lib/store/shortcuts.ts"

let maximized = $state(false)

const win = () =>
  import("@tauri-apps/api/window").then(m => m.getCurrentWindow())

onMount(() => {
  if (!desktop) {
    return
  }

  let unlisten = () => {}

  win().then(async w => {
    maximized = await w.isMaximized()
    unlisten = await w.onResized(async () => {
      maximized = await w.isMaximized()
    })
  })

  return () => unlisten()
})
</script>

<header
  class="flex h-9 shrink-0 items-center gap-2 ps-2 select-none"
  style:zoom={100 / settings.scale}
  data-tauri-drag-region
>
  <div class="flex-1" data-tauri-drag-region></div>
  <button
    type="button"
    class={[
      "flex h-7 w-full max-w-xl min-w-0 cursor-pointer items-center gap-2 rounded-field px-3",
      "border border-base-300 bg-base-100/60 text-sm text-base-content/60",
      "transition-colors duration-140 hover:bg-base-100 hover:text-base-content",
    ]}
    title={withKeys(m.chat_search_load(), "palette")}
    onclick={() => {
      nav.palette = true
    }}
  >
    <Icon icon="lucide:search" class="size-3.5 shrink-0" />
    <span class="min-w-0 flex-1 truncate text-start">{m.chat_search_load()}</span>
    <kbd class="kbd kbd-xs shrink-0 opacity-60">{keysOf("palette")}</kbd>
  </button>
  <div class="flex flex-1 items-center justify-end self-stretch" data-tauri-drag-region>
    {#if desktop}
      <IconButton
        icon="lucide:minus"
        label={m.shell_minimize()}
        class="h-full w-11 rounded-none"
        onclick={() => win().then(w => w.minimize())}
      />
      <IconButton
        icon={maximized ? "lucide:copy" : "lucide:square"}
        label={maximized ? m.shell_restore() : m.shell_maximize()}
        iconClass="size-3.5"
        class="h-full w-11 rounded-none"
        onclick={() => win().then(w => w.toggleMaximize())}
      />
      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        class="h-full w-11 rounded-none hover:bg-error hover:text-error-content"
        onclick={() => win().then(w => w.close())}
      />
    {/if}
  </div>
</header>
