<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { m } from "#lib/paraglide/messages.js"
import {
  activeGateways,
  connectOpenRouter,
  findGateway,
  GATEWAY_ICONS,
  OPENROUTER_ID,
  OPENROUTER_URL,
  removeGateway,
  saveGateway,
} from "#lib/store/gateways.svelte.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"
import { login } from "#lib/store/openrouter.ts"

type Draft = {
  id: string | null
  name: string
  baseURL: string
  key: string
  model: string
}

const EMPTY: Draft = { id: null, name: "", baseURL: "", key: "", model: "" }

const attempt = new Attempt()

let draft = $state<Draft>({ ...EMPTY })

const openRouter = $derived(findGateway(OPENROUTER_ID))

const custom = $derived(activeGateways().filter(g => g.id !== OPENROUTER_ID))

const editing = $derived(custom.find(g => g.id === draft.id) ?? null)

const connect = () =>
  attempt.run(async () => {
    const key = await login()

    if (key) {
      await connectOpenRouter(key)
    }
  })

const edit = (gateway: Gateway) => {
  draft = {
    id: gateway.id,
    name: gateway.name,
    baseURL: gateway.baseURL,
    key: gateway.key ?? "",
    model: gateway.model,
  }
}

const reset = () => {
  draft = { ...EMPTY }
}

const save = () =>
  attempt.run(async () => {
    const baseURL = draft.baseURL.trim().replace(/\/+$/, "")

    if (!draft.name.trim() || !baseURL) {
      return
    }

    await saveGateway({
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      kind: baseURL === OPENROUTER_URL ? "openrouter" : "openai",
      baseURL,
      key: draft.key.trim() || null,
      model: draft.model.trim(),
    })
    reset()
  })

const remove = (id: string) =>
  attempt.run(async () => {
    if (draft.id === id) {
      reset()
    }

    await removeGateway(id)
  })
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col">
    <SettingRow icon={GATEWAY_ICONS.openrouter} title={m.gateway_openrouter()}>
      {#if openRouter}
        <div class="flex items-center justify-end gap-2">
          <span class="flex items-center gap-2 text-sm whitespace-nowrap">
            <Icon icon="lucide:circle-check" class="size-4 text-success" />
            {m.openrouter_connected()}
          </span>
          <IconButton
            icon="lucide:log-out"
            label={m.openrouter_disconnect()}
            disabled={attempt.busy}
            onclick={() => attempt.run(() => removeGateway(OPENROUTER_ID))}
          />
        </div>
      {:else}
        <IconButton
          icon="lucide:log-in"
          label={m.openrouter_connect()}
          tone="primary"
          busy={attempt.busy}
          disabled={attempt.busy}
          onclick={connect}
        />
      {/if}
    </SettingRow>

    {#each custom as gateway (gateway.id)}
      <div
        class={[
          "-mx-2 rounded-field px-2 transition-colors duration-150",
          draft.id === gateway.id && "bg-primary/8 text-primary",
        ]}
      >
        <SettingRow icon={GATEWAY_ICONS[gateway.kind]} title={gateway.name}>
          <div class="flex min-w-0 items-center justify-end gap-1">
            <span
              class="min-w-0 truncate text-sm text-base-content/60"
              title={gateway.baseURL}
            >
              {gateway.baseURL}
            </span>
            <IconButton
              icon="lucide:pencil"
              label={m.gateway_edit()}
              aria-pressed={draft.id === gateway.id}
              onclick={() => edit(gateway)}
            />
            <ConfirmButton
              label={m.common_delete()}
              disabled={attempt.busy}
              onconfirm={() => remove(gateway.id)}
            />
          </div>
        </SettingRow>
      </div>
    {/each}
  </div>

  <Section
    icon={editing ? "lucide:pencil" : "lucide:plus"}
    title={editing ? m.gateway_editing({ name: editing.name }) : m.gateway_add()}
  >
    {#snippet actions()}
      {#if editing}
        <IconButton icon="lucide:x" label={m.common_cancel()} onclick={reset} />
      {/if}
    {/snippet}
    <form
      class="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2"
      onsubmit={e => {
        e.preventDefault()
        save()
      }}
    >
      <IconInput
        icon="lucide:tag"
        label={m.gateway_name()}
        placeholder={m.gateway_name()}
        ghost={false}
        bind:value={draft.name}
      />
      <IconInput
        icon="lucide:link"
        label={m.gateway_url()}
        placeholder={m.gateway_url()}
        ghost={false}
        bind:value={draft.baseURL}
      />
      <IconInput
        icon="lucide:key-round"
        label={m.gateway_key()}
        placeholder={m.gateway_key()}
        type="password"
        autocomplete="off"
        ghost={false}
        bind:value={draft.key}
      />
      <IconInput
        icon="lucide:cpu"
        label={m.gateway_model()}
        placeholder={m.gateway_model()}
        ghost={false}
        bind:value={draft.model}
      />
      <div class="flex justify-end sm:col-span-2">
        <IconButton
          type="submit"
          icon={editing ? "lucide:check" : "lucide:plus"}
          label={editing ? m.gateway_save() : m.gateway_add()}
          tone="primary"
          disabled={attempt.busy || !draft.name.trim() || !draft.baseURL.trim()}
        />
      </div>
    </form>
  </Section>
</div>
<ErrorAlert message={attempt.failure} />
