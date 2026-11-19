<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import WindowControls from "#lib/components/ui/WindowControls.svelte"
import { m } from "#lib/paraglide/messages.js"
import TabStrip from "./TabStrip.svelte"
import { session } from "./tabs.svelte"
</script>

<header
  class="flex h-10 shrink-0 items-center gap-1 ps-2 pe-1.5 select-none"
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
  <WindowControls />
</header>
