<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
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

{#each hosts as host (host.id)}
  <section class="border-b border-base-300 py-4 last:border-b-0">
    <div class="mb-2 flex items-center gap-3">
      <span class="grid size-8 shrink-0 place-items-center rounded-field bg-base-200">
        <Icon icon="lucide:monitor" class="size-4 text-base-content/70" />
      </span>
      <p class="min-w-0 flex-1 truncate text-sm font-medium">{host.name}</p>
    </div>
    {#each host.view.datasources as name (name)}
      {@const key = keyOf(host, name)}
      {#if drafts[key]}
        <SettingRow icon="lucide:database" title={name}>
          <form
            class="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch"
            onsubmit={e => {
              e.preventDefault()
              save(host, name)
            }}
          >
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
            <button
              type="submit"
              class="btn btn-sm btn-square"
              aria-label={m.common_save()}
              title={m.common_save()}
              disabled={attempt.busy}
            >
              <Icon icon="lucide:save" class="size-4" />
            </button>
            <button
              type="button"
              class="btn btn-sm btn-square"
              aria-label={m.ds_sync_now()}
              title={m.ds_sync_now()}
              disabled={attempt.busy || !drafts[key].url.trim()}
              onclick={() => syncNow(host, name)}
            >
              <Icon
                icon={synced === key ? "lucide:check" : "lucide:refresh-cw"}
                class="size-4"
              />
            </button>
          </form>
        </SettingRow>
      {/if}
    {:else}
      <EmptyState icon="lucide:database" text={m.ds_empty()} />
    {/each}
  </section>
{/each}
<ErrorAlert message={attempt.failure} />
