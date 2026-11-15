<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import Section from "#lib/components/ui/Section.svelte"
import SettingRow from "#lib/components/ui/SettingRow.svelte"
import { type HostEntry, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { SyncConfig } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

const attempt = new Attempt()

const hosts = $derived(hostList())

let drafts = $state<Record<string, SyncConfig>>({})

let synced = $state<string | null>(null)

const keyOf = (host: HostEntry, name: string) => `${host.id}:${name}`

$effect(() => {
  for (const host of hosts) {
    attempt.run(async () => {
      const [configs] = await Promise.all([
        host.view.dsSyncConfigs(),
        host.view.loadDatasources(),
      ])

      for (const name of host.view.datasources) {
        drafts[keyOf(host, name)] = configs[name] ?? { url: "", token: "" }
      }
    })
  }
})

const save = (host: HostEntry, name: string) =>
  attempt.run(async () => {
    const draft = drafts[keyOf(host, name)]

    await host.view.dsSetSync(name, draft.url.trim() ? draft : null)
  })

const syncNow = (host: HostEntry, name: string) =>
  attempt.run(async () => {
    synced = null
    await host.view.dsSync(name)
    synced = keyOf(host, name)
  })
</script>

<div class="flex flex-col gap-6">
  {#each hosts as host (host.id)}
    <Section icon="lucide:monitor" title={host.name}>
      {#each host.view.datasources as name (name)}
        {@const key = keyOf(host, name)}
        {#if drafts[key]}
          <form
            class="flex flex-col gap-2 pb-3"
            onsubmit={e => {
              e.preventDefault()
              save(host, name)
            }}
          >
            <SettingRow icon="lucide:database" title={name}>
              <label class="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="toggle toggle-sm toggle-primary"
                  checked={host.view.knowledgeSources.includes(name)}
                  disabled={attempt.busy}
                  onchange={e =>
                    attempt.run(() =>
                      host.view.dsSetKnowledge(name, e.currentTarget.checked),
                    )}
                />
                {m.ds_knowledge()}
              </label>
              <IconButton
                icon={synced === key ? "lucide:check" : "lucide:refresh-cw"}
                label={m.ds_sync_now()}
                disabled={attempt.busy || !drafts[key].url.trim()}
                onclick={() => syncNow(host, name)}
              />
              <IconButton
                type="submit"
                icon="lucide:save"
                label={m.common_save()}
                tone="primary"
                disabled={attempt.busy}
              />
            </SettingRow>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <IconInput
                icon="lucide:link"
                label={m.ds_sync_url()}
                placeholder={m.ds_sync_url()}
                ghost={false}
                bind:value={drafts[key].url}
              />
              <IconInput
                icon="lucide:key-round"
                label={m.ds_sync_token()}
                placeholder={m.ds_sync_token()}
                ghost={false}
                type="password"
                autocomplete="off"
                bind:value={drafts[key].token}
              />
            </div>
          </form>
        {/if}
      {:else}
        <EmptyState icon="lucide:database" text={m.ds_empty()} />
      {/each}
    </Section>
  {:else}
    <EmptyState
      icon="lucide:monitor-off"
      title={m.harness_no_desktop()}
      text={m.harness_no_hosts_text()}
    />
  {/each}
</div>
<ErrorAlert message={attempt.failure} />
