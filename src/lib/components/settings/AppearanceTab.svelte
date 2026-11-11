<script lang="ts">
import Icon from "@iconify/svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { chooseLanguage, LANGUAGES, languageChoice } from "#lib/store/locale.ts"
import {
  ACCENTS,
  settings,
  type Theme,
  type WindowEffect,
} from "#lib/store/settings.svelte.ts"

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "system", label: m.appearance_system(), icon: "lucide:monitor" },
  { id: "light", label: m.appearance_light(), icon: "lucide:sun" },
  { id: "dark", label: m.appearance_dark(), icon: "lucide:moon" },
]

const EFFECTS: { id: WindowEffect; label: string; icon: string }[] = [
  { id: "none", label: m.appearance_effect_none(), icon: "lucide:square" },
  { id: "acrylic", label: m.appearance_effect_acrylic(), icon: "lucide:droplet" },
  { id: "mica", label: m.appearance_effect_mica(), icon: "lucide:layers" },
]
</script>


<SettingRow icon="lucide:languages" title={m.appearance_language()}>
  <Segmented
    items={LANGUAGES}
    value={languageChoice()}
    onpick={chooseLanguage}
  />
</SettingRow>

<SettingRow icon="lucide:sun-moon" title={m.appearance_theme()}>
  <Segmented items={THEMES} value={settings.theme} onpick={settings.setTheme} />
</SettingRow>

<SettingRow icon="lucide:palette" title={m.appearance_accent()}>
  <div class="flex flex-wrap gap-2">
    {#each ACCENTS as accent (accent.id)}
      <button
        type="button"
        class={[
          "grid size-7 cursor-pointer place-items-center rounded-full",
          "ring-offset-2 ring-offset-base-100 transition",
          settings.accent === accent.id && "ring-2 ring-base-content/60",
        ]}
        style:background-color="oklch(62% 0.17 {accent.hue})"
        aria-label={accent.label}
        title={accent.label}
        aria-pressed={settings.accent === accent.id}
        onclick={() => settings.setAccent(accent.id)}
      >
        {#if settings.accent === accent.id}
          <Icon icon="lucide:check" class="size-4 text-white" />
        {/if}
      </button>
    {/each}
  </div>
</SettingRow>

<SettingRow
  icon="lucide:app-window"
  title={m.appearance_effect()}
  hint={desktop
    ? m.appearance_effect_hint()
    : m.appearance_effect_desktop_only()}
>
  {#if desktop}
    <Segmented
      items={EFFECTS}
      value={settings.effect}
      onpick={settings.setEffect}
    />
  {:else}
    <span class="badge badge-ghost whitespace-nowrap">{m.common_unsupported()}</span>
  {/if}
</SettingRow>
