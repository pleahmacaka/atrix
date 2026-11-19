<script lang="ts">
  import { Row } from "@atrix/ui"
  import { t } from "svelte-i18n"
  import {
    type FilesDefault,
    filesDefault,
    openAtrixFiles,
    openFilesDefaults,
  } from "#lib/native/files.js"

  let { launch = true }: { launch?: boolean } = $props()

  let files = $state<FilesDefault>({ supported: false, enabled: false })
  let busy = $state(false)

  $effect(() => {
    filesDefault()
      .then(next => {
        files = next
      })
      .catch(() => undefined)
  })

  const toggle = async (enable: boolean) => {
    busy = true
    files = await filesDefault(enable).catch(() => files)
    busy = false
  }
</script>

{#if launch}
  <Row label={$t("settings.rows.atrixFiles")} hint={$t("settings.hints.atrixFiles")}>
    <button
      type="button"
      class="btn btn-soft btn-sm"
      disabled={!files.supported}
      onclick={() => openAtrixFiles().catch(() => undefined)}
    >
      {$t("common.open")}
    </button>
  </Row>
{/if}

<Row
  label={$t("settings.rows.filesDefault")}
  hint={files.supported ? $t("settings.hints.filesDefault") : $t("settings.hints.filesMissing")}
>
  <input
    type="checkbox"
    class="toggle toggle-primary"
    aria-label={$t("settings.rows.filesDefault")}
    checked={files.enabled}
    disabled={!files.supported || busy}
    onchange={e => toggle(e.currentTarget.checked)}
  />
</Row>

<Row
  label={$t("settings.rows.filesDefaultApps")}
  hint={$t("settings.hints.filesDefaultApps")}
>
  <button
    type="button"
    class="btn btn-soft btn-sm"
    disabled={!files.supported}
    onclick={() => openFilesDefaults().catch(() => undefined)}
  >
    {$t("common.open")}
  </button>
</Row>
