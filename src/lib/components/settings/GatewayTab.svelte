<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
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

let armed = $state<string | null>(null)

const openRouter = $derived(findGateway(OPENROUTER_ID))

const custom = $derived(activeGateways().filter(g => g.id !== OPENROUTER_ID))

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
    draft = { ...EMPTY }
  })

const remove = (id: string) =>
  attempt.run(async () => {
    if (armed !== id) {
      armed = id

      return
    }

    armed = null
    await removeGateway(id)
  })
</script>

<SettingRow icon={GATEWAY_ICONS.openrouter} title={m.gateway_openrouter()}>
  {#if openRouter}
    <div class="flex items-center gap-2">
      <span class="flex items-center gap-2 text-sm whitespace-nowrap">
        <Icon icon="lucide:circle-check" class="size-4 text-success" />
        {m.openrouter_connected()}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.openrouter_disconnect()}
        title={m.openrouter_disconnect()}
        disabled={attempt.busy}
        onclick={() => attempt.run(() => removeGateway(OPENROUTER_ID))}
      >
        <Icon icon="lucide:log-out" class="size-4" />
      </button>
    </div>
  {:else}
    <button
      type="button"
      class="btn btn-primary btn-sm"
      disabled={attempt.busy}
      onclick={connect}
    >
      {#if attempt.busy}
        <span class="loading loading-spinner loading-xs"></span>
      {:else}
        <Icon icon="lucide:log-in" class="size-4" />
      {/if}
      {m.openrouter_connect()}
    </button>
  {/if}
</SettingRow>

{#each custom as gateway (gateway.id)}
  <SettingRow icon={GATEWAY_ICONS[gateway.kind]} title={gateway.name}>
    <div class="flex min-w-0 items-center gap-1">
      <span class="min-w-0 truncate text-sm text-base-content/60" title={gateway.baseURL}>
        {gateway.baseURL}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.gateway_edit()}
        title={m.gateway_edit()}
        onclick={() => edit(gateway)}
      >
        <Icon icon="lucide:pencil" class="size-4" />
      </button>
      <button
        type="button"
        class={[
          "btn btn-ghost btn-sm btn-square",
          armed === gateway.id && "text-error",
        ]}
        aria-label={armed === gateway.id
          ? m.common_confirm_delete()
          : m.common_delete()}
        title={armed === gateway.id
          ? m.common_confirm_delete()
          : m.common_delete()}
        onclick={() => remove(gateway.id)}
      >
        <Icon icon="lucide:trash-2" class="size-4" />
      </button>
    </div>
  </SettingRow>
{/each}

<form
  class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
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
    class="w-full"
    bind:value={draft.name}
  />
  <IconInput
    icon="lucide:link"
    label={m.gateway_url()}
    placeholder="https://api.example.com/v1"
    ghost={false}
    class="w-full"
    bind:value={draft.baseURL}
  />
  <IconInput
    icon="lucide:key-round"
    label={m.gateway_key()}
    placeholder={m.gateway_key()}
    type="password"
    autocomplete="off"
    ghost={false}
    class="w-full"
    bind:value={draft.key}
  />
  <div class="flex gap-2">
    <IconInput
      icon="lucide:cpu"
      label={m.gateway_model()}
      placeholder={m.gateway_model()}
      ghost={false}
      class="w-full"
      bind:value={draft.model}
    />
    {#if draft.id}
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.common_cancel()}
        title={m.common_cancel()}
        onclick={() => (draft = { ...EMPTY })}
      >
        <Icon icon="lucide:x" class="size-4" />
      </button>
    {/if}
    <button
      type="submit"
      class="btn btn-primary btn-sm btn-square"
      aria-label={draft.id ? m.gateway_save() : m.gateway_add()}
      title={draft.id ? m.gateway_save() : m.gateway_add()}
      disabled={attempt.busy || !draft.name.trim() || !draft.baseURL.trim()}
    >
      <Icon icon={draft.id ? "lucide:check" : "lucide:plus"} class="size-4" />
    </button>
  </div>
</form>
<ErrorAlert message={attempt.failure} />
