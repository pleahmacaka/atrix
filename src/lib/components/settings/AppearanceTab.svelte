<script lang="ts">
import Icon from "@iconify/svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { chooseLanguage, LANGUAGES, languageChoice } from "#lib/store/locale.ts"
import {
  ACCENTS,
  type PanelShape,
  settings,
  type Texture,
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
  { id: "glass", label: m.appearance_effect_glass(), icon: "lucide:droplet" },
]

const SHAPES: { id: PanelShape; label: string; icon: string }[] = [
  { id: "rounded", label: m.appearance_shape_rounded(), icon: "lucide:squircle" },
  { id: "square", label: m.appearance_shape_square(), icon: "lucide:square" },
]

const TEXTURES: { id: Texture; label: string; icon: string }[] = [
  { id: "none", label: m.appearance_texture_none(), icon: "lucide:square" },
  { id: "soft", label: m.appearance_texture_soft(), icon: "lucide:sparkle" },
  { id: "strong", label: m.appearance_texture_strong(), icon: "lucide:sparkles" },
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

<SettingRow icon="lucide:layout-panel-left" title={m.appearance_shape()}>
  <Segmented items={SHAPES} value={settings.shape} onpick={settings.setShape} />
</SettingRow>

<SettingRow icon="lucide:grip" title={m.appearance_texture()}>
  <Segmented items={TEXTURES} value={settings.texture} onpick={settings.setTexture} />
</SettingRow>

{#if desktop}
  <SettingRow icon="lucide:app-window" title={m.appearance_window()}>
    <div class="flex flex-col items-end gap-3">
      <Segmented
        items={EFFECTS}
        value={settings.effect}
        onpick={settings.setEffect}
      />
      <label
        class={[
          "flex items-center gap-3 text-sm transition-opacity",
          settings.effect === "none" && "opacity-40",
        ]}
      >
        <Icon icon="lucide:blend" class="size-4 text-base-content/60" />
        {m.appearance_transparency()}
        <input
          type="range"
          class="range range-primary range-xs w-32"
          min="0"
          max="85"
          step="5"
          disabled={settings.effect === "none"}
          value={settings.transparency}
          oninput={e => settings.setTransparency(Number(e.currentTarget.value))}
        />
        <span class="w-10 text-end tabular-nums">{settings.transparency}%</span>
      </label>
    </div>
  </SettingRow>
{/if}
