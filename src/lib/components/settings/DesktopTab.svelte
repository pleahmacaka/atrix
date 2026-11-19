<script lang="ts">
import { tick } from "svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { editMode } from "#lib/desktop/native/dock.ts"
import { m } from "#lib/paraglide/messages.js"
import DesktopComponents from "./DesktopComponents.svelte"
import DesktopDock from "./DesktopDock.svelte"
import DesktopLauncher from "./DesktopLauncher.svelte"
import DesktopSection from "./DesktopSection.svelte"
import DesktopTray from "./DesktopTray.svelte"
import { desktopSettings, windows } from "./desktop.svelte.ts"

let root = $state<HTMLDivElement>()

const device = $derived(desktopSettings.device)

const launcher = $derived(desktopSettings.launcher)

const shell = $derived(
  windows && desktopSettings.components?.shell === true,
)

const ready = $derived(desktopSettings.components !== null && (!shell || device !== null))

$effect(() => {
  desktopSettings.load()
})

$effect(() => desktopSettings.watch())

$effect(() => {
  const id = desktopSettings.focus

  if (!id || !ready) {
    return
  }

  tick().then(() => {
    root?.querySelector(`[data-desktop-section="${id}"]`)?.scrollIntoView({ block: "start" })
    desktopSettings.focus = null
  })
})
</script>

<div bind:this={root} class="flex flex-col gap-6">
  <ErrorAlert message={desktopSettings.saving.failure} />
  <DesktopComponents />
  {#if shell && device && launcher}
    <DesktopDock {device} />
    <DesktopLauncher {device} {launcher} />
    {#if device.features.dock}
      <DesktopTray {device} />
    {/if}
    <DesktopSection id="experimental">
      <SettingRow title={m.desktop_edit_mode()}>
        <button
          type="button"
          class="btn btn-sm"
          disabled={!device.editMode}
          onclick={() => desktopSettings.saving.run(() => editMode(true))}
        >
          {m.desktop_edit_start()}
        </button>
        <input
          type="checkbox"
          class="toggle toggle-sm toggle-primary"
          aria-label={m.desktop_edit_mode()}
          checked={device.editMode}
          onchange={e => desktopSettings.setDevice("editMode", e.currentTarget.checked)}
        />
      </SettingRow>
    </DesktopSection>
  {/if}
</div>
