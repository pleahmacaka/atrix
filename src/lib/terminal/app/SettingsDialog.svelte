<script lang="ts">
import SteppedSetting from "#lib/components/settings/SteppedSetting.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import Section from "#lib/components/ui/Section.svelte"
import Select from "#lib/components/ui/Select.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import {
  settings,
  TERMINAL_FONT,
  TERMINAL_SCROLL,
  TERMINAL_SIZE,
  TERMINAL_WEIGHT,
} from "#lib/store/settings.svelte.ts"
import { shellIcon } from "../shell-icons"
import { prefs } from "./prefs.svelte"
import { defaultShell, session } from "./tabs.svelte"

const shells = $derived(
  session.shells.map(shell => ({
    value: shell.id,
    label: shell.name,
    icon: shellIcon(shell.id),
  })),
)
</script>

<Modal
  bind:open={session.settingsOpen}
  label={m.terminal_settings_title()}
  class="w-full max-w-xl"
>
  <div class="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
    <header class="flex items-center gap-2">
      <h2 class="min-w-0 flex-1 truncate text-base font-semibold">
        {m.terminal_settings_title()}
      </h2>
      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        onclick={() => (session.settingsOpen = false)}
      />
    </header>

    <Section title={m.terminal()}>
      <SettingRow title={m.terminal_settings_shell()}>
        <Select
          label={m.terminal_settings_shell()}
          options={shells}
          value={defaultShell(prefs.shell)}
          onchange={shell => (prefs.shell = shell)}
          class="w-56"
        />
      </SettingRow>
    </Section>

    <Section title={m.terminal_settings_font()}>
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
      <SteppedSetting
        title={m.appearance_terminal_size()}
        value={settings.terminalSize}
        range={TERMINAL_SIZE}
        onchange={settings.setTerminalSize}
      />
      <SteppedSetting
        title={m.appearance_terminal_weight()}
        value={settings.terminalWeight}
        range={TERMINAL_WEIGHT}
        onchange={settings.setTerminalWeight}
      />
      <SteppedSetting
        title={m.appearance_terminal_scroll()}
        value={settings.terminalScroll}
        range={TERMINAL_SCROLL}
        onchange={settings.setTerminalScroll}
        unit="%"
      />
    </Section>
  </div>
</Modal>
