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
  <DesktopSection id="components" title={m.desktop_product_de()}>
    {#if windows}
      <ToggleRow
        title={m.desktop_component_shell()}
        tip={components.agent
          ? m.desktop_component_shell_tip()
          : m.desktop_component_keep_one_tip()}
        checked={components.shell}
        disabled={!components.agent}
        onchange={on => desktopSettings.setComponent("shell", on)}
      />
    {/if}
    <ToggleRow
      title={m.desktop_component_files()}
      tip={m.desktop_component_files_tip()}
      checked={components.files}
      onchange={on => desktopSettings.setComponent("files", on)}
    />
    <ToggleRow
      title={m.desktop_component_terminal()}
      tip={m.desktop_component_terminal_tip()}
      checked={components.terminal}
      onchange={on => desktopSettings.setComponent("terminal", on)}
    />
    {#if windows && components.shell && device}
      <ToggleRow
        title={m.desktop_autostart()}
        tip={m.desktop_autostart_tip()}
        checked={device.autostart}
        onchange={on => desktopSettings.setDevice("autostart", on)}
      />
    {/if}
  </DesktopSection>
  <DesktopSection title={m.desktop_product_ai()}>
    <ToggleRow
      title={m.desktop_component_agent()}
      tip={!windows
        ? m.desktop_component_agent_required_tip()
        : components.shell
          ? m.desktop_component_agent_tip()
          : m.desktop_component_keep_one_tip()}
      checked={components.agent}
      disabled={!windows || !components.shell}
      onchange={on => desktopSettings.setComponent("agent", on)}
    />
  </DesktopSection>
  {#if desktopSettings.restartPending}
    <div role="status" class="alert alert-info alert-soft text-sm">
      <Icon icon="lucide:rotate-cw" class="size-4 shrink-0" />
      <span class="min-w-0 flex-1">{m.desktop_restart_pending()}</span>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled={desktopSettings.saving.busy}
        onclick={desktopSettings.restart}
      >
        {m.update_restart()}
      </button>
    </div>
  {/if}
{/if}
