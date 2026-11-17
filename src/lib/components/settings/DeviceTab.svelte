<script lang="ts">
import Icon from "@iconify/svelte"
import PairPanel from "#lib/components/devices/PairPanel.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"

const openDataFolder = async () => {
  const [{ homeDir, join }, { openPath }] = await Promise.all([
    import("@tauri-apps/api/path"),
    import("@tauri-apps/plugin-opener"),
  ])

  await openPath(await join(await homeDir(), ".atrix"))
}
</script>

<SettingRow icon="lucide:user-round" title={m.user_name()}>
  <input
    class="input input-sm w-48 max-sm:w-full"
    aria-label={m.user_name()}
    value={settings.userName}
    onchange={e => settings.setUserName(e.currentTarget.value)}
  />
</SettingRow>
<SettingRow icon="lucide:tag" title={m.device_name()}>
  <input
    class="input input-sm w-48 max-sm:w-full"
    aria-label={m.device_name()}
    value={settings.deviceName}
    onchange={e => {
      settings.setName(e.currentTarget.value)
      sync.announce()
    }}
  />
</SettingRow>
<SettingRow icon="lucide:boxes" title={m.device_runs_harness()}>
  <span
    class={[
      "badge whitespace-nowrap",
      desktop ? "badge-success badge-soft" : "badge-ghost",
    ]}
  >
    <Icon icon={desktop ? "lucide:check" : "lucide:minus"} class="size-3" />
    {desktop ? m.common_enabled() : m.common_unsupported()}
  </span>
</SettingRow>
{#if desktop}
  <SettingRow icon="lucide:folder" title={m.device_data_folder()}>
    <IconButton
      icon="lucide:folder-open"
      label={m.device_open_folder()}
      tone="plain"
      onclick={openDataFolder}
    />
  </SettingRow>
{/if}
<div class="pt-6">
  <PairPanel />
</div>
