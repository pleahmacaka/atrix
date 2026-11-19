<script lang="ts">
import Section from "#lib/components/ui/Section.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { CHAT_WIDTH, chatWidth, setChatWidth } from "#lib/store/chatWidth.svelte.ts"
import { chooseLanguage, LANGUAGES, languageChoice } from "#lib/store/locale.ts"
import {
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
} from "#lib/store/settings.svelte.ts"
import AccentPicker from "./AccentPicker.svelte"
import SteppedSetting from "./SteppedSetting.svelte"
import WindowEffect from "./WindowEffect.svelte"

let { client = true }: { client?: boolean } = $props()

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: m.appearance_system() },
  { id: "light", label: m.appearance_light() },
  { id: "dark", label: m.appearance_dark() },
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

<div class="flex flex-col gap-6">
  <Section>
    <SettingRow title={m.appearance_language()} tip={m.appearance_language_tip()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.appearance_language()}
        options={LANGUAGES.map(l => ({ value: l.id, label: l.label }))}
        value={languageChoice()}
        onchange={chooseLanguage}
      />
    </SettingRow>
    <SettingRow title={m.appearance_theme()} tip={m.appearance_theme_tip()}>
      <Segmented label={m.appearance_theme()} items={THEMES} value={settings.theme} onpick={settings.setTheme} />
    </SettingRow>
    <SettingRow title={m.appearance_accent()} tip={m.appearance_accent_tip()}>
      <AccentPicker />
    </SettingRow>
    <SettingRow title={m.appearance_layout()} tip={m.appearance_layout_tip()}>
      <Segmented label={m.appearance_layout()} items={LAYOUTS} value={settings.layout} onpick={settings.setLayout} />
    </SettingRow>
    <SettingRow title={m.appearance_shape()} tip={m.appearance_shape_tip()}>
      <Segmented label={m.appearance_shape()} items={SHAPES} value={settings.shape} onpick={settings.setShape} />
    </SettingRow>
    {#if client}
      <SettingRow title={m.appearance_sidebar()} tip={m.appearance_sidebar_tip()}>
        <Segmented
          label={m.appearance_sidebar()}
          items={SIDEBAR_MODES}
          value={settings.sidebarCollapse}
          onpick={settings.setSidebarCollapse}
        />
      </SettingRow>
    {/if}
    <SettingRow title={m.appearance_texture()} tip={m.appearance_texture_tip()}>
      <Segmented label={m.appearance_texture()} items={TEXTURES} value={settings.texture} onpick={settings.setTexture} />
    </SettingRow>
    {#if desktop}
      <SettingRow title={m.appearance_window()} tip={m.appearance_window_tip()}>
        <WindowEffect />
      </SettingRow>
    {/if}
    {#if client}
      <SettingRow title={m.appearance_ring()} tip={m.appearance_ring_tip()}>
        <Segmented label={m.appearance_ring()} items={RINGS} value={settings.usageRing} onpick={settings.setUsageRing} />
      </SettingRow>
    {/if}
  </Section>

  <Section title={m.appearance_fonts()}>
    <SteppedSetting title={m.appearance_scale()} tip={m.appearance_scale_tip()} value={settings.scale} range={SCALE} onchange={settings.setScale} unit="%" />
    <SteppedSetting
      title={m.appearance_content_scale()}
      tip={m.appearance_content_scale_tip()}
      value={settings.contentScale}
      range={CONTENT_SCALE}
      onchange={settings.setContentScale}
      unit="%"
    />
    {#if client}
      <SteppedSetting
        title={m.chat_width()}
        tip={m.chat_width_tip()}
        value={chatWidth()}
        range={CHAT_WIDTH}
        onchange={setChatWidth}
        unit="rem"
      />
    {/if}
    <SettingRow title={m.appearance_interface_font()} tip={m.appearance_interface_font_tip()}>
      <input
        class="input input-sm w-56 max-sm:w-full"
        aria-label={m.appearance_interface_font()}
        placeholder="Pretendard"
        autocomplete="off"
        spellcheck="false"
        value={settings.interfaceFont}
        onchange={e => settings.setInterfaceFont(e.currentTarget.value.trim())}
      />
    </SettingRow>
    {#if desktop}
      <SettingRow title={m.appearance_terminal_font()} tip={m.appearance_terminal_font_tip()}>
        <input
          class="input input-sm w-56 max-sm:w-full"
          aria-label={m.appearance_terminal_font()}
          placeholder={TERMINAL_FONT}
          autocomplete="off"
          spellcheck="false"
          value={settings.terminalFont}
          onchange={e => settings.setTerminalFont(e.currentTarget.value.trim())}
        />
      </SettingRow>
      <SteppedSetting
        title={m.appearance_terminal_size()}
        tip={m.appearance_terminal_size_tip()}
        value={settings.terminalSize}
        range={TERMINAL_SIZE}
        onchange={settings.setTerminalSize}
      />
      <SteppedSetting
        title={m.appearance_terminal_weight()}
        tip={m.appearance_terminal_weight_tip()}
        value={settings.terminalWeight}
        range={TERMINAL_WEIGHT}
        onchange={settings.setTerminalWeight}
      />
      <SteppedSetting
        title={m.appearance_terminal_scroll()}
        tip={m.appearance_terminal_scroll_tip()}
        value={settings.terminalScroll}
        range={TERMINAL_SCROLL}
        onchange={settings.setTerminalScroll}
        unit="%"
      />
    {/if}
  </Section>
</div>