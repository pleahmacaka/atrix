<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { sessionOf } from "#lib/channels/relay.svelte.ts"
import { type Bot, channels, disconnectChannels, liveOf, newBot, PROVIDERS, saveBot } from "#lib/channels/store.svelte.ts"
import BotEditor from "#lib/components/bots/BotEditor.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { messageOf } from "#lib/native.ts"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import BotList from "./BotList.svelte"
import ChannelDialog from "./ChannelDialog.svelte"
import ChannelStatus from "./ChannelStatus.svelte"
import RequestList from "./RequestList.svelte"

const attempt = new Attempt()

const host = $derived(hostById(LOCAL))

const harnesses = $derived((host?.state?.harnesses ?? []).filter(h => h.enabled))

const liveError = $derived(PROVIDERS.map(p => liveOf(p.id).error).find(Boolean))

const failure = $derived(attempt.failure ?? (liveError ? messageOf(liveError) : null))

let configuring = $state<string | null>(null)

let editing = $state<Bot | null>(null)

let presence = $state<Record<string, boolean>>({})

$effect(() => {
  untrack(() =>
    attempt.run(async () => {
      for (const provider of PROVIDERS) {
        presence[provider.id] = await provider.tokenPresent()
      }
    }),
  )
})

const nameOf = (id: string) => harnesses.find(h => h.id === id)?.name ?? id

const botTitle = (id: string) => channels.bots.find(b => b.id === id)?.name ?? id

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
</script>

<ul class="flex flex-col gap-3">
  {#each PROVIDERS as provider (provider.id)}
    {@const status = liveOf(provider.id).status}
    <li class="flex min-w-0 flex-col rounded-box border border-base-300 bg-base-100">
      <div class="flex min-w-0 items-center gap-3 px-4 py-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-field bg-base-200">
          <Icon icon={provider.icon} class="size-5" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm font-semibold" title={liveOf(provider.id).user ?? undefined}>
            {provider.name}
          </span>
          <ChannelStatus provider={provider.id} />
        </span>
        {#if status === "off"}
          <button type="button" class="btn btn-sm btn-primary" onclick={() => (configuring = provider.id)}>
            <Icon icon="lucide:plus" class="size-4" />
            {m.common_connect()}
          </button>
        {:else}
          <button type="button" class="btn btn-sm" disabled={harnesses.length === 0} onclick={create}>
            <Icon icon="lucide:plus" class="size-4" />
            {m.bot_new()}
          </button>
          <IconButton
            icon="lucide:settings-2"
            label={m.channels_owner()}
            onclick={() => (configuring = provider.id)}
          />
          <IconButton
            icon="lucide:unplug"
            label={m.channels_disconnect()}
            disabled={attempt.busy}
            onclick={() => attempt.run(() => disconnectChannels(provider))}
          />
        {/if}
      </div>
      {#if status !== "off"}
        <BotList {nameOf} onchat={openMain} onedit={bot => (editing = $state.snapshot(bot))} />
        <RequestList {botTitle} />
      {/if}
    </li>
  {/each}
</ul>
<ErrorAlert message={failure} />
<BotEditor {host} bind:bot={editing} onsave={saveBot} />
<ChannelDialog {configuring} {presence} />