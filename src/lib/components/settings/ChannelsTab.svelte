<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { connect, sessionOf } from "#lib/channels/relay.svelte.ts"
import {
  type Bot,
  channels,
  disconnectChannels,
  isOwnerId,
  liveOf,
  newBot,
  optionsOf,
  PROVIDERS,
  providerOf,
  removeBot,
  saveBot,
  setOptions,
  settleRequest,
} from "#lib/channels/store.svelte.ts"
import BotEditor from "#lib/components/bots/BotEditor.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import { messageOf } from "#lib/native.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"

const attempt = new Attempt()

const host = $derived(hostById(LOCAL))

const harnesses = $derived(
  (host?.state?.harnesses ?? []).filter(h => h.enabled),
)

let configuring = $state<string | null>(null)

const provider = $derived(providerOf(configuring ?? PROVIDERS[0].id))

const live = $derived(liveOf(provider.id))

let presence = $state<Record<string, boolean>>({})

const present = $derived(presence[provider.id] ?? false)

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

let editing = $state<Bot | null>(null)

const liveError = $derived(PROVIDERS.map(p => liveOf(p.id).error).find(Boolean))

const failure = $derived(attempt.failure ?? (liveError ? messageOf(liveError) : null))

$effect(() => {
  untrack(() =>
    attempt.run(async () => {
      for (const p of PROVIDERS) {
        presence[p.id] = await p.tokenPresent()
      }
    }),
  )
})

const nameOf = (id: string) => harnesses.find(h => h.id === id)?.name ?? id

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

const create = () => {
  editing = newBot("", harnesses[0]?.id ?? "", host?.state?.home ?? "")
}

const openMain = (bot: Bot) =>
  attempt.run(async () => {
    if (!host) {
      return
    }

    const id = await sessionOf(host, bot, null)

    nav.settingsOpen = false
    openConversation({ kind: "session", host: host.id, id })
  })

const togglePause = (bot: Bot) => saveBot({ ...bot, paused: !bot.paused })

const botTitle = (id: string) => channels.bots.find(b => b.id === id)?.name ?? id
</script>

{#snippet state(id: string)}
  {@const status = liveOf(id).status}
  <span class="flex items-center gap-1.5 text-xs whitespace-nowrap text-base-content/70">
    {#if status === "on"}
      <Icon icon="lucide:circle-check" class="size-3.5 text-success" />
      {m.channels_on()}
    {:else if status === "connecting"}
      <span class="loading loading-spinner loading-xs"></span>
      {m.channels_connecting()}
    {:else}
      <Icon icon="lucide:circle-dashed" class="size-3.5 text-base-content/50" />
      {m.channels_off()}
    {/if}
  </span>
{/snippet}

<ul class="flex flex-col gap-3">
  {#each PROVIDERS as p (p.id)}
    {@const status = liveOf(p.id).status}
    <li class="flex min-w-0 flex-col rounded-box border border-base-300 bg-base-100">
      <div class="flex min-w-0 items-center gap-3 px-4 py-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-field bg-base-200">
          <Icon icon={p.icon} class="size-5" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm font-semibold" title={liveOf(p.id).user ?? undefined}>{p.name}</span>
          {@render state(p.id)}
        </span>
        {#if status === "off"}
          <button type="button" class="btn btn-sm btn-primary" onclick={() => (configuring = p.id)}>
            <Icon icon="lucide:plus" class="size-4" />
            {m.common_connect()}
          </button>
        {:else}
          <button type="button" class="btn btn-sm" disabled={harnesses.length === 0} onclick={create}>
            <Icon icon="lucide:plus" class="size-4" />
            {m.bot_new()}
          </button>
          <IconButton icon="lucide:settings-2" label={m.channels_owner()} onclick={() => (configuring = p.id)} />
          <IconButton
            icon="lucide:unplug"
            label={m.channels_disconnect()}
            disabled={attempt.busy}
            onclick={() => attempt.run(() => disconnectChannels(p))}
          />
        {/if}
      </div>
      {#if status !== "off"}
        {#if channels.bots.length > 0}
          <ul class="flex flex-col px-2 pb-2">
            {#each channels.bots as bot (bot.id)}
              <li class="flex min-w-0 items-center gap-3 rounded-field px-2 py-1.5 hover:bg-base-content/5">
                <span
                  class={[
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    bot.paused ? "bg-base-content/10 text-base-content/50" : "bg-primary/15 text-primary",
                  ]}
                >
                  {[...bot.name][0]?.toUpperCase() ?? "?"}
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="truncate text-sm font-medium" title={bot.name}>{bot.name}</span>
                    {#if bot.paused}
                      <span class="badge badge-ghost badge-sm shrink-0">{m.bot_paused()}</span>
                    {/if}
                  </span>
                  <span class="flex min-w-0 items-center gap-2 text-xs text-base-content/60">
                    <span class="shrink-0">{nameOf(bot.harness)}</span>
                    <span class="min-w-0 truncate" title={bot.cwd}>{baseName(bot.cwd)}</span>
                    <span class="shrink-0 tabular-nums">
                      {m.bot_counts({ channels: bot.channels.length, members: bot.members.length })}
                    </span>
                  </span>
                </span>
                <IconButton icon="lucide:message-square" label={m.bot_main_chat()} onclick={() => openMain(bot)} />
                <IconButton
                  icon={bot.paused ? "lucide:play" : "lucide:pause"}
                  label={bot.paused ? m.bot_resume() : m.bot_pause()}
                  onclick={() => togglePause(bot)}
                />
                <IconButton icon="lucide:pencil" label={m.bot_edit()} onclick={() => (editing = $state.snapshot(bot))} />
                <ConfirmButton label={m.channels_remove()} onconfirm={() => removeBot(bot.id)} />
              </li>
            {/each}
          </ul>
        {/if}
        {#if channels.requests.length > 0}
          <ul class="flex flex-col px-2 pb-2">
            {#each channels.requests as request (`${request.bot}:${request.userId}`)}
              <li class="flex min-w-0 items-center gap-3 rounded-field px-2 py-1.5">
                <Icon icon="lucide:user-plus" class="size-4 shrink-0 text-base-content/60" />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-sm font-medium">{request.name}</span>
                  <span class="truncate text-xs text-base-content/60 tabular-nums">
                    {m.bot_request_detail({ bot: botTitle(request.bot), user: request.userId })}
                  </span>
                </span>
                <button type="button" class="btn btn-sm btn-primary" onclick={() => settleRequest(request, true)}>
                  {m.bot_grant()}
                </button>
                <button type="button" class="btn btn-sm btn-ghost" onclick={() => settleRequest(request, false)}>
                  {m.bot_decline()}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </li>
  {/each}
</ul>
<ErrorAlert message={failure} />
<BotEditor {host} bind:bot={editing} onsave={saveBot} />

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
      {@render state(provider.id)}
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
        bind:value={() => ownerId, v => setOptions(provider.id, { ownerId: v.trim() })}
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
  </div>
</Modal>
