<script lang="ts">
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { SUBMIT_HOURS, settings } from "#lib/store/settings.svelte.ts"
import {
  scheduleSubmit,
  submission,
  syncSubmit,
  usageGraph,
} from "#lib/store/usageGraph.svelte.ts"

const LABELS: Record<number, () => string> = {
  1: m.device_submit_hourly,
  6: m.device_submit_six,
  24: m.device_submit_daily,
}

$effect(() => {
  if (settings.tokscale) {
    syncSubmit()
  }
})

const SUBMITS = [
  { id: "0", label: m.device_submit_off() },
  ...SUBMIT_HOURS.map(h => ({ id: String(h), label: LABELS[h]() })),
]
</script>

<SettingRow icon="lucide:chart-column-big" title={m.device_tokscale()}>
  <input
    type="checkbox"
    class="toggle toggle-sm toggle-primary"
    aria-label={m.device_tokscale()}
    checked={settings.tokscale}
    onchange={async e => {
      const input = e.currentTarget
      const on = input.checked

      if (!on && settings.tokscaleSubmit > 0 && !(await scheduleSubmit(0))) {
        input.checked = true

        return
      }

      usageGraph.reset()
      settings.setTokscale(on)
    }}
  />
</SettingRow>

{#if settings.tokscale}
  <SettingRow title={m.device_tokscale_submit()}>
    <Segmented
      label={m.device_tokscale_submit()}
      items={SUBMITS}
      value={String(settings.tokscaleSubmit)}
      onpick={v => scheduleSubmit(Number(v))}
    />
  </SettingRow>
{/if}

<ErrorAlert message={usageGraph.failure ?? submission.failure} />
