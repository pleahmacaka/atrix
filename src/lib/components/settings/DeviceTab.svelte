<script lang="ts">
import Icon from "@iconify/svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"
</script>

<SettingRow
  icon="lucide:tag"
  title={m.device_name()}
>
  <input
    class="input input-sm w-48"
    aria-label={m.device_name()}
    value={settings.deviceName}
    onchange={e => {
      settings.setName(e.currentTarget.value)
      sync.announce()
    }}
  />
</SettingRow>
<SettingRow
  icon="lucide:boxes"
  title={m.device_runs_harness()}
>
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
