<script lang="ts">
import Icon from "@iconify/svelte"
import { connect } from "#lib/channels/relay.svelte.ts"
import {
  disconnectChannels,
  isOwnerId,
  liveOf,
  optionsOf,
  PROVIDERS,
  providerOf,
  setOptions,
} from "#lib/channels/store.svelte.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import { m } from "#lib/paraglide/messages.js"
import ChannelStatus from "./ChannelStatus.svelte"

let {
  configuring = $bindable(),
  presence,
}: {
  configuring: string | null
  presence: Record<string, boolean>
} = $props()

const attempt = new Attempt()

const provider = $derived(providerOf(configuring ?? PROVIDERS[0].id))

const live = $derived(liveOf(provider.id))

const present = $derived(presence[provider.id] ?? false)

const ownerId = $derived(optionsOf(provider.id).ownerId)

let token = $state("")

let botName = $state<string | null>(null)

let ownerName = $state<string | null>(null)

$effect(() => {
  const current = provider
  const id = ownerId

  botName = null
  ownerName = null

  if (!present) {
    return
  }

  current.botName().then(
    name => {
      if (current === provider) {
        botName = name
      }
    },
    () => {},
  )

  if (isOwnerId(id)) {
    current.userName(id).then(
      name => {
        if (current === provider && id === ownerId) {
          ownerName = name
        }
      },
      () => {},
    )
  }
})

const save = () =>
  attempt.run(async () => {
    await provider.setToken(token)
    token = ""
    presence[provider.id] = true
  })

const clear = () =>
  attempt.run(async () => {
    await disconnectChannels(provider)
    await provider.clearToken()
    presence[provider.id] = false
  })

const start = () =>
  attempt.run(async () => {
    await connect(provider)
    configuring = null
  })
</script>

<Modal
  bind:open={
    () => configuring !== null,
    open => {
      if (!open) {
        configuring = null
      }
    }
  }
  label={provider.name}
  class="max-w-md"
>
  <div class="flex flex-col gap-4 p-5">
    <h2 class="flex items-center gap-2 text-base font-semibold">
      <Icon icon={provider.icon} class="size-5" />
      <span class="min-w-0 flex-1 truncate">{provider.name}</span>
      <ChannelStatus provider={provider.id} />
    </h2>
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-base-content/60">{m.channels_token()}</span>
      {#if present}
        <span class="flex min-h-8 items-center gap-2 text-sm">
          <Icon icon="lucide:circle-check" class="size-4 text-success" />
          <span class="min-w-0 flex-1 truncate">{botName ?? m.channels_token_saved()}</span>
          <ConfirmButton label={m.channels_token_clear()} disabled={attempt.busy} onconfirm={clear} />
        </span>
      {:else}
        <form
          class="flex items-center gap-2"
          onsubmit={e => {
            e.preventDefault()
            save()
          }}
        >
          <IconInput
            icon="lucide:key-round"
            label={m.channels_token()}
            type="password"
            autocomplete="off"
            ghost={false}
            class="min-w-0 flex-1"
            bind:value={token}
          />
          <IconButton
            type="submit"
            icon="lucide:check"
            label={m.channels_token_save()}
            tone="primary"
            disabled={attempt.busy || !token.trim()}
          />
        </form>
      {/if}
    </div>
    <div class="flex flex-col gap-1.5">
      <span class="flex items-center gap-1.5 text-xs font-medium text-base-content/60">
        {m.channels_owner()}
        {#if ownerName}
          <Icon icon="lucide:circle-check" class="size-3.5 text-success" />
          <span class="text-base-content/80">{ownerName}</span>
        {/if}
      </span>
      <IconInput
        icon="lucide:at-sign"
        label={m.channels_owner()}
        disabled={live.status !== "off"}
        inputmode="numeric"
        autocomplete="off"
        ghost={false}
        class={["w-full tabular-nums", (present || ownerId) && !isOwnerId(ownerId) && "input-error"]}
        bind:value={() => ownerId, value => setOptions(provider.id, { ownerId: value.trim() })}
      />
    </div>
    <div class="flex justify-end gap-2">
      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (configuring = null)}>
        {m.common_cancel()}
      </button>
      {#if live.status === "off"}
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={attempt.busy || !present || !isOwnerId(ownerId)}
          onclick={start}
        >
          <Icon icon="lucide:plug" class="size-4" />
          {m.common_connect()}
        </button>
      {/if}
    </div>
    <ErrorAlert message={attempt.failure} />
  </div>
</Modal>