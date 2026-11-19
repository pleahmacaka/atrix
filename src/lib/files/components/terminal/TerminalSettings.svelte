<script lang="ts">
  import Section from "#lib/components/ui/Section.svelte"
  import Segmented from "#lib/components/ui/Segmented.svelte"
  import Select from "#lib/components/ui/Select.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { defaultShell, loadShells, session } from "#lib/terminal/index.ts"
  import {
    fallbackManager,
    loadManagers,
    managers,
    type TerminalPosition,
    terminal,
    terminalPrefs,
  } from "../../store/terminal.svelte"

  const POSITIONS: { id: TerminalPosition; label: string }[] = [
    { id: "bottom", label: m.files_terminal_settings_bottom() },
    { id: "side", label: m.files_terminal_settings_side() },
  ]

  $effect(() => {
    loadShells()
    loadManagers()
  })

  const place = (position: TerminalPosition) => {
    terminalPrefs.position = position
    terminal.position = null
  }
</script>

<Section>
  <SettingRow title={m.files_terminal_settings_position()}>
    <Segmented
      label={m.files_terminal_settings_position()}
      items={POSITIONS}
      value={terminalPrefs.position}
      onpick={place}
    />
  </SettingRow>

  <SettingRow title={m.files_terminal_settings_shell()}>
    <Select
      class="w-44 max-sm:w-full"
      label={m.files_terminal_settings_shell()}
      options={session.shells.map(shell => ({
        value: shell.id,
        label: shell.name,
      }))}
      value={defaultShell(terminalPrefs.shell)}
      onchange={id => (terminalPrefs.shell = id)}
    />
  </SettingRow>

  {#if managers.installed.length > 0}
    <SettingRow title={m.files_scripts_manager()}>
      <Select
        class="w-44 max-sm:w-full"
        label={m.files_scripts_manager()}
        options={managers.installed.map(name => ({ value: name, label: name }))}
        value={fallbackManager()}
        onchange={name => (terminalPrefs.packageManager = name)}
      />
    </SettingRow>
  {/if}
</Section>
