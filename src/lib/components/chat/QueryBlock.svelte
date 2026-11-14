<script lang="ts">
import type { Block } from "#lib/chat/blocks.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

type Query = Extract<Block, { type: "query" }>

let { block }: { block: Query } = $props()

let columns = $state<string[]>([])

let rows = $state<unknown[][]>([])

let failure = $state<string | null>(null)

const host = $derived(hostById(LOCAL))

$effect(() => {
  const view = host

  if (!view) {
    return
  }

  failure = null
  view
    .dsQuery(block.source, block.sql, block.params ?? [])
    .then(result => {
      columns = result.columns
      rows = result.rows
    })
    .catch((e: unknown) => {
      failure = e instanceof Error ? e.message : String(e)
    })
})
</script>

{#if failure}
  <p class="text-sm text-error">{failure}</p>
{:else if rows.length === 0}
  <EmptyState icon="lucide:table" text={m.ds_no_rows()} />
{:else}
  <div class="max-h-96 overflow-auto">
    <table class="table table-sm tabular-nums">
      <thead>
        <tr>
          {#each columns as column, i (i)}
            <th>{column}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row, r (r)}
          <tr>
            {#each columns as _, c (c)}
              <td>{String(row[c] ?? "")}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
