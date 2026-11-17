<script lang="ts">
import Icon from "@iconify/svelte"
import { connect } from "#lib/channels/relay.svelte.ts"
import {
  channels,
  clearToken,
  disconnectChannels,
  saveChannels,
  setToken,
  tokenPresent,
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

let present = $state(false)

let token = $state("")

let draft = $state({ channel: "", harness: "", cwd: "" })

const harness = $derived(draft.harness || harnesses[0]?.id || "")

const failure = $derived(
  attempt.failure ?? (channels.error ? messageOf(channels.error) : null),
)

attempt.run(async () => {
  present = await tokenPresent()
})

const nameOf = (id: string) => harnesses.find(h => h.id === id)?.name ?? id

const save = () =>
  attempt.run(async () => {
    await setToken(token)
    token = ""
    present = true
  })

const clear = () =>
  attempt.run(async () => {
    await disconnectChannels()
    await clearToken()
    present = false
  })

const add = () => {
  const id = draft.channel.trim()

  if (!id || !harness || !draft.cwd) {
    return
  }

  channels.bindings = [
    ...channels.bindings.filter(b => b.discordChannelId !== id),
    { discordChannelId: id, harness, cwd: draft.cwd, sessionId: null },
  ]
  saveChannels()
  draft.channel = ""
}

const remove = (id: string) => {
  channels.bindings = channels.bindings.filter(b => b.discordChannelId !== id)
  saveChannels()
}
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-col">
    <SettingRow icon="lucide:key-round" title={m.channels_token()}>
      {#if present}
        <div class="flex items-center justify-end gap-2">
          <span class="flex items-center gap-2 text-sm whitespace-nowrap">
            <Icon icon="lucide:circle-check" class="size-4 text-success" />
            {m.channels_token_saved()}
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

    <SettingRow icon="simple-icons:discord" title={m.channels_discord()}>
      <div class="flex items-center justify-end gap-2">
        <span
          class="flex items-center gap-2 text-sm whitespace-nowrap"
          title={channels.user ?? undefined}
        >
          {#if channels.status === "on"}
            <Icon icon="lucide:circle-check" class="size-4 text-success" />
            {m.channels_on()}
          {:else if channels.status === "connecting"}
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
        {#if channels.status === "off"}
          <IconButton
            icon="lucide:plug"
            label={m.common_connect()}
            disabled={attempt.busy || !present}
            onclick={() => attempt.run(connect)}
          />
        {:else}
          <IconButton
            icon="lucide:unplug"
            label={m.channels_disconnect()}
            disabled={attempt.busy}
            onclick={() => attempt.run(disconnectChannels)}
          />
        {/if}
      </div>
    </SettingRow>

    <SettingRow icon="lucide:at-sign" title={m.channels_mention_only()}>
      <input
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        aria-label={m.channels_mention_only()}
        bind:checked={channels.mentionOnly}
        onchange={saveChannels}
      />
    </SettingRow>
  </div>

  <Section icon="lucide:hash" title={m.channels_bindings()}>
    <ul class="flex flex-col">
      {#each channels.bindings as binding (binding.discordChannelId)}
        <li class="flex items-center gap-3 py-2">
          <span
            class="grid size-8 shrink-0 place-items-center rounded-field bg-inset"
          >
            <Icon icon="lucide:hash" class="size-4 text-base-content/70" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span
              class="truncate text-sm font-medium tabular-nums"
              title={binding.discordChannelId}
            >
              {binding.discordChannelId}
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
            onconfirm={() => remove(binding.discordChannelId)}
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
        icon="lucide:hash"
        label={m.channels_channel_id()}
        placeholder={m.channels_channel_id()}
        inputmode="numeric"
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
