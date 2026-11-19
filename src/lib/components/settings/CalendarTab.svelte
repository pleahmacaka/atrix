<script lang="ts">
import { requestCalendarAccess, syncNow } from "#lib/calendar/android.svelte.ts"
import { holidays, prefs } from "#lib/calendar/calendar.svelte.ts"
import { regions } from "#lib/calendar/holidays.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { platform } from "#lib/platform.ts"

const syncing = new Attempt()

$effect(() => {
  void holidays.load()
})

const regionOptions = $derived.by(() => {
  const names = new Intl.DisplayNames([getLocale()], { type: "region" })

  return [
    { value: "system", label: m.calendar_region_system() },
    ...(holidays.ready ? regions() : []).map(code => ({
      value: code,
      label: names.of(code) ?? code,
      keywords: [code],
    })),
  ]
})

const WEEK_STARTS = [
  { id: "0" as const, label: m.calendar_sunday() },
  { id: "1" as const, label: m.calendar_monday() },
]

const toggleAndroid = (on: boolean) =>
  syncing.run(async () => {
    if (on && !(await requestCalendarAccess())) {
      throw new Error(m.calendar_android_denied())
    }

    prefs.setAndroidSync(on)

    if (on) {
      await syncNow()
    }
  })
</script>

<Section>
  <SettingRow title={m.calendar_week_start()}>
    <Segmented
      label={m.calendar_week_start()}
      items={WEEK_STARTS}
      value={prefs.weekStartsOn === 1 ? "1" : "0"}
      onpick={id => prefs.setWeekStart(id === "1" ? 1 : 0)}
    />
  </SettingRow>
  <SettingRow title={m.calendar_week_numbers()}>
    <input
      type="checkbox"
      class="toggle toggle-sm toggle-primary"
      aria-label={m.calendar_week_numbers()}
      checked={prefs.weekNumbers}
      onchange={e => prefs.setWeekNumbers(e.currentTarget.checked)}
    />
  </SettingRow>
  <SettingRow title={m.calendar_region()}>
    <Select
      label={m.calendar_region()}
      class="w-48 max-sm:w-full"
      options={regionOptions}
      value={prefs.region}
      onchange={prefs.setRegion}
    />
  </SettingRow>
  {#if platform === "android"}
    <SettingRow title={m.calendar_android_sync()}>
      <input
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        aria-label={m.calendar_android_sync()}
        checked={prefs.androidSync}
        disabled={syncing.busy}
        onchange={e => toggleAndroid(e.currentTarget.checked)}
      />
    </SettingRow>
  {/if}
</Section>
<ErrorAlert message={syncing.failure} />