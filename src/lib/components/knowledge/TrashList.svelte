<script lang="ts">
import { untrack } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import TreeRow from "#lib/components/ui/TreeRow.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Trashed } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { nav } from "#lib/store/nav.svelte.ts"

let { host }: { host: HostView } = $props()

const attempt = new Attempt()

let open = $state(false)

let trashed = $state<Trashed[]>([])

const load = () =>
  attempt.run(async () => {
    trashed = await host.trashDocs()
  })

$effect(() => {
  void host.lastChange

  if (open) {
    untrack(load)
  }
})

const restore = (doc: Trashed) =>
  attempt.run(async () => {
    const saved = await host.restoreDoc(doc.key, doc.versionId)

    if (saved.ok) {
      nav.doc = saved.entry.meta.id
    }
  })

const menuOf = (doc: Trashed): MenuItem[] => [
  {
    label: m.knowledge_restore(),
    icon: "lucide:archive-restore",
    run: () => restore(doc),
  },
  {
    label: m.menu_copy_path(),
    icon: "lucide:copy",
    run: () => navigator.clipboard.writeText(doc.key),
  },
]
</script>

<div class="mt-auto pt-2">
  <TreeRow
    icon="lucide:trash-2"
    label={m.knowledge_trash()}
    expanded={open}
    onclick={() => {
      open = !open
    }}
  />
  {#if open}
    <ul class="flex flex-col gap-0.5 ps-4 pt-0.5">
      {#each trashed as doc (doc.key)}
        <li>
          <TreeRow
            icon="lucide:file-x"
            label={doc.title}
            title={doc.key}
            onclick={() => restore(doc)}
            oncontextmenu={e => {
              e.stopPropagation()
              contextMenu.show(e, menuOf(doc))
            }}
          />
        </li>
      {:else}
        <li class="flex h-8 items-center px-2 text-sm text-base-content/50">
          {m.knowledge_trash_empty()}
        </li>
      {/each}
    </ul>
  {/if}
  <ErrorAlert message={attempt.failure} />
</div>