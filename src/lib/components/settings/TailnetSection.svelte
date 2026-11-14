<script lang="ts">
import Icon from "@iconify/svelte"
import { onMount } from "svelte"
import { native } from "#lib/acp/native.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { type RuleMode, tailnet, targetOf } from "#lib/p2p/tailnet.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import AddressList from "./AddressList.svelte"

const MODES: { value: RuleMode; name: string }[] = [
  { value: "all", name: m.tailnet_mode_all() },
  { value: "allow", name: m.tailnet_mode_allow() },
  { value: "block", name: m.tailnet_mode_block() },
]

const attempt = new Attempt()

let port = $state(String(tailnet.port))

const apply = () =>
  attempt.run(async () => {
    await tailnet.restart()
    sync.announce()
  })

const savePort = () => {
  const value = Number(port)

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    port = String(tailnet.port)

    return
  }

  if (value !== tailnet.port) {
    tailnet.setPort(value)
    apply()
  }
}

const saveMode = (value: string) => {
  const mode = MODES.find(c => c.value === value)?.value

  if (mode) {
    tailnet.setMode(mode)
    apply()
  }
}

const saveServers =(servers: string[]) => {
  const added = servers.filter(s => !tailnet.servers.includes(s))

  tailnet.setServers(servers)

  for (const entry of added) {
    sync.dialServer(entry)
  }
}

onMount(() => {
  if (desktop) {
    attempt.run(tailnet.detect)
  }
})
</script>

<div class="flex flex-col py-2">
  <p class="flex items-center gap-2 py-2 text-sm font-medium">
    <Icon icon="lucide:network" class="size-4 text-base-content/70" />
    {m.tailnet_title()}
  </p>
  {#if desktop}
    <div class="flex flex-col gap-2 py-3">
      <div class="flex items-center gap-2 text-sm text-base-content/70">
        <span class="flex-1">{m.tailnet_addresses()}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.tailnet_rescan()}
          title={m.tailnet_rescan()}
          disabled={attempt.busy}
          onclick={apply}
        >
          <Icon icon="lucide:refresh-cw" class="size-4" />
        </button>
      </div>
      <ul class="flex flex-col gap-1 text-sm">
        {#each tailnet.detected as found (found.address)}
          <li class="flex items-center gap-2 px-2 py-1">
            <Icon icon="lucide:waypoints" class="size-4 text-base-content/60" />
            <span class="min-w-0 flex-1 truncate tabular-nums">
              {found.address}
            </span>
            <span class="truncate text-xs text-base-content/60">
              {found.iface}
            </span>
            <span class="badge badge-ghost badge-sm whitespace-nowrap">
              {tailnet.bound.includes(found.address)
                ? m.tailnet_listening()
                : m.tailnet_idle()}
            </span>
          </li>
        {:else}
          <li class="flex items-center gap-2 px-2 text-base-content/60">
            <Icon icon="lucide:wifi-off" class="size-4" />
            {m.tailnet_no_addresses()}
          </li>
        {/each}
      </ul>
    </div>
    <SettingRow icon="lucide:plug" title={m.tailnet_port()}>
      <IconInput
        icon="lucide:hash"
        label={m.tailnet_port()}
        ghost={false}
        class="w-32"
        inputmode="numeric"
        bind:value={port}
        onchange={savePort}
      />
    </SettingRow>
    <SettingRow icon="lucide:shield" title={m.tailnet_access()}>
      <IconSelect
        icon="lucide:shield-check"
        label={m.tailnet_access()}
        ghost={false}
        value={tailnet.mode}
        choices={MODES}
        onchange={saveMode}
      />
    </SettingRow>
    {#if tailnet.mode !== "all"}
      <AddressList
        icon="lucide:shield"
        label={m.tailnet_rule()}
        entries={tailnet.rules}
        valid={entry => native<boolean>("tailnet_valid", { entry })}
        onchange={rules => {
          tailnet.setRules(rules)
          apply()
        }}
      />
    {/if}
  {/if}
  <SettingRow icon="lucide:server" title={m.tailnet_servers()} />
  <AddressList
    icon="lucide:server"
    label={m.tailnet_server()}
    entries={tailnet.servers}
    valid={entry => targetOf(entry, tailnet.port) !== null}
    onchange={saveServers}
  />
  <ErrorAlert message={attempt.failure} />
</div>
