<script lang="ts">
import Icon from "@iconify/svelte"
import PairPanel from "#lib/components/devices/PairPanel.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import UpdateButton from "#lib/components/update/UpdateButton.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { updater } from "#lib/update/updater.svelte.ts"

const version = desktop
  ? import("@tauri-apps/api/app").then(app => app.getVersion())
  : Promise.resolve("")

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
  <SettingRow icon="lucide:circle-arrow-up" title={m.update_title()}>
    {#await version then current}
      <span class="text-sm text-base-content/60 tabular-nums">{current}</span>
    {/await}
    <UpdateButton />
  </SettingRow>
  <ErrorAlert message={updater.failure} />
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
