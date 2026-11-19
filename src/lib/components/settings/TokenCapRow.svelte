<script lang="ts">
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { settings } from "#lib/store/settings.svelte.ts"

const compact = new Intl.NumberFormat(getLocale(), { notation: "compact" })

const CAPS = [0, 100_000, 300_000, 1_000_000].map(cap => ({
  id: String(cap),
  label: cap ? compact.format(cap) : m.mail_token_cap_off(),
}))
</script>

<SettingRow title={m.mail_token_cap()}>
  <Segmented
    label={m.mail_token_cap()}
    items={CAPS}
    value={String(settings.mailTokenCap)}
    onpick={id => settings.setMailTokenCap(Number(id))}
  />
</SettingRow>