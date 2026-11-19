<script lang="ts">
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import {
    type DefaultApp,
    defaultAppStatus,
    openDefaultApps,
    setDefaultApp,
  } from "../../native"

  let {
    handler = $bindable({ supported: false, enabled: false }),
    windows = true,
  }: { handler?: DefaultApp; windows?: boolean } = $props()

  let known = $state(false)

  $effect(() => {
    defaultAppStatus()
      .then(status => {
        handler = status
        known = true
      })
      .catch(() => undefined)
  })

  const toggleDefault = async (toggle: HTMLInputElement) => {
    try {
      handler = await setDefaultApp(toggle.checked)
    } catch {
      toast(m.files_settings_default_app_unavailable(), "error")
    }

    toggle.checked = handler.enabled
  }
</script>

<SettingRow title={m.files_settings_default_app_label()}>
  {#if known && !handler.supported}
    <span class="badge badge-ghost whitespace-nowrap">
      {m.files_settings_default_app_unavailable()}
    </span>
  {/if}

  <input
    type="checkbox"
    class="toggle toggle-sm toggle-primary"
    aria-label={m.files_settings_default_app_label()}
    checked={handler.enabled}
    disabled={!handler.supported}
    onchange={e => toggleDefault(e.currentTarget)}
  />
</SettingRow>

{#if windows}
  <SettingRow title={m.files_settings_windows_defaults()}>
    <button
      type="button"
      class="btn btn-sm"
      disabled={!handler.supported}
      onclick={() =>
        openDefaultApps().catch(() =>
          toast(m.files_settings_default_app_unavailable(), "error"),
        )}
    >
      {m.files_open()}
    </button>
  </SettingRow>
{/if}
