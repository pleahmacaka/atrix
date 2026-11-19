<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import DesktopSection from "./DesktopSection.svelte"
import { desktopSettings, windows } from "./desktop.svelte.ts"
import ToggleRow from "./ToggleRow.svelte"

const components = $derived(desktopSettings.components)

const device = $derived(desktopSettings.device)
</script>

{#if components}
  <DesktopSection id="components">
    {#snippet actions()}
      <button
        type="button"
        class={[
          "btn btn-primary btn-sm",
          !desktopSettings.restartPending && "invisible",
        ]}
        disabled={desktopSettings.saving.busy}
        onclick={desktopSettings.restart}
      >
        <Icon icon="lucide:rotate-cw" class="size-4" />
        {m.update_restart()}
      </button>
    {/snippet}
    {#if windows}
      <ToggleRow
        title={m.desktop_component_agent()}
        checked={components.agent}
        disabled={!components.shell}
        onchange={on => desktopSettings.setComponent("agent", on)}
      />
      <ToggleRow
        title={m.desktop_component_shell()}
        checked={components.shell}
        disabled={!components.agent}
        onchange={on => desktopSettings.setComponent("shell", on)}
      />
    {/if}
    <ToggleRow
      title={m.desktop_component_files()}
      checked={components.files}
      onchange={on => desktopSettings.setComponent("files", on)}
    />
    <ToggleRow
      title={m.desktop_component_terminal()}
      checked={components.terminal}
      onchange={on => desktopSettings.setComponent("terminal", on)}
    />
    {#if windows && components.shell && device}
      <ToggleRow
        title={m.desktop_autostart()}
        checked={device.autostart}
        onchange={on => desktopSettings.setDevice("autostart", on)}
      />
    {/if}
  </DesktopSection>
{/if}
