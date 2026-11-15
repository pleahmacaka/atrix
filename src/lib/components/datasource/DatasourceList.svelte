<script module lang="ts">
import { SvelteSet } from "svelte/reactivity"

export type TableRef = { name: string; table: string }

const expanded = new SvelteSet<string>()

const tables = $state<Record<string, string[]>>({})
</script>

<script lang="ts">
import { onMount, untrack } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import DraftField from "#lib/components/ui/DraftField.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import TreeRow from "#lib/components/ui/TreeRow.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"

let {
  host,
  selected = $bindable(null),
}: { host: HostView; selected?: TableRef | null } = $props()

const attempt = new Attempt()

let creating = $state(false)

let name = $state("")

const loadTables = (db: string) =>
  attempt.run(async () => {
    tables[db] = await host.dsTables(db)
  })

const refresh = () =>
  attempt.run(async () => {
    await host.loadDatasources()

    for (const db of expanded) {
      if (host.datasources.includes(db)) {
        await loadTables(db)
      } else {
        expanded.delete(db)
      }
    }
  })

onMount(() => {
  const db = selected?.name

  if (db && !expanded.has(db)) {
    expanded.add(db)
    loadTables(db)
  }
})

$effect(() => {
  const change = host.dsChange

  untrack(() => {
    if (!change?.name || expanded.has(change.name)) {
      refresh()
    } else {
      host.loadDatasources().catch(() => {})
    }
  })
})

const toggle = (db: string) => {
  if (expanded.has(db)) {
    expanded.delete(db)

    return
  }

  expanded.add(db)
  loadTables(db)
}

const cancel = () => {
  creating = false
  name = ""
}

const create = () =>
  attempt.run(async () => {
    const value = name.trim()

    if (!value) {
      return
    }

    await host.dsCreate(value)
    cancel()
  })

const remove = (db: string) =>
  attempt.run(async () => {
    await host.dsDelete(db)
    expanded.delete(db)

    if (selected?.name === db) {
      selected = null
    }
  })

const startCreate = () => {
  creating = true
}

const listMenu = (): MenuItem[] => [
  { label: m.ds_new(), icon: "lucide:database", run: startCreate },
  { label: m.ds_refresh(), icon: "lucide:refresh-cw", run: refresh },
]

const databaseMenu = (db: string): MenuItem[] => [
  {
    label: m.ds_copy_name(),
    icon: "lucide:copy",
    run: () => navigator.clipboard.writeText(db),
  },
  { label: m.ds_new(), icon: "lucide:database", run: startCreate },
  host.knowledgeSources.includes(db)
    ? {
        label: m.ds_knowledge_off(),
        icon: "lucide:book-x",
        run: () => attempt.run(() => host.dsSetKnowledge(db, false)),
      }
    : {
        label: m.ds_knowledge_on(),
        icon: "lucide:book-marked",
        run: () => attempt.run(() => host.dsSetKnowledge(db, true)),
      },
  "separator",
  {
    label: m.common_delete(),
    icon: "lucide:trash-2",
    danger: true,
    confirm: m.menu_confirm_delete(),
    run: () => remove(db),
  },
]

const tableMenu = (table: string): MenuItem[] => [
  {
    label: m.ds_copy_table(),
    icon: "lucide:copy",
    run: () => navigator.clipboard.writeText(table),
  },
]
</script>

<nav
  class="flex min-h-full flex-col gap-0.5 p-2"
  aria-label={m.shell_page_data()}
  oncontextmenu={e => contextMenu.show(e, listMenu())}
>
  {#if creating}
    <DraftField
      icon="lucide:database"
      label={m.ds_name()}
      bind:value={name}
      dismissable={() => !name.trim() && !attempt.busy}
      onsubmit={create}
      oncancel={cancel}
    />
  {:else}
    <TreeRow icon="lucide:plus" label={m.ds_new()} onclick={startCreate} />
  {/if}
  <ErrorAlert message={attempt.failure} />
  {#if host.datasources.length === 0}
    <EmptyState
      icon="lucide:database"
      title={m.ds_empty()}
      text={m.ds_empty_hint()}
      centered
    />
  {:else}
    <ul class="mt-1 flex flex-col gap-0.5">
      {#each host.datasources as db (db)}
        <li>
          <TreeRow
            icon="lucide:database"
            label={db}
            badge={host.knowledgeSources.includes(db) ? m.ds_knowledge() : undefined}
            expanded={expanded.has(db)}
            strong
            accent
            onclick={() => toggle(db)}
            oncontextmenu={e => contextMenu.show(e, databaseMenu(db))}
          />
          {#if expanded.has(db)}
            <ul class="flex flex-col gap-0.5 ps-4 pt-0.5">
              {#each tables[db] ?? [] as table (table)}
                <li>
                  <TreeRow
                    icon="lucide:table-2"
                    label={table}
                    selected={selected?.name === db && selected.table === table}
                    onclick={() => {
                      selected = { name: db, table }
                    }}
                    oncontextmenu={e => contextMenu.show(e, tableMenu(table))}
                  />
                </li>
              {:else}
                <li class="flex h-8 items-center px-2 text-sm text-base-content/50">
                  {m.ds_no_tables()}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</nav>
