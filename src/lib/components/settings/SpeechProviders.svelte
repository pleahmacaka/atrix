<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import Section from "#lib/components/ui/Section.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { SpeechProvider, SpeechRole } from "#lib/store/local.svelte.ts"
import {
  activeSpeech,
  chooseSpeech,
  probeSpeech,
  removeSpeech,
  type SpeechTemplate,
  saveSpeech,
  speechIcon,
  speechProviders,
  speechTemplateOf,
  speechTemplates,
} from "#lib/store/speech.svelte.ts"
import AddButton from "./AddButton.svelte"
import GatewayCheck from "./GatewayCheck.svelte"
import ProviderListRow from "./ProviderListRow.svelte"
import { ProbeState } from "./probeState.svelte.ts"
import SettingCard from "./SettingCard.svelte"

let { role }: { role: SpeechRole } = $props()

type Draft = {
  id: string | null
  template: string
  kind: SpeechProvider["kind"]
  name: string
  baseURL: string
  key: string
  model: string
  voice: string
}

const CUSTOM = "custom"

const attempt = new Attempt()

const templates = $derived(speechTemplates().filter(t => t.role === role))

const choices = $derived([
  ...templates.map(t => ({ value: t.id, name: t.name })),
  { value: CUSTOM, name: m.gateway_custom() },
])

const providers = $derived(speechProviders(role))

const active = $derived(activeSpeech(role))

let draft = $state<Draft | null>(null)

let armed = $state(false)

let revealed = $state(false)

const urlOf = (d: Draft) => d.baseURL.trim().replace(/\/+$/, "")

const probe = new ProbeState(() => (draft ? `${urlOf(draft)}\n${draft.key.trim()}` : ""))

const template = $derived(templates.find(t => t.id === draft?.template))

const editableURL = $derived(!!draft && (draft.id !== null || !template?.baseURL))

const verified = $derived(probe.current.state === "ok")

const warned = $derived(armed && !verified)

const fromTemplate = ({ id, kind, name, baseURL, model, voice }: SpeechTemplate): Draft => ({
  id: null,
  template: id,
  kind,
  name,
  baseURL,
  key: "",
  model,
  voice,
})

const choose = (id: string) => {
  if (!draft) {
    return
  }

  const picked = templates.find(t => t.id === id)

  draft.template = id
  draft.kind = picked?.kind ?? "openai"
  draft.name = picked?.name ?? ""
  draft.baseURL = picked?.baseURL ?? ""
  draft.model = picked?.model ?? ""
  draft.voice = picked?.voice ?? ""
  armed = false
}

const edit = (provider: SpeechProvider) => {
  draft = {
    id: provider.id,
    template: speechTemplateOf(provider)?.id ?? CUSTOM,
    kind: provider.kind,
    name: provider.name,
    baseURL: provider.baseURL,
    key: provider.key ?? "",
    model: provider.model,
    voice: provider.voice,
  }
  armed = false
}

const verify = () => {
  const current = draft

  if (!current || !urlOf(current)) {
    return
  }

  return probe.verify(() =>
    probeSpeech({ kind: current.kind, baseURL: urlOf(current), key: current.key.trim() || null }),
  )
}

const save = () =>
  attempt.run(async () => {
    if (!draft) {
      return
    }

    const id = draft.id ?? crypto.randomUUID()

    await saveSpeech({
      id,
      role,
      kind: draft.kind,
      name: draft.name.trim(),
      baseURL: urlOf(draft),
      key: draft.key.trim() || null,
      model: draft.model.trim(),
      voice: draft.voice.trim(),
    })

    if (!active) {
      await chooseSpeech(role, id)
    }

    draft = null
  })

const submit = () => {
  if (verified || armed) {
    save()
  } else {
    armed = true
  }
}
</script>

<div class="flex flex-col gap-6">
  <SettingCard>
    {#each providers as provider (provider.id)}
      {@const current = active?.id === provider.id}
      <ProviderListRow
        icon={speechIcon(provider)}
        name={provider.name}
        url={provider.baseURL}
        editing={draft?.id === provider.id}
      >
        <button
          type="button"
          class={["btn btn-sm shrink-0 font-normal", current ? "bg-primary/8 text-primary" : "btn-ghost"]}
          aria-pressed={current}
          onclick={() => attempt.run(() => chooseSpeech(role, provider.id))}
        >
          {current ? m.speech_in_use() : m.speech_use()}
        </button>
        <IconButton
          icon="lucide:pencil"
          label={m.gateway_edit()}
          aria-pressed={draft?.id === provider.id}
          onclick={() => edit(provider)}
        />
        <ConfirmButton
          label={m.common_delete()}
          disabled={attempt.busy}
          onconfirm={() => attempt.run(() => removeSpeech(provider.id))}
        />
      </ProviderListRow>
    {/each}
    {#if !draft}
      <AddButton label={m.gateway_add()} onclick={() => (draft = fromTemplate(templates[0]))} />
    {/if}
  </SettingCard>

  {#if draft}
    <Section
      icon={draft.id ? "lucide:pencil" : "lucide:plus"}
      title={draft.id ? m.gateway_editing({ name: draft.name }) : m.gateway_add()}
    >
      {#snippet actions()}
        <IconButton icon="lucide:x" label={m.common_cancel()} onclick={() => (draft = null)} />
      {/snippet}
      <form
        class="flex flex-col gap-2 py-2"
        onsubmit={e => {
          e.preventDefault()
          submit()
        }}
      >
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <IconSelect
            icon={template?.icon ?? "lucide:server"}
            label={m.gateway_provider()}
            ghost={false}
            class="w-full"
            value={draft.template}
            {choices}
            onchange={choose}
          />
          <IconInput
            icon="lucide:tag"
            label={m.gateway_name()}
            placeholder={m.gateway_name()}
            ghost={false}
            bind:value={draft.name}
          />
        </div>
        {#if editableURL}
          <IconInput
            icon="lucide:link"
            label={m.gateway_url()}
            placeholder={m.gateway_url()}
            ghost={false}
            bind:value={draft.baseURL}
            onblur={verify}
          />
        {:else}
          <p class="truncate px-1 text-xs text-base-content/55" title={draft.baseURL}>{draft.baseURL}</p>
        {/if}
        {#if draft.kind === "openai"}
          <div class="flex min-w-0 items-center gap-2">
            <IconInput
              icon="lucide:key-round"
              label={m.gateway_key()}
              placeholder={m.gateway_key()}
              type={revealed ? "text" : "password"}
              autocomplete="off"
              ghost={false}
              class="w-full min-w-0 flex-1"
              bind:value={draft.key}
              onblur={verify}
            />
            <IconButton
              icon={revealed ? "lucide:eye-off" : "lucide:eye"}
              label={revealed ? m.gateway_key_hide() : m.gateway_key_show()}
              aria-pressed={revealed}
              class="shrink-0"
              onclick={() => (revealed = !revealed)}
            />
          </div>
          <div class={["grid grid-cols-1 gap-2", role === "tts" && "sm:grid-cols-2"]}>
            <IconInput
              icon="lucide:cpu"
              label={m.gateway_model()}
              placeholder={m.gateway_model()}
              ghost={false}
              bind:value={draft.model}
            />
            {#if role === "tts"}
              <IconInput
                icon="lucide:mic-vocal"
                label={m.speech_voice()}
                placeholder={m.speech_voice()}
                ghost={false}
                bind:value={draft.voice}
              />
            {/if}
          </div>
        {/if}
        {#if probe.current.state === "ok"}
          <GatewayCheck
            check={probe.current}
            done={probe.current.models.length
              ? m.speech_verified({ models: probe.current.models.slice(0, 3).join(", ") })
              : m.speech_verified_plain()}
          />
        {:else}
          <GatewayCheck check={probe.current} done="" idle={m.speech_unchecked()} />
        {/if}
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn btn-sm"
            disabled={probe.current.state === "busy" || !draft.baseURL.trim()}
            onclick={verify}
          >
            <Icon icon="lucide:plug-zap" class="size-4" />
            {m.gateway_probe()}
          </button>
          <button
            type="submit"
            class={["btn btn-sm", warned ? "btn-warning" : "btn-primary"]}
            title={warned ? m.gateway_unverified() : undefined}
            disabled={attempt.busy || !draft.name.trim() || !draft.baseURL.trim()}
          >
            <Icon icon={warned ? "lucide:triangle-alert" : "lucide:check"} class="size-4" />
            {warned ? m.gateway_save_anyway() : draft.id ? m.gateway_save() : m.gateway_add()}
          </button>
        </div>
      </form>
    </Section>
  {/if}
</div>
<ErrorAlert message={attempt.failure} />