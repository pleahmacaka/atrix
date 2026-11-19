<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
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
</script>

<SettingRow title={m.lock_method()}>
  <span class="text-sm text-base-content/70">
    {kind === "pin" ? m.lock_pin() : kind === "pattern" ? m.lock_pattern() : m.lock_none()}
  </span>
  <button type="button" class="btn btn-sm" onclick={() => (screen.setup = "pin")}>
    {m.lock_set_pin()}
  </button>
  <button type="button" class="btn btn-sm" onclick={() => (screen.setup = "pattern")}>
    {m.lock_set_pattern()}
  </button>
  {#if kind}
    <button type="button" class="btn btn-sm" onclick={() => (screen.setup = "remove")}>
      {m.lock_remove()}
    </button>
  {/if}
</SettingRow>

<SettingRow title={m.lock_idle()}>
  <Segmented
    items={IDLE}
    value={String(settings.lockIdle)}
    onpick={v => settings.setLockIdle(Number(v))}
  />
</SettingRow>
