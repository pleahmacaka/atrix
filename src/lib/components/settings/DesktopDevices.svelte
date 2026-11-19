<script lang="ts">
import PairPanel from "#lib/components/devices/PairPanel.svelte"
import { roster } from "#lib/components/devices/roster.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import DesktopSection from "./DesktopSection.svelte"

$effect(() => roster.watch())
</script>

<DesktopSection id="devices">
  <SettingRow title={m.device_name()} tip={m.device_name_tip()}>
    <input
      class="input input-sm w-48 max-sm:w-full"
      aria-label={m.device_name()}
      value={settings.deviceName}
      onchange={e => roster.rename(e.currentTarget.value)}
    />
  </SettingRow>
</DesktopSection>
{#if roster.started}
  <PairPanel source={roster} />
{:else}
  <EmptyState icon="lucide:radio-tower" text={m.desktop_devices_waiting()} />
{/if}
