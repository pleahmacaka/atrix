<script lang="ts">
import Icon from "@iconify/svelte"
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import Stepper from "#lib/components/ui/Stepper.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { CHAT_WIDTH, chatWidth, setChatWidth } from "#lib/store/chatWidth.svelte.ts"
import { chooseLanguage, LANGUAGES, languageChoice } from "#lib/store/locale.ts"
import {
  ACCENTS,
  type Bounds,
  CONTENT_SCALE,
  type Layout,
  type PanelShape,
  SCALE,
  type SidebarCollapse,
  settings,
  TERMINAL_FONT,
  TERMINAL_SCROLL,
  TERMINAL_SIZE,
  TERMINAL_WEIGHT,
  type Texture,
  type Theme,
  type UsageRing,
  type WindowEffect,
} from "#lib/store/settings.svelte.ts"

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: m.appearance_system() },
  { id: "light", label: m.appearance_light() },
  { id: "dark", label: m.appearance_dark() },
]

const EFFECTS: { id: WindowEffect; label: string }[] = [
  { id: "none", label: m.appearance_effect_none() },
  { id: "glass", label: m.appearance_effect_glass() },
]

const LAYOUTS: { id: Layout; label: string }[] = [
  { id: "flat", label: m.appearance_layout_flat() },
  { id: "island", label: m.appearance_layout_island() },
]

const SHAPES: { id: PanelShape; label: string }[] = [
  { id: "rounded", label: m.appearance_shape_rounded() },
  { id: "square", label: m.appearance_shape_square() },
]

const SIDEBAR_MODES: { id: SidebarCollapse; label: string }[] = [
  { id: "compact", label: m.appearance_sidebar_compact() },
  { id: "hidden", label: m.appearance_sidebar_hidden() },
]

const RINGS: { id: UsageRing; label: string }[] = [
  { id: "both", label: m.appearance_ring_both() },
  { id: "context", label: m.appearance_ring_context() },
  { id: "week", label: m.appearance_ring_week() },
]

const TEXTURES: { id: Texture; label: string }[] = [
  { id: "none", label: m.appearance_texture_none() },
  { id: "soft", label: m.appearance_texture_soft() },
  { id: "strong", label: m.appearance_texture_strong() },
]
</script>

{#snippet stepped(
  title: string,
  value: number,
  range: Bounds,
  onchange: (value: number) => void,
  unit = "",
)}
  <SettingRow {title}>
    <Stepper label={title} {value} {range} {unit} {onchange} />
    <button
      type="button"
      class="btn btn-sm"
      disabled={value === range.base}
      onclick={() => onchange(range.base)}
    >
      {m.common_reset()}
    </button>
  </SettingRow>
{/snippet}

<div class="flex flex-col gap-6">
  <Section>
    <SettingRow title={m.appearance_language()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.appearance_language()}
        options={LANGUAGES.map(l => ({ value: l.id, label: l.label }))}
        value={languageChoice()}
        onchange={chooseLanguage}
      />
    </SettingRow>

    <SettingRow title={m.appearance_theme()}>
      <Segmented label={m.appearance_theme()} items={THEMES} value={settings.theme} onpick={settings.setTheme} />
    </SettingRow>

    <SettingRow title={m.appearance_accent()}>
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

    <SettingRow title={m.appearance_layout()}>
      <Segmented label={m.appearance_layout()} items={LAYOUTS} value={settings.layout} onpick={settings.setLayout} />
    </SettingRow>

    <SettingRow title={m.appearance_shape()}>
      <Segmented label={m.appearance_shape()} items={SHAPES} value={settings.shape} onpick={settings.setShape} />
    </SettingRow>

    <SettingRow title={m.appearance_sidebar()}>
      <Segmented
        label={m.appearance_sidebar()}
        items={SIDEBAR_MODES}
        value={settings.sidebarCollapse}
        onpick={settings.setSidebarCollapse}
      />
    </SettingRow>

    <SettingRow title={m.appearance_texture()}>
      <Segmented label={m.appearance_texture()} items={TEXTURES} value={settings.texture} onpick={settings.setTexture} />
    </SettingRow>

    {#if desktop}
      <SettingRow title={m.appearance_window()}>
        <div class="flex flex-col items-end gap-3 max-sm:w-full max-sm:items-stretch">
          <Segmented
            label={m.appearance_window()}
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
            {m.appearance_transparency()}
            <input
              type="range"
              class="range range-primary range-xs w-32 max-sm:w-auto max-sm:flex-1"
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

    <SettingRow title={m.appearance_ring()}>
      <Segmented label={m.appearance_ring()} items={RINGS} value={settings.usageRing} onpick={settings.setUsageRing} />
    </SettingRow>
  </Section>

  <Section title={m.appearance_fonts()}>
      {@render stepped(m.appearance_scale(), settings.scale, SCALE, settings.setScale, "%")}

      {@render stepped(m.appearance_content_scale(), settings.contentScale, CONTENT_SCALE, settings.setContentScale, "%")}

      {@render stepped(m.chat_width(), chatWidth(), CHAT_WIDTH, setChatWidth, "rem")}

      <SettingRow title={m.appearance_interface_font()}>
        <input
          class="input input-sm w-56"
          aria-label={m.appearance_interface_font()}
          placeholder="Pretendard"
          autocomplete="off"
          spellcheck="false"
          value={settings.interfaceFont}
          onchange={e => settings.setInterfaceFont(e.currentTarget.value.trim())}
        />
      </SettingRow>

      {#if desktop}
        <SettingRow title={m.appearance_terminal_font()}>
          <input
            class="input input-sm w-56"
            aria-label={m.appearance_terminal_font()}
            placeholder={TERMINAL_FONT}
            autocomplete="off"
            spellcheck="false"
            value={settings.terminalFont}
            onchange={e => settings.setTerminalFont(e.currentTarget.value.trim())}
          />
        </SettingRow>

        {@render stepped(m.appearance_terminal_size(), settings.terminalSize, TERMINAL_SIZE, settings.setTerminalSize)}

        {@render stepped(m.appearance_terminal_weight(), settings.terminalWeight, TERMINAL_WEIGHT, settings.setTerminalWeight)}

        {@render stepped(m.appearance_terminal_scroll(), settings.terminalScroll, TERMINAL_SCROLL, settings.setTerminalScroll, "%")}
      {/if}
  </Section>
</div>
