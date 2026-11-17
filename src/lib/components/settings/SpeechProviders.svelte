<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import type { SpeechProvider, SpeechRole } from "#lib/store/local.svelte.ts"
import {
  activeSpeech,
  chooseSpeech,
  probeSpeech,
  removeSpeech,
  saveSpeech,
  speechIcon,
  speechProviders,
  speechTemplateOf,
  speechTemplates,
} from "#lib/store/speech.svelte.ts"

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

type Check =
  | { state: "idle" }
  | { state: "busy"; for: string }
  | { state: "ok"; for: string; models: string[] }
  | { state: "failed"; for: string; reason: string }

const CUSTOM = "custom"

const templates = $derived(speechTemplates().filter(t => t.role === role))

const choices = $derived([
  ...templates.map(t => ({ value: t.id, name: t.name })),
  { value: CUSTOM, name: m.gateway_custom() },
])

const attempt = new Attempt()

let draft = $state<Draft | null>(null)

let check = $state<Check>({ state: "idle" })

let armed = $state(false)

let revealed = $state(false)

const providers = $derived(speechProviders(role))

const active = $derived(activeSpeech(role))

const urlOf = (d: Draft) => d.baseURL.trim().replace(/\/+$/, "")

const signature = $derived(draft ? `${urlOf(draft)}\n${draft.key.trim()}` : "")

const current = $derived<Check>(
  check.state !== "idle" && check.for === signature ? check : { state: "idle" },
)

const template = $derived(templates.find(t => t.id === draft?.template))

const editableURL = $derived(!!draft && (draft.id !== null || !template?.baseURL))

const openai = $derived(draft?.kind === "openai")

const warned = $derived(armed && current.state !== "ok")

const blank = (): Draft => {
  const first = templates[0]

  return {
    id: null,
    template: first.id,
    kind: first.kind,
    name: first.name,
    baseURL: first.baseURL,
    key: "",
    model: first.model,
    voice: first.voice,
  }
}

const open = (next: Draft) => {
  draft = next
  check = { state: "idle" }
  armed = false
}

const edit = (p: SpeechProvider) =>
  open({
    id: p.id,
    template: speechTemplateOf(p)?.id ?? CUSTOM,
    kind: p.kind,
    name: p.name,
    baseURL: p.baseURL,
    key: p.key ?? "",
    model: p.model,
    voice: p.voice,
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

const verify = async () => {
  if (!draft || !urlOf(draft)) {
    return
  }

  const signed = signature

  check = { state: "busy", for: signed }

  try {
    const models = await probeSpeech({
      kind: draft.kind,
      baseURL: urlOf(draft),
      key: draft.key.trim() || null,
    })

    check = { state: "ok", for: signed, models }
  } catch (e) {
    check = {
      state: "failed",
      for: signed,
      reason: e instanceof Error ? e.message : String(e),
    }
  }
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
  if (current.state === "ok" || armed) {
    save()
  } else {
    armed = true
  }
}
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col">
    {#each providers as provider (provider.id)}
      <div
        class={[
          "-mx-2 rounded-field px-2 transition-colors duration-140",
          draft?.id === provider.id && "bg-primary/8 text-primary",
        ]}
      >
        <SettingRow icon={speechIcon(provider)} title={provider.name}>
          <div class="flex min-w-0 items-center justify-end gap-1">
            <span
              class="min-w-0 truncate text-sm text-base-content/60"
              title={provider.baseURL}
            >
              {provider.baseURL}
            </span>
            <button
              type="button"
              class={[
                "btn btn-sm shrink-0 font-normal",
                active?.id === provider.id ? "bg-primary/8 text-primary" : "btn-ghost",
              ]}
              aria-pressed={active?.id === provider.id}
              onclick={() => attempt.run(() => chooseSpeech(role, provider.id))}
            >
              {active?.id === provider.id ? m.speech_in_use() : m.speech_use()}
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
          </div>
        </SettingRow>
      </div>
    {/each}
    {#if !draft}
      <button
        type="button"
        class="btn btn-ghost btn-sm mt-2 self-start"
        onclick={() => open(blank())}
      >
        <Icon icon="lucide:plus" class="size-4" />
        {m.gateway_add()}
      </button>
    {/if}
  </div>

  {#if draft}
    <Section
      icon={draft.id ? "lucide:pencil" : "lucide:plus"}
      title={draft.id ? m.gateway_editing({ name: draft.name }) : m.gateway_add()}
    >
      {#snippet actions()}
        <IconButton
          icon="lucide:x"
          label={m.common_cancel()}
          onclick={() => {
            draft = null
          }}
        />
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
            choices={choices}
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
          <p class="truncate px-1 text-xs text-base-content/55" title={draft.baseURL}>
            {draft.baseURL}
          </p>
        {/if}
        {#if openai}
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
              onclick={() => {
                revealed = !revealed
              }}
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
        <div class="flex min-h-8 items-center gap-2 px-1 text-sm" aria-live="polite">
          {#if current.state === "busy"}
            <span class="loading loading-spinner loading-xs opacity-60"></span>
            <span class="text-base-content/60">{m.gateway_checking()}</span>
          {:else if current.state === "ok"}
            <Icon icon="lucide:circle-check" class="size-4 shrink-0 text-success" />
            <span class="min-w-0 flex-1 truncate text-success">
              {current.models.length
                ? m.speech_verified({ models: current.models.slice(0, 3).join(", ") })
                : m.speech_verified_plain()}
            </span>
          {:else if current.state === "failed"}
            <Icon icon="lucide:circle-alert" class="size-4 shrink-0 text-error" />
            <span class="min-w-0 flex-1 text-error">{current.reason}</span>
          {:else}
            <span class="min-w-0 flex-1 text-base-content/55">{m.speech_unchecked()}</span>
          {/if}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn btn-sm"
            disabled={current.state === "busy" || !draft.baseURL.trim()}
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
