<script module lang="ts">
export type TableRef = { name: string; table: string }
</script>

<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { SvelteSet } from "svelte/reactivity"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"

let {
  host,
  selected = $bindable(null),
}: { host: HostView; selected?: TableRef | null } = $props()

const attempt = new Attempt()

const expanded = new SvelteSet<string>()

let tables = $state<Record<string, string[]>>({})

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

const create = () =>
  attempt.run(async () => {
    const value = name.trim()

    if (!value) {
      return
    }

    await host.dsCreate(value)
    creating = false
    name = ""
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

<div class="flex flex-col gap-1 p-2">
  {#if creating}
    <form
      class="flex items-center gap-1"
      onsubmit={e => {
        e.preventDefault()
        create()
      }}
    >
      <IconInput
        icon="lucide:database"
        label={m.ds_name()}
        placeholder={m.ds_name()}
        class="w-full"
        bind:value={name}
        onkeydown={e => {
          if (e.key === "Escape") {
            creating = false
          }
        }}
      />
    </form>
  {:else}
    <button
      type="button"
      class="btn btn-ghost btn-sm justify-start font-normal"
      onclick={startCreate}
      oncontextmenu={e => contextMenu.show(e, listMenu())}
    >
      <Icon icon="lucide:database" class="size-4" />
      {m.ds_new()}
    </button>
  {/if}
  <ErrorAlert message={attempt.failure} />
  <ul class="flex flex-col">
    {#each host.datasources as db (db)}
      <li>
        <button
          type="button"
          class={[
            "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1",
            "text-sm font-medium transition-colors duration-150 hover:bg-base-200",
          ]}
          aria-expanded={expanded.has(db)}
          onclick={() => toggle(db)}
          oncontextmenu={e => contextMenu.show(e, databaseMenu(db))}
        >
          <Icon
            icon={expanded.has(db) ? "lucide:chevron-down" : "lucide:chevron-right"}
            class="size-4 shrink-0 text-base-content/50"
          />
          <Icon icon="lucide:database" class="size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1 truncate text-start">{db}</span>
        </button>
        {#if expanded.has(db)}
          <ul class="ms-3.5 border-s border-base-300 ps-1.5">
            {#each tables[db] ?? [] as table (table)}
              {@const active = selected?.name === db && selected.table === table}
              <li>
                <button
                  type="button"
                  class={[
                    "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1",
                    "text-sm transition-colors duration-150",
                    active
                      ? "bg-primary/8 font-medium text-primary"
                      : "text-base-content/70 hover:bg-base-200 hover:text-base-content",
                  ]}
                  onclick={() => {
                    selected = { name: db, table }
                  }}
                  oncontextmenu={e => contextMenu.show(e, tableMenu(table))}
                >
                  <Icon
                    icon="lucide:table-2"
                    class={[
                      "size-4 shrink-0",
                      active ? "text-primary" : "text-base-content/35",
                    ]}
                  />
                  <span class="min-w-0 flex-1 truncate text-start">{table}</span>
                </button>
              </li>
            {:else}
              <li class="px-2 py-1 text-sm text-base-content/50">
                {m.ds_no_tables()}
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {:else}
      <li>
        <EmptyState icon="lucide:database" text={m.ds_empty()} />
      </li>
    {/each}
  </ul>
</div>
