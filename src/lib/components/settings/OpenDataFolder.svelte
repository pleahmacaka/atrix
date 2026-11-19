<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"

const openDataFolder = async () => {
  const [{ homeDir, join }, { openPath }] = await Promise.all([
    import("@tauri-apps/api/path"),
    import("@tauri-apps/plugin-opener"),
  ])

  await openPath(await join(await homeDir(), ".atrix"))
}
</script>

<IconButton
  icon="lucide:folder-open"
  label={m.device_open_folder()}
  tone="plain"
  onclick={openDataFolder}
/>