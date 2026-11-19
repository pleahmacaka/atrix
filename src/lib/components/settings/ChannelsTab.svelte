<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { connect } from "#lib/channels/relay.svelte.ts"
import {
  channels,
  disconnectChannels,
  isOwnerId,
  liveOf,
  optionsOf,
  PROVIDERS,
  providerOf,
  saveChannels,
  setOptions,
} from "#lib/channels/store.svelte.ts"
import FolderPicker from "#lib/components/shell/FolderPicker.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { messageOf } from "#lib/native.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"

const attempt = new Attempt()

const host = $derived(hostById(LOCAL))

const harnesses = $derived(
  (host?.state?.harnesses ?? []).filter(h => h.enabled),
)

let picked = $state(PROVIDERS[0].id)

const provider = $derived(providerOf(picked))

const live = $derived(liveOf(provider.id))

let present = $state(false)

let token = $state("")

let botName = $state<string | null>(null)

let ownerName = $state<string | null>(null)

$effect(() => {
  const current = provider

  if (!present) {
    botName = null

    return
  }

  current.botName().then(
    name => {
      if (current === provider) {
        botName = name
      }
    },
    () => {
      if (current === provider) {
        botName = null
      }
    },
  )
})

$effect(() => {
  const current = provider
  const id = ownerId

  ownerName = null

  if (!present || !isOwnerId(id)) {
    return
  }

  current.userName(id).then(
    name => {
      if (id === ownerId) {
        ownerName = name
      }
    },
    () => {},
  )
})

const ownerId = $derived(optionsOf(provider.id).ownerId)

let draft = $state({ channel: "", harness: "", cwd: "" })

const harness = $derived(draft.harness || harnesses[0]?.id || "")

const failure = $derived(
  attempt.failure ?? (live.error ? messageOf(live.error) : null),
)

$effect(() => {
  const current = provider

  untrack(() =>
    attempt.run(async () => {
      present = await current.tokenPresent()
    }),
  )
})

const nameOf = (id: string) => harnesses.find(h => h.id === id)?.name ?? id

const save = () =>
  attempt.run(async () => {
    await provider.setToken(token)
    token = ""
    present = true
  })

const clear = () =>
  attempt.run(async () => {
    await disconnectChannels(provider)
    await provider.clearToken()
    present = false
  })

const add = () => {
  const channel = draft.channel.trim()

  if (!channel || !harness || !draft.cwd) {
    return
  }

  channels.bindings = [
    ...channels.bindings.filter(
      b => b.provider !== provider.id || b.channel !== channel,
    ),
    { provider: provider.id, channel, harness, cwd: draft.cwd, sessionId: null },
  ]
  saveChannels()
  draft.channel = ""
}

const remove = (providerId: string, channel: string) => {
  channels.bindings = channels.bindings.filter(
    b => b.provider !== providerId || b.channel !== channel,
  )
  saveChannels()
}
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col">
    <SettingRow title={m.channels_provider()}>
      <IconSelect
        icon={provider.icon}
        label={m.channels_provider()}
        value={provider.id}
        choices={PROVIDERS.map(p => ({ value: p.id, name: p.name, icon: p.icon }))}
        onchange={value => {
          picked = value
        }}
      />
    </SettingRow>

    <SettingRow title={m.channels_token()}>
      {#if present}
        <div class="flex items-center justify-end gap-2">
          <span class="flex items-center gap-2 text-sm whitespace-nowrap">
            <Icon icon="lucide:circle-check" class="size-4 text-success" />
            {botName ?? m.channels_token_saved()}
          </span>
          <ConfirmButton
            label={m.channels_token_clear()}
            disabled={attempt.busy}
            onconfirm={clear}
          />
        </div>
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
            class="w-56 max-sm:w-auto max-sm:flex-1"
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
    </SettingRow>

    <SettingRow icon={provider.icon} title={provider.name}>
      <div class="flex items-center justify-end gap-2">
        <span
          class="flex items-center gap-2 text-sm whitespace-nowrap"
          title={live.user ?? undefined}
        >
          {#if live.status === "on"}
            <Icon icon="lucide:circle-check" class="size-4 text-success" />
            {m.channels_on()}
          {:else if live.status === "connecting"}
            <span class="loading loading-spinner loading-xs"></span>
            {m.channels_connecting()}
          {:else}
            <Icon
              icon="lucide:circle-dashed"
              class="size-4 text-base-content/50"
            />
            {m.channels_off()}
          {/if}
        </span>
        {#if live.status === "off"}
          <IconButton
            icon="lucide:plug"
            label={m.common_connect()}
            disabled={attempt.busy || !present || !isOwnerId(ownerId)}
            onclick={() => attempt.run(() => connect(provider))}
          />
        {:else}
          <IconButton
            icon="lucide:unplug"
            label={m.channels_disconnect()}
            disabled={attempt.busy}
            onclick={() => attempt.run(() => disconnectChannels(provider))}
          />
        {/if}
      </div>
    </SettingRow>

    <SettingRow title={m.channels_owner()}>
      <IconInput
        icon="lucide:at-sign"
        label={m.channels_owner()}
        disabled={live.status !== "off"}
        inputmode="numeric"
        autocomplete="off"
        ghost={false}
        class={[
          "w-56 tabular-nums max-sm:w-auto max-sm:flex-1",
          (present || ownerId) && !isOwnerId(ownerId) && "input-error",
        ]}
        bind:value={() => ownerId, v => setOptions(provider.id, { ownerId: v.trim() })}
      />
      {#if ownerName}
        <span class="flex items-center gap-1.5 text-sm whitespace-nowrap">
          <Icon icon="lucide:circle-check" class="size-4 text-success" />
          {ownerName}
        </span>
      {/if}
    </SettingRow>
  </div>

  <Section icon="lucide:hash" title={m.channels_bindings()}>
    <ul class="flex flex-col">
      {#each channels.bindings as binding (`${binding.provider}:${binding.channel}`)}
        {@const owner = providerOf(binding.provider)}
        <li class="flex items-center gap-3 py-2">
          <span
            class="grid size-8 shrink-0 place-items-center rounded-field bg-inset"
            title={owner.name}
          >
            <Icon icon={owner.icon} class="size-4 text-base-content/70" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span
              class="truncate text-sm font-medium tabular-nums"
              title={binding.channel}
            >
              {binding.channel}
            </span>
            <span class="flex min-w-0 items-center gap-2">
              <span class="badge badge-ghost badge-sm whitespace-nowrap">
                {nameOf(binding.harness)}
              </span>
              <span
                class="min-w-0 truncate text-xs text-base-content/60"
                title={binding.cwd}
              >
                {baseName(binding.cwd)}
              </span>
            </span>
          </div>
          <ConfirmButton
            label={m.channels_remove()}
            onconfirm={() => remove(binding.provider, binding.channel)}
          />
        </li>
      {/each}
    </ul>
    <form
      class="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2"
      onsubmit={e => {
        e.preventDefault()
        add()
      }}
    >
      <IconInput
        icon={provider.channelIcon}
        label={m.channels_provider_channel_id({ provider: provider.name })}
        placeholder={m.channels_provider_channel_id({ provider: provider.name })}
        inputmode={provider.numericChannel ? "numeric" : "text"}
        ghost={false}
        bind:value={draft.channel}
      />
      <IconSelect
        icon="lucide:boxes"
        label={m.channels_harness()}
        ghost={false}
        class="w-auto max-w-none"
        value={harness}
        choices={harnesses.map(h => ({ value: h.id, name: h.name }))}
        onchange={value => {
          draft.harness = value
        }}
      />
      <div class="flex min-w-0 items-center">
        <FolderPicker {host} bind:value={draft.cwd} />
      </div>
      <div class="flex justify-end">
        <IconButton
          type="submit"
          icon="lucide:plus"
          label={m.channels_add()}
          tone="primary"
          disabled={!draft.channel.trim() || !harness || !draft.cwd}
        />
      </div>
    </form>
  </Section>
</div>
<ErrorAlert message={failure} />
