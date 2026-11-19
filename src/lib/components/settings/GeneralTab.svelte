<script lang="ts">
import Icon from "@iconify/svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Section from "#lib/components/ui/Section.svelte"
import UpdateButton from "#lib/components/update/UpdateButton.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { updater } from "#lib/update/updater.svelte.ts"
import AppVersion from "./AppVersion.svelte"
import OpenDataFolder from "./OpenDataFolder.svelte"
import SettingIsland from "./SettingIsland.svelte"
import TokscaleSettings from "./TokscaleSettings.svelte"
</script>

<div class="flex flex-col gap-6">
  <SettingIsland title={m.user_name()}>
    <input
      class="input input-sm w-48 max-sm:w-full"
      aria-label={m.user_name()}
      value={settings.userName}
      onchange={e => settings.setUserName(e.currentTarget.value)}
    />
  </SettingIsland>
  <SettingIsland title={m.device_name()}>
    <input
      class="input input-sm w-48 max-sm:w-full"
      aria-label={m.device_name()}
      value={settings.deviceName}
      onchange={e => {
        settings.setName(e.currentTarget.value)
        sync.announce()
      }}
    />
  </SettingIsland>
  <SettingIsland title={m.device_runs_harness()}>
    <span class={["badge whitespace-nowrap", desktop ? "badge-success badge-soft" : "badge-ghost"]}>
      <Icon icon={desktop ? "lucide:check" : "lucide:minus"} class="size-3" />
      {desktop ? m.common_enabled() : m.common_unsupported()}
    </span>
  </SettingIsland>
  {#if desktop}
    <SettingIsland title={m.update_title()}>
      <AppVersion />
      <UpdateButton />
    </SettingIsland>
    <SettingIsland title={m.device_data_folder()}>
      <OpenDataFolder />
    </SettingIsland>
    <ErrorAlert message={updater.failure} />
    <Section>
      <TokscaleSettings />
    </Section>
  {/if}
</div>