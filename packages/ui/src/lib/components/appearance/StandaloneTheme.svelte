<script lang="ts">
  import { type Appearance, standaloneLook } from "@atrix/settings"
  import { t } from "svelte-i18n"
  import AppearanceRows from "./AppearanceRows.svelte"
  import Row from "../forms/Row.svelte"
  import Section from "../forms/Section.svelte"
  import { atrixStyle } from "../../store/standalone.svelte"

  let {
    prefs,
    defaults = standaloneLook,
    essential = false,
  }: {
    prefs: { followAtrix: boolean; look: Appearance }
    defaults?: Appearance
    essential?: boolean
  } = $props()

  const following = $derived(atrixStyle.linked && prefs.followAtrix)

  const resetKey = (key: keyof Appearance) => {
    prefs.look = { ...prefs.look, [key]: defaults[key] }
  }
</script>

<Section title={$t("settings.groups.linkedStyle")}>
  <Row
    label={$t("settings.rows.followAtrix")}
    hint={atrixStyle.linked
      ? $t("settings.hints.followAtrix")
      : $t("settings.hints.atrixMissing")}
  >
    <input
      type="checkbox"
      class="toggle toggle-primary"
      aria-label={$t("settings.rows.followAtrix")}
      disabled={!atrixStyle.linked}
      bind:checked={prefs.followAtrix}
    />
  </Row>
</Section>

{#if !following}
  <AppearanceRows bind:appearance={prefs.look} {essential} onreset={resetKey} />
{/if}
