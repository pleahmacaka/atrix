<script lang="ts">
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
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

<div class="flex min-h-0 flex-1 flex-col gap-2">
  <ErrorAlert message={attempt.failure} />
  {#if result && result.rows.length > 0}
    <div class="min-h-0 flex-1 overflow-auto">
      <table class="table table-xs table-pin-rows tabular-nums">
        <thead>
          <tr>
            {#each result.columns as column, i (i)}
              <th class="whitespace-nowrap">{column}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each result.rows as row, r (r)}
            <tr class="hover:bg-base-200">
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
    <p class="px-2 text-xs text-base-content/60 tabular-nums">
      {m.ds_row_count({ count: result.rows.length })}
    </p>
  {:else if result}
    <EmptyState icon="lucide:table-2" text={m.ds_no_rows()} />
  {:else if attempt.busy}
    <span class="loading loading-spinner loading-sm self-center"></span>
  {/if}
</div>
