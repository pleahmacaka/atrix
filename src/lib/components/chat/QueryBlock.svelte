<script lang="ts">
import type { Block } from "#lib/chat/blocks.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostById, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import DataTable from "./DataTable.svelte"

type Query = Extract<Block, { type: "query" }>

let { block }: { block: Query } = $props()

let columns = $state<string[]>([])

let rows = $state<unknown[][]>([])

let loading = $state(true)

let failure = $state<string | null>(null)

const host = $derived(hostById(LOCAL))

$effect(() => {
  const view = host

  if (!view) {
    return
  }

  failure = null
  loading = true

  view
    .dsQuery(block.source, block.sql, block.params ?? [])
    .then(result => {
      columns = result.columns
      rows = result.rows
    })
    .catch((e: unknown) => {
      failure = e instanceof Error ? e.message : String(e)
    })
    .finally(() => {
      loading = false
    })
})
</script>

{#if failure}
  <ErrorAlert message={failure} />
{:else if loading && host}
  <div class="flex flex-col gap-2" role="status" aria-label={m.ds_loading()}>
    <div class="skeleton h-6 w-full"></div>
    <div class="skeleton h-6 w-full"></div>
    <div class="skeleton h-6 w-2/3"></div>
  </div>
{:else if rows.length === 0}
  <EmptyState icon="lucide:table" text={m.ds_no_rows()} />
{:else}
  <DataTable {columns} {rows} />
{/if}
