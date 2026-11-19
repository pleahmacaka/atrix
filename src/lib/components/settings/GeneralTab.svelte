<script lang="ts">
import Icon from "@iconify/svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import UpdateButton from "#lib/components/update/UpdateButton.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop, mobileApp } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { updater } from "#lib/update/updater.svelte.ts"
import AppVersion from "./AppVersion.svelte"
import TokscaleSettings from "./TokscaleSettings.svelte"

const openDataFolder = async () => {
  const [{ homeDir, join }, { openPath }] = await Promise.all([
    import("@tauri-apps/api/path"),
    import("@tauri-apps/plugin-opener"),
  ])

  await openPath(await join(await homeDir(), ".atrix"))
}
</script>

<div class="flex flex-col gap-6">
  <Section>
    <SettingRow title={m.user_name()} tip={m.user_name_tip()}>
      <input
        class="input input-sm w-48 max-sm:w-full"
        aria-label={m.user_name()}
        value={settings.userName}
        onchange={e => settings.setUserName(e.currentTarget.value)}
      />
    </SettingRow>
    <SettingRow title={m.device_name()} tip={m.device_name_tip()}>
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
    {#if desktop}
      <SettingRow title={m.device_runs_harness()} tip={m.device_runs_harness_tip()}>
        <span class="badge badge-success badge-soft whitespace-nowrap">
          <Icon icon="lucide:check" class="size-3" />
          {m.common_enabled()}
        </span>
      </SettingRow>
      <SettingRow title={m.update_title()} tip={m.update_title_tip()}>
        <AppVersion />
        <UpdateButton />
      </SettingRow>
      <SettingRow title={m.device_data_folder()} tip={m.device_data_folder_tip()}>
        <IconButton
          icon="lucide:folder-open"
          label={m.device_open_folder()}
          tone="plain"
          onclick={openDataFolder}
        />
      </SettingRow>
    {:else if mobileApp}
      <SettingRow title={m.app_version()} tip={m.app_version_tip()}>
        <AppVersion />
      </SettingRow>
    {/if}
  </Section>
  {#if desktop}
    <ErrorAlert message={updater.failure} />
    <Section>
      <TokscaleSettings />
    </Section>
  {/if}
</div>
