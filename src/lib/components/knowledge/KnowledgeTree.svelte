<script lang="ts">
import { SvelteSet } from "svelte/reactivity"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import DraftField from "#lib/components/ui/DraftField.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import TreeRow from "#lib/components/ui/TreeRow.svelte"
import { GRAPH, knowledgeHost } from "#lib/knowledge/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { nav } from "#lib/store/nav.svelte.ts"
import TrashList from "./TrashList.svelte"

type Leaf = { key: string; id: string; title: string; icon: string }

type Folder = { name: string; path: string; folders: Folder[]; docs: Leaf[] }

type Draft =
  | { kind: "doc" | "folder" }
  | { kind: "rename"; from: string; canvas: boolean }

const host = $derived(knowledgeHost())

const status = $derived(host?.state?.knowledge)

const closed = new SvelteSet<string>()

const attempt = new Attempt()

let draft = $state<Draft | null>(null)

let path = $state("")

const DRAFT_ICONS = {
  doc: "lucide:file-plus",
  folder: "lucide:folder-plus",
  rename: "lucide:pencil",
}

const tree = $derived.by(() => {
  const root: Folder = { name: "", path: "", folders: [], docs: [] }

  const folderAt = (parts: string[]) => {
    let folder = root

    for (const part of parts) {
      const found = folder.folders.find(f => f.name === part)
      const next = found ?? {
        name: part,
        path: folder.path ? `${folder.path}/${part}` : part,
        folders: [],
        docs: [],
      }

      if (!found) {
        folder.folders.push(next)
      }

      folder = next
    }

    return folder
  }

  const leaves: Leaf[] = [
    ...(host?.knowledge ?? []).map(e => ({
      key: e.key,
      id: e.meta.id,
      title: e.meta.title,
      icon: "lucide:file-text",
    })),
    ...(host?.canvases ?? []).map(c => ({
      key: c.key,
      id: c.key,
      title: c.key.split("/").at(-1)?.replace(/\.canvas$/, "") ?? c.key,
      icon: "lucide:layout-dashboard",
    })),
  ]

  for (const folder of host?.folders ?? []) {
    folderAt(folder.split("/"))
  }

  for (const entry of leaves) {
    folderAt(entry.key.split("/").slice(0, -1)).docs.push(entry)
  }

  return root
})

const titleFromPath = (value: string) =>
  value.split("/").at(-1)?.replace(/\.md$/, "") || m.common_untitled()

const withoutExtension = (key: string) => key.replace(/\.(md|canvas)$/, "")

const begin = (next: Draft, value = "") => {
  draft = next
  path = value
}

const untouched = () => {
  const value = path.trim()

  const renaming = draft?.kind === "rename" && value === draft.from

  return !value || value.endsWith("/") || renaming
}

const finish = () => {
  draft = null
  path = ""
}

const createDoc = async (target: string) => {
  if (!host) {
    return
  }

  if (target.endsWith(".canvas")) {
    const made = await host.saveCanvas(target, null, { nodes: [], edges: [] })

    if (made.ok) {
      await host.loadKnowledge()
      nav.doc = made.entry.key
      finish()
    }

    return
  }

  const saved = await host.createDoc(
    target,
    {
      title: titleFromPath(target),
      description: "",
      tags: [],
      scope: "network",
      links: [],
    },
    "",
  )

  if (saved.ok) {
    nav.doc = saved.entry.meta.id
    finish()
  }
}

const submit = () =>
  attempt.run(async () => {
    const target = path.trim()

    const current = draft

    if (!host || !current || !target) {
      return
    }

    if (current.kind === "doc") {
      await createDoc(target)
    } else if (current.kind === "folder") {
      await host.createFolder(target)
      finish()
    } else if (current.kind === "rename") {
      const { from, canvas } = current

      await host.movePath(from, target)

      if (canvas && nav.doc === from) {
        nav.doc = `${withoutExtension(target)}.canvas`
      }

      finish()
    }
  })

const remove = (target: string, open: boolean) =>
  attempt.run(async () => {
    await host?.removePath(target)

    if (open) {
      nav.doc = null
    }
  })

const copyPath = (value: string) => navigator.clipboard.writeText(value)

const creationItems = (parent: string): MenuItem[] => {
  const prefix = parent ? `${parent}/` : ""

  return [
    {
      label: m.knowledge_new(),
      icon: "lucide:file-plus",
      run: () => begin({ kind: "doc" }, prefix),
    },
    {
      label: m.knowledge_new_folder(),
      icon: "lucide:folder-plus",
      run: () => begin({ kind: "folder" }, prefix),
    },
  ]
}

const holds = (folder: Folder, id: string | null): boolean =>
  folder.docs.some(d => d.id === id) || folder.folders.some(f => holds(f, id))

const folderMenu = (folder: Folder): MenuItem[] => {
  const holdsOpen = holds(folder, nav.doc)

  return [
    ...creationItems(folder.path),
    "separator",
    {
      label: m.menu_rename(),
      icon: "lucide:pencil",
      run: () =>
        begin({ kind: "rename", from: folder.path, canvas: false }, folder.path),
    },
    {
      label: m.menu_copy_path(),
      icon: "lucide:copy",
      run: () => copyPath(folder.path),
    },
    "separator",
    {
      label: m.common_delete(),
      icon: "lucide:trash-2",
      danger: true,
      confirm: m.menu_confirm_delete(),
      run: () => remove(folder.path, holdsOpen),
    },
  ]
}

const docMenu = (doc: Leaf): MenuItem[] => {
  const canvas = doc.key.endsWith(".canvas")

  return [
    {
      label: m.menu_open(),
      icon: "lucide:file-text",
      run: () => {
        nav.doc = doc.id
      },
    },
    "separator",
    {
      label: m.menu_rename(),
      icon: "lucide:pencil",
      run: () =>
        begin(
          { kind: "rename", from: doc.key, canvas },
          withoutExtension(doc.key),
        ),
    },
    {
      label: m.menu_copy_path(),
      icon: "lucide:copy",
      run: () => copyPath(doc.key),
    },
    "separator",
    {
      label: m.common_delete(),
      icon: "lucide:trash-2",
      danger: true,
      confirm: m.menu_confirm_delete(),
      run: () => remove(doc.key, nav.doc === doc.id),
    },
  ]
}

const empty = $derived(tree.folders.length === 0 && tree.docs.length === 0)

const toggle = (folder: string) => {
  if (closed.has(folder)) {
    closed.delete(folder)
  } else {
    closed.add(folder)
  }
}
</script>

{#snippet branch(folder: Folder)}
  {#each folder.folders as child (child.path)}
    <li>
      <TreeRow
        icon={closed.has(child.path) ? "lucide:folder" : "lucide:folder-open"}
        label={child.name}
        title={child.path}
        expanded={!closed.has(child.path)}
        strong
        accent
        onclick={() => toggle(child.path)}
        oncontextmenu={e => contextMenu.show(e, folderMenu(child))}
      />
      {#if !closed.has(child.path)}
        <ul class="flex flex-col gap-0.5 ps-4 pt-0.5">
          {@render branch(child)}
        </ul>
      {/if}
    </li>
  {/each}
  {#each folder.docs as doc (doc.key)}
    <li>
      <TreeRow
        icon={doc.icon}
        label={doc.title}
        title={doc.key}
        selected={nav.doc === doc.id}
        onclick={() => {
          nav.doc = doc.id
        }}
        oncontextmenu={e => contextMenu.show(e, docMenu(doc))}
      />
    </li>
  {/each}
{/snippet}

<nav
  class="flex min-h-full flex-col gap-0.5 p-2"
  aria-label={m.shell_page_knowledge()}
  oncontextmenu={e => {
    if (status?.ready) {
      contextMenu.show(e, creationItems(""))
    }
  }}
>
  {#if status?.ready}
    {#if draft}
      <DraftField
        icon={DRAFT_ICONS[draft.kind]}
        label={draft.kind === "folder"
          ? m.knowledge_folder_path()
          : m.knowledge_path()}
        placeholder={draft.kind === "folder"
          ? m.knowledge_folder_path_hint()
          : m.knowledge_path_hint()}
        bind:value={path}
        dismissable={() => untouched() && !attempt.busy}
        onsubmit={submit}
        oncancel={finish}
      />
    {:else}
      <TreeRow
        icon="lucide:file-plus"
        label={m.knowledge_new()}
        onclick={() => begin({ kind: "doc" })}
      />
    {/if}
    <TreeRow
      icon="lucide:waypoints"
      label={m.knowledge_graph()}
      selected={nav.doc === GRAPH}
      onclick={() => {
        nav.doc = GRAPH
      }}
    />
    <ErrorAlert message={attempt.failure} />
    {#if !empty}
      <ul class="mt-1 flex flex-col gap-0.5">
        {@render branch(tree)}
      </ul>
    {/if}
    {#if host}
      <TrashList {host} />
    {/if}
  {:else if status?.error}
    <ErrorAlert message={m.knowledge_unavailable({ error: status.error })} />
  {:else}
    <p class="flex h-8 items-center gap-2 px-2 text-sm text-base-content/60">
      <span class="loading loading-spinner loading-xs"></span>
      {m.knowledge_starting()}
    </p>
  {/if}
</nav>
