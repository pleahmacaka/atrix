<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import { previewQuery } from "#lib/datasource/client.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Rows } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  host,
  name,
  table,
  limit = 200,
}: { host: HostView; name: string; table: string; limit?: number } = $props()

const attempt = new Attempt()

let result = $state<Rows | null>(null)

const load = (db: string, from: string, max: number) =>
  attempt.run(async () => {
    const query = previewQuery(from, max)

    result = await host.dsQuery(db, query.sql, query.params)
  })

$effect(() => {
  const change = host.dsChange

  if (!change?.name || change.name === name) {
    load(name, table, limit)
  }
})

const shown = (value: unknown) =>
  typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value)
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <PageHeader icon="lucide:table-2" title={table}>
    {#snippet actions()}
      {#if result}
        <span class="text-xs text-base-content/60 tabular-nums">
          {m.ds_row_count({ count: result.rows.length })}
        </span>
      {/if}
    {/snippet}
  </PageHeader>
  {#if attempt.failure}
    <div class="px-4 sm:px-6">
      <ErrorAlert message={attempt.failure} />
    </div>
  {/if}
  {#if result}
    <div class="min-h-0 overflow-auto px-2 sm:px-4">
      <table class="table table-xs table-pin-rows tabular-nums">
        <thead>
          <tr class="border-0 bg-raised">
            {#each result.columns as column, i (i)}
              <th class="bg-inset whitespace-nowrap">{column}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each result.rows as row, r (r)}
            <tr class="border-0 hover:bg-base-content/5">
              {#each row as value, c (c)}
                <td
                  class={[
                    "max-w-xs truncate",
                    value === null && "text-base-content/40",
                  ]}
                  title={shown(value)}
                >
                  {shown(value)}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if result.rows.length === 0}
      <EmptyState
        icon="lucide:table-2"
        text={m.ds_no_rows()}
        centered
      />
    {/if}
  {:else if attempt.busy}
    <div class="grid flex-1 place-items-center">
      <span class="loading loading-spinner loading-sm opacity-60"></span>
    </div>
  {/if}
</div>
