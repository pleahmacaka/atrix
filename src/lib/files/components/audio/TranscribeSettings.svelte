<script lang="ts">
  import Section from "#lib/components/ui/Section.svelte"
  import Select from "#lib/components/ui/Select.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { currentLocale } from "#lib/store/locale.ts"
  import {
    clearKey,
    type KeyStatus,
    keyStatus,
    type Provider,
    saveKey,
  } from "./audio"
  import { LANGUAGES, MODELS, transcribeSettings } from "./transcribe.svelte"

  const PROVIDERS: { value: Provider; label: () => string }[] = [
    { value: "groq", label: m.files_audio_providers_groq },
    { value: "openai", label: m.files_audio_providers_openai },
    { value: "custom", label: m.files_audio_providers_custom },
  ]

  let status = $state<KeyStatus>({ saved: false, base: null })
  let key = $state("")
  let base = $state("")
  let busy = $state(false)

  const languages = $derived.by(() => {
    const names = new Intl.DisplayNames([currentLocale()], { type: "language" })

    return LANGUAGES.map(code => ({
      value: code,
      label: code
        ? (names.of(code) ?? code)
        : m.files_audio_settings_auto(),
    }))
  })

  const models = $derived(
    MODELS[transcribeSettings.provider].map(model => ({
      value: model,
      label: model,
    })),
  )

  $effect(() => {
    const provider = transcribeSettings.provider

    key = ""
    keyStatus(provider)
      .then(next => {
        status = next
        base = next.base ?? ""
      })
      .catch(() => undefined)
  })

  const pickProvider = (provider: Provider) => {
    transcribeSettings.provider = provider
    transcribeSettings.model = MODELS[provider][0] ?? ""
  }

  const store = async () => {
    busy = true

    try {
      status = await saveKey(
        transcribeSettings.provider,
        key,
        transcribeSettings.provider === "custom" ? base : null,
      )
      key = ""
    } catch (reason) {
      toast(
        String(reason) === "badUrl"
          ? m.files_audio_settings_bad_url()
          : m.files_audio_settings_save_failed(),
        "error",
      )
    } finally {
      busy = false
    }
  }

  const forget = async () => {
    await clearKey(transcribeSettings.provider).catch(() => undefined)
    status = { saved: false, base: null }
  }
</script>

<Section>
  <SettingRow title={m.files_audio_settings_provider()}>
    <Select
      class="w-44 max-sm:w-full"
      label={m.files_audio_settings_provider()}
      options={PROVIDERS.map(provider => ({
        value: provider.value,
        label: provider.label(),
      }))}
      value={transcribeSettings.provider}
      onchange={pickProvider}
    />
  </SettingRow>

  {#if transcribeSettings.provider === "custom"}
    <SettingRow title={m.files_audio_settings_base_url()}>
      <input
        class="input input-sm w-64 max-sm:w-full"
        type="url"
        placeholder="https://"
        aria-label={m.files_audio_settings_base_url()}
        bind:value={base}
      />
    </SettingRow>
  {/if}

  <SettingRow title={m.files_audio_settings_model()}>
    {#if models.length > 0}
      <Select
        class="w-56 max-sm:w-full"
        label={m.files_audio_settings_model()}
        options={models}
        bind:value={transcribeSettings.model}
      />
    {:else}
      <input
        class="input input-sm w-56 max-sm:w-full"
        aria-label={m.files_audio_settings_model()}
        spellcheck="false"
        bind:value={transcribeSettings.model}
      />
    {/if}
  </SettingRow>

  <SettingRow title={m.files_audio_settings_language()}>
    <Select
      class="w-44 max-sm:w-full"
      label={m.files_audio_settings_language()}
      options={languages}
      bind:value={transcribeSettings.language}
    />
  </SettingRow>

  <SettingRow title={m.files_audio_settings_api_key()}>
    <span
      class={[
        "badge whitespace-nowrap",
        status.saved ? "badge-success badge-soft" : "badge-ghost",
      ]}
    >
      {status.saved
        ? m.files_audio_settings_key_saved()
        : m.files_audio_settings_key_missing()}
    </span>

    <input
      class="input input-sm w-48 max-sm:w-full"
      type="password"
      autocomplete="off"
      spellcheck="false"
      aria-label={m.files_audio_settings_api_key()}
      bind:value={key}
    />

    <button
      type="button"
      class="btn btn-sm btn-primary"
      disabled={!key.trim() || busy}
      onclick={store}
    >
      {m.files_audio_settings_save_key()}
    </button>

    {#if status.saved}
      <button type="button" class="btn btn-sm btn-ghost" onclick={forget}>
        {m.files_audio_settings_clear_key()}
      </button>
    {/if}
  </SettingRow>
</Section>
