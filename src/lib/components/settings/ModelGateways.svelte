<script lang="ts">
import Icon from "@iconify/svelte"
import { slide } from "svelte/transition"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import { motion } from "#lib/components/ui/motion.ts"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import {
  activeGateways,
  CUSTOM_TEMPLATE,
  OPENROUTER_URL,
  TEMPLATES,
  type Template,
  templateOf,
} from "#lib/store/gatewayCatalog.ts"
import {
  gatewayIcon,
  modelIcon,
  modelIdsOf,
  probeGateway,
  removeGateway,
  saveGateway,
} from "#lib/store/gateways.svelte.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import { login } from "#lib/store/openrouter.ts"
import GatewayModels from "./GatewayModels.svelte"

type Draft = {
  id: string | null
  template: string
  name: string
  baseURL: string
  key: string
  model: string
}

type Check =
  | { state: "idle" }
  | { state: "busy"; for: string }
  | { state: "ok"; for: string; models: string[] }
  | { state: "failed"; for: string; reason: string }

const CHOICES: Template[] = [
  ...TEMPLATES,
  { id: CUSTOM_TEMPLATE, name: m.gateway_custom(), icon: "lucide:server", baseURL: "" },
]

const blank = (): Draft => ({
  id: null,
  template: CUSTOM_TEMPLATE,
  name: "",
  baseURL: "",
  key: "",
  model: "",
})

const attempt = new Attempt()

let draft = $state<Draft | null>(null)

let check = $state<Check>({ state: "idle" })

let armed = $state(false)

let revealed = $state(false)

let browsing = $state<string | null>(null)

const gateways = $derived(activeGateways())

const urlOf = (d: Draft) => d.baseURL.trim().replace(/\/+$/, "")

const signature = $derived(draft ? `${urlOf(draft)}\n${draft.key.trim()}` : "")

const current = $derived<Check>(
  check.state !== "idle" && check.for === signature ? check : { state: "idle" },
)

const template = $derived(CHOICES.find(t => t.id === draft?.template))

const editableURL = $derived(!!draft && (draft.id !== null || draft.template === CUSTOM_TEMPLATE))

const warned = $derived(armed && current.state !== "ok")

const open = (next: Draft) => {
  draft = next
  check = { state: "idle" }
  armed = false
}

const edit = (gateway: Gateway) =>
  open({
    id: gateway.id,
    template: templateOf(gateway.baseURL)?.id ?? CUSTOM_TEMPLATE,
    name: gateway.name,
    baseURL: gateway.baseURL,
    key: gateway.key ?? "",
    model: gateway.model,
  })

const choose = (id: string) => {
  const picked = CHOICES.find(t => t.id === id)

  if (draft && picked) {
    draft.template = id
    draft.name = id === CUSTOM_TEMPLATE ? "" : picked.name
    draft.baseURL = picked.baseURL
    armed = false
  }
}

const verify = async () => {
  if (!draft || !urlOf(draft)) {
    return
  }

  const signed = signature

  check = { state: "busy", for: signed }

  try {
    const models = await probeGateway(urlOf(draft), draft.key.trim() || null)

    check = { state: "ok", for: signed, models }
  } catch (e) {
    check = {
      state: "failed",
      for: signed,
      reason: e instanceof Error ? e.message : String(e),
    }
  }
}

const signIn = () =>
  attempt.run(async () => {
    const key = await login()

    if (key && draft) {
      draft.key = key
      await verify()
    }
  })

const save = () =>
  attempt.run(async () => {
    if (!draft) {
      return
    }

    const baseURL = urlOf(draft)

    await saveGateway({
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      kind: baseURL === OPENROUTER_URL ? "openrouter" : "openai",
      baseURL,
      key: draft.key.trim() || null,
      model: draft.model.trim(),
    })
    draft = null
  })

const submit = () => {
  if (current.state === "ok" || armed) {
    save()
  } else {
    armed = true
  }
}

const remove = (id: string) =>
  attempt.run(async () => {
    if (draft?.id === id) {
      draft = null
    }

    await removeGateway(id)
  })
</script>

{#snippet editor(d: NonNullable<typeof draft>)}
  <div
    transition:slide={{ duration: motion(140) }}
    class="mt-1 mb-3 rounded-box border border-base-300 p-4"
  >
    <Section
      icon={d.id ? "lucide:pencil" : "lucide:plus"}
      title={d.id ? m.gateway_editing({ name: d.name }) : m.gateway_add()}
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
            value={d.template}
            choices={CHOICES.map(t => ({ value: t.id, name: t.name }))}
            onchange={choose}
          />
          <IconInput
            icon="lucide:tag"
            label={m.gateway_name()}
            placeholder={m.gateway_name()}
            ghost={false}
            bind:value={d.name}
          />
        </div>
        {#if editableURL}
          <IconInput
            icon="lucide:link"
            label={m.gateway_url()}
            placeholder={m.gateway_url()}
            ghost={false}
            bind:value={d.baseURL}
            onblur={verify}
          />
        {:else}
          <p class="truncate px-1 text-xs text-base-content/55" title={d.baseURL}>
            {d.baseURL}
          </p>
        {/if}
        <div class="flex min-w-0 items-center gap-2">
          <IconInput
            icon="lucide:key-round"
            label={m.gateway_key()}
            placeholder={m.gateway_key()}
            type={revealed ? "text" : "password"}
            autocomplete="off"
            ghost={false}
            class="w-full min-w-0 flex-1"
            bind:value={d.key}
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
          {#if template?.oauth}
            <button
              type="button"
              class="btn btn-ghost btn-sm shrink-0"
              disabled={attempt.busy}
              onclick={signIn}
            >
              <Icon icon="lucide:log-in" class="size-4" />
              {m.gateway_sign_in()}
            </button>
          {/if}
        </div>
        {#if current.state === "ok" && current.models.length > 0}
          <IconSelect
            icon="lucide:cpu"
            label={m.gateway_model()}
            ghost={false}
            value={d.model}
            choices={current.models.map(id => ({ value: id, name: id, icon: modelIcon(id) }))}
            onchange={id => {
              d.model = id
            }}
          />
        {:else}
          <IconInput
            icon="lucide:cpu"
            label={m.gateway_model()}
            placeholder={m.gateway_model()}
            ghost={false}
            bind:value={d.model}
          />
        {/if}
        <div class="flex min-h-8 items-center gap-2 px-1 text-sm" aria-live="polite">
          {#if current.state === "busy"}
            <span class="loading loading-spinner loading-xs opacity-60"></span>
            <span class="text-base-content/60">{m.gateway_checking()}</span>
          {:else if current.state === "ok"}
            <Icon icon="lucide:circle-check" class="size-4 shrink-0 text-success" />
            <span class="min-w-0 flex-1 text-success">
              {m.gateway_verified({ count: current.models.length })}
            </span>
          {:else if current.state === "failed"}
            <Icon icon="lucide:circle-alert" class="size-4 shrink-0 text-error" />
            <span class="min-w-0 flex-1 text-error">{current.reason}</span>
          {:else}
            <span class="min-w-0 flex-1 text-base-content/55">{m.gateway_unchecked()}</span>
          {/if}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="btn btn-sm"
            disabled={current.state === "busy" || !d.baseURL.trim()}
            onclick={verify}
          >
            <Icon icon="lucide:plug-zap" class="size-4" />
            {m.gateway_probe()}
          </button>
          <button
            type="submit"
            class={["btn btn-sm", warned ? "btn-warning" : "btn-primary"]}
            title={warned ? m.gateway_unverified() : undefined}
            disabled={attempt.busy || !d.name.trim() || !d.baseURL.trim()}
          >
            <Icon
              icon={warned ? "lucide:triangle-alert" : "lucide:check"}
              class="size-4"
            />
            {warned ? m.gateway_save_anyway() : d.id ? m.gateway_save() : m.gateway_add()}
          </button>
        </div>
      </form>
    </Section>
  </div>
{/snippet}

<div class="flex flex-col">
  {#each gateways as gateway (gateway.id)}
    <div
      class={[
        "-mx-2 rounded-field px-2 transition-colors duration-140",
        draft?.id === gateway.id && "bg-primary/8 text-primary",
      ]}
    >
      <SettingRow icon={gatewayIcon(gateway)} title={gateway.name}>
        <div class="flex min-w-0 items-center justify-end gap-1">
          <span
            class="min-w-0 truncate text-sm text-base-content/60"
            title={gateway.baseURL}
          >
            {gateway.baseURL}
          </span>
          <IconButton
            icon="lucide:list"
            label={m.gateway_models()}
            aria-pressed={browsing === gateway.id}
            onclick={() => {
              browsing = browsing === gateway.id ? null : gateway.id
            }}
          />
          <IconButton
            icon="lucide:pencil"
            label={m.gateway_edit()}
            aria-pressed={draft?.id === gateway.id}
            onclick={() => edit(gateway)}
          />
          <ConfirmButton
            label={m.common_delete()}
            disabled={attempt.busy}
            onconfirm={() => remove(gateway.id)}
          />
        </div>
      </SettingRow>
      {#if browsing === gateway.id}
        <div transition:slide={{ duration: motion(140) }}>
          {#await modelIdsOf(gateway)}
            <span class="loading loading-spinner loading-sm my-2 opacity-60"></span>
          {:then ids}
            <GatewayModels
              {ids}
              enabled={gateway.models}
              class="mb-3"
              ontoggle={models =>
                attempt.run(() => saveGateway({ ...gateway, models }))}
            />
          {/await}
        </div>
      {/if}
    </div>
    {#if draft?.id === gateway.id}
      {@render editor(draft)}
    {/if}
  {/each}
  {#if draft && !draft.id}
    {@render editor(draft)}
  {/if}
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
<ErrorAlert message={attempt.failure} />
