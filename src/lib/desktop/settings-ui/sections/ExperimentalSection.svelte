<script lang="ts">
  import { type DeviceSettings, defaultDevice } from "@atrix/settings"
  import { Row, Section } from "@atrix/ui"
  import { t } from "svelte-i18n"
  import { startEdit } from "#lib/desktop/edit/index.js"
  import { reset } from "../reset"

  let { device = $bindable() }: { device: DeviceSettings } = $props()

  const resetRow = reset(() => device, defaultDevice)
</script>

<Section
  title={$t("settings.groups.experimental.title")}
  description={$t("settings.groups.experimental.description")}
>
  <Row
    label={$t("settings.rows.editMode")}
    hint={$t("settings.hints.editMode")}
    onreset={resetRow("editMode")}
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        disabled={!device.editMode}
        onclick={startEdit}
      >
        {$t("settings.dock.openEditMode")}
      </button>

      <input
        type="checkbox"
        class="toggle toggle-primary"
        aria-label={$t("settings.rows.editMode")}
        bind:checked={device.editMode}
      />
    </div>
  </Row>
</Section>
