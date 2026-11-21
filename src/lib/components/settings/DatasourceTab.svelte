<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

const attempt = new Attempt()

const hosts = $derived(hostList())

const many = $derived(hosts.length > 1)

const rows = $derived(
  hosts.flatMap(host =>
    host.view.datasources.map(name => ({ host, name, key: `${host.id}:${name}` })),
  ),
)

$effect(() => {
  for (const host of hosts) {
    attempt.run(() => host.view.loadDatasources())
  }
})
</script>

{#if hosts.length === 0}
  <EmptyState
    icon="lucide:monitor-off"
    title={m.harness_no_desktop()}
    text={m.harness_no_hosts_text()}
  />
{:else if rows.length === 0}
  <EmptyState icon="lucide:database" text={m.ds_empty()} />
{:else}
  <ul class="flex flex-col rounded-box border border-base-300 bg-base-100 p-1">
    {#each rows as { host, name, key } (key)}
      <li class="flex h-10 min-w-0 items-center gap-2 px-2">
        <Icon icon="lucide:database" class="size-4 shrink-0 opacity-80" />
        <span class="min-w-0 truncate text-sm font-medium">{name}</span>
        {#if many && host.id !== LOCAL}
          <span class="max-w-24 shrink-0 truncate text-xs text-base-content/45" title={host.name}>
            {host.name}
          </span>
        {/if}
        <span class="flex-1"></span>
        <label class="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-base-content/70">
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-primary"
            checked={host.view.knowledgeSources.includes(name)}
            disabled={attempt.busy}
            onchange={e => attempt.run(() => host.view.dsSetKnowledge(name, e.currentTarget.checked))}
          />
          {m.ds_knowledge()}
        </label>
      </li>
    {/each}
  </ul>
{/if}
<ErrorAlert message={attempt.failure} />
