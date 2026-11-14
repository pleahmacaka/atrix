<script lang="ts">
import Icon from "@iconify/svelte"
import { onDestroy } from "svelte"
import CopyButton from "#lib/components/chat/CopyButton.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { PAIR_CHOICES, sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { local } from "#lib/store/local.svelte.ts"
import TailnetSection from "./TailnetSection.svelte"

const attempt = new Attempt()

let code = $state("")

let minutes = $state(10)

let now = $state(Date.now())

const timer = setInterval(() => {
  now = Date.now()
}, 1000)

onDestroy(() => clearInterval(timer))

const remaining = $derived.by(() => {
  const left = Math.max(0, (sync.pairing?.expires ?? now) - now)
  const total = Math.floor(left / 1000)
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
})

const connect = () =>
  attempt.run(async () => {
    await sync.connect(code)
    code = ""
  })
</script>

{#if local.data.sync}
  <SettingRow
    icon="lucide:ticket"
    title={m.sync_issue()}
  >
    <div class="flex items-center gap-2">
      <IconSelect
        icon="lucide:timer"
        label={m.sync_validity()}
        ghost={false}
        value={String(minutes)}
        choices={PAIR_CHOICES.map(c => ({
          value: String(c.minutes),
          name: c.label,
        }))}
        onchange={value => {
          minutes = Number(value)
        }}
      />
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled={attempt.busy}
        onclick={() => attempt.run(() => sync.issue(minutes))}
      >
        <Icon
          icon={sync.pairing ? "lucide:refresh-cw" : "lucide:ticket-plus"}
          class="size-4"
        />
        {sync.pairing ? m.sync_reissue() : m.sync_issue_button()}
      </button>
    </div>
  </SettingRow>
  {#if sync.pairing}
    <div class="flex flex-col gap-2 border-b border-base-300 py-4">
      <div class="flex items-center gap-2">
        <code
          class={[
            "min-w-0 flex-1 rounded-field bg-base-200 px-3 py-2",
            "text-sm break-all select-all",
          ]}
        >
          {sync.pairing.code}
        </code>
        <CopyButton text={sync.pairing.code} />
      </div>
      <div class="flex items-center gap-2 text-xs text-base-content/60">
        <Icon icon="lucide:hourglass" class="size-4" />
        <span class="flex-1 tabular-nums">{m.sync_expires_in({ remaining })}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.sync_discard()}
          title={m.sync_discard()}
          onclick={() => sync.closePairing()}
        >
          <Icon icon="lucide:trash-2" class="size-4" />
        </button>
      </div>
    </div>
  {/if}
  <div class="border-b border-base-300 py-4">
    <p class="mb-3 flex items-center gap-2 text-sm font-medium">
      <Icon icon="lucide:radio-tower" class="size-4 text-base-content/70" />
      {m.sync_devices()}
    </p>
    <ul class="flex flex-col gap-2 text-sm">
      {#each [...sync.peers.values()] as peer (peer.id)}
        <li class="flex items-center gap-2">
          <Icon
            icon={peer.host ? "lucide:monitor" : "lucide:globe"}
            class="size-4 text-base-content/60"
          />
          <span class="min-w-0 flex-1 truncate">{peer.name}</span>
          <span class="badge badge-ghost badge-sm whitespace-nowrap">
            <Icon
              icon={peer.host ? "lucide:boxes" : "lucide:app-window"}
              class="size-3"
            />
            {peer.host ? m.sync_peer_host() : m.sync_peer_web()}
          </span>
        </li>
      {:else}
        <li class="flex items-center gap-2 text-base-content/60">
          <Icon icon="lucide:wifi-off" class="size-4" />
          {m.sync_no_devices()}
        </li>
      {/each}
    </ul>
  </div>
  <TailnetSection />
  <SettingRow
    icon="lucide:unlink"
    title={m.sync_leave()}
  >
    <button
      type="button"
      class="btn btn-sm btn-square btn-error btn-soft"
      disabled={attempt.busy}
      onclick={() => attempt.run(sync.stop)}
      aria-label={m.sync_leave_button()}
      title={m.sync_leave_button()}
    >
      <Icon icon="lucide:unlink" class="size-4" />
    </button>
  </SettingRow>
{:else}
  <SettingRow
    icon="lucide:sparkles"
    title={m.sync_start()}
  >
    <button
      type="button"
      class="btn btn-primary btn-sm btn-square"
      disabled={attempt.busy}
      onclick={() => attempt.run(sync.start)}
      aria-label={m.sync_start_button()}
      title={m.sync_start_button()}
    >
      <Icon icon="lucide:play" class="size-4" />
    </button>
  </SettingRow>
  <SettingRow
    icon="lucide:link"
    title={m.sync_join()}
  >
    <form
      class="flex w-72 gap-2 max-sm:w-full"
      onsubmit={e => {
        e.preventDefault()
        connect()
      }}
    >
      <IconInput
        icon="lucide:ticket"
        label={m.sync_code()}
        ghost={false}
        class="flex-1"
        placeholder={m.sync_code()}
        bind:value={code}
      />
      <button
        type="submit"
        class="btn btn-sm"
        disabled={attempt.busy || !code.trim()}
      >
        {#if attempt.busy}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <Icon icon="lucide:link" class="size-4" />
        {/if}
        {m.common_connect()}
      </button>
    </form>
  </SettingRow>
{/if}
<ErrorAlert message={attempt.failure} />
