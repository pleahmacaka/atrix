<script lang="ts">
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { SUBMIT_HOURS, settings } from "#lib/store/settings.svelte.ts"
import { scheduleSubmit, submission, usageGraph } from "#lib/store/usageGraph.svelte.ts"

const LABELS: Record<number, () => string> = {
  1: m.device_submit_hourly,
  6: m.device_submit_six,
  24: m.device_submit_daily,
}

const SUBMITS = [
  { id: "0", label: m.device_submit_off() },
  ...SUBMIT_HOURS.map(hour => ({ id: String(hour), label: LABELS[hour]() })),
]

const toggle = (on: boolean) => {
  usageGraph.reset()
  settings.setTokscale(on)
}
</script>

<SettingRow icon="lucide:chart-column-big" title={m.device_tokscale()} tip={m.device_tokscale_tip()}>
  <input
    type="checkbox"
    class="toggle toggle-sm toggle-primary"
    aria-label={m.device_tokscale()}
    checked={settings.tokscale}
    onchange={e => toggle(e.currentTarget.checked)}
  />
</SettingRow>

{#if settings.tokscale}
  <SettingRow title={m.device_tokscale_submit()} tip={m.device_tokscale_submit_tip()}>
    <Segmented
      label={m.device_tokscale_submit()}
      items={SUBMITS}
      value={String(settings.tokscaleSubmit)}
      onpick={value => scheduleSubmit(Number(value))}
    />
  </SettingRow>
{/if}

<ErrorAlert message={usageGraph.failure ?? submission.failure} />