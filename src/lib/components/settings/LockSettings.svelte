<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { lockKind, screen } from "#lib/lock/lock.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { LOCK_IDLE, settings } from "#lib/store/settings.svelte.ts"

const kind = $derived(lockKind())

const IDLE = LOCK_IDLE.map(minutes => ({
  id: String(minutes),
  label:
    minutes === 0
      ? m.lock_idle_off()
      : minutes === 60
        ? m.lock_idle_hour()
        : m.lock_idle_minutes({ count: minutes }),
}))

const METHODS = [
  { value: "none", label: m.lock_none() },
  { value: "pin", label: m.lock_pin() },
  { value: "pattern", label: m.lock_pattern() },
]

const choose = (value: string) => {
  if (value === "pin" || value === "pattern") {
    screen.setup = value
  } else if (kind) {
    screen.setup = "remove"
  }
}
</script>

<SettingRow title={m.lock_method()}>
  {#if kind}
    <IconButton
      icon="lucide:pencil"
      label={kind === "pin" ? m.lock_set_pin() : m.lock_set_pattern()}
      onclick={() => (screen.setup = kind)}
    />
  {/if}
  {#key `${kind}:${screen.setup}`}
    <Select
      class="w-44 max-sm:w-full"
      label={m.lock_method()}
      options={METHODS}
      value={kind ?? "none"}
      onchange={choose}
    />
  {/key}
</SettingRow>

<SettingRow title={m.lock_idle()}>
  <Segmented
    label={m.lock_idle()}
    items={IDLE}
    value={String(settings.lockIdle)}
    onpick={value => settings.setLockIdle(Number(value))}
  />
</SettingRow>