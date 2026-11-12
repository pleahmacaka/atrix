<script lang="ts">
import Icon from "@iconify/svelte"
import { SvelteSet } from "svelte/reactivity"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import { GRAPH, knowledgeHost } from "#lib/knowledge/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"

type Leaf = { key: string; id: string; title: string; icon: string }

type Folder = { name: string; path: string; folders: Folder[]; docs: Leaf[] }

const host = $derived(knowledgeHost())

const status = $derived(host?.state?.knowledge)

const closed = new SvelteSet<string>()

const attempt = new Attempt()

let creating = $state(false)

let path = $state("")

const tree = $derived.by(() => {
  const root: Folder = { name: "", path: "", folders: [], docs: [] }

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

  for (const entry of leaves) {
    let folder = root

    for (const part of entry.key.split("/").slice(0, -1)) {
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

    folder.docs.push(entry)
  }

  return root
})

const titleFromPath = (value: string) =>
  value.split("/").at(-1)?.replace(/\.md$/, "") || m.common_untitled()

const create = () =>
  attempt.run(async () => {
    if (!host || !path.trim()) {
      return
    }

    if (path.trim().endsWith(".canvas")) {
      const made = await host.saveCanvas(path.trim(), null, { nodes: [], edges: [] })

      if (made.ok) {
        await host.loadKnowledge()
        nav.doc = made.entry.key
        creating = false
        path = ""
      }

      return
    }

    const saved = await host.createDoc(
      path,
      {
        title: titleFromPath(path),
        description: "",
        tags: [],
        scope: "network",
        links: [],
      },
      "",
    )

    if (saved.ok) {
      nav.doc = saved.entry.meta.id
      creating = false
      path = ""
    }
  })

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
      <button
        type="button"
        class={[
          "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1",
          "text-sm font-medium transition-colors hover:bg-base-200",
        ]}
        aria-expanded={!closed.has(child.path)}
        onclick={() => toggle(child.path)}
      >
        <Icon
          icon={closed.has(child.path) ? "lucide:folder" : "lucide:folder-open"}
          class="size-4 shrink-0 text-primary"
        />
        <span class="min-w-0 flex-1 truncate text-start">{child.name}</span>
      </button>
      {#if !closed.has(child.path)}
        <ul class="ms-3.5 border-s border-base-300 ps-1.5">
          {@render branch(child)}
        </ul>
      {/if}
    </li>
  {/each}
  {#each folder.docs as doc (doc.key)}
    <li>
      <button
        type="button"
        class={[
          "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1",
          "text-sm transition-colors",
          nav.doc === doc.id
            ? "bg-primary/8 font-medium text-primary"
            : "text-base-content/70 hover:bg-base-200 hover:text-base-content",
        ]}
        title={doc.key}
        onclick={() => {
          nav.doc = doc.id
        }}
      >
        <Icon
          icon={doc.icon}
          class={[
            "size-4 shrink-0",
            nav.doc === doc.id ? "text-primary" : "text-base-content/35",
          ]}
        />
        <span class="min-w-0 flex-1 truncate text-start">{doc.title}</span>
      </button>
    </li>
  {/each}
{/snippet}

<div class="flex flex-col gap-1 p-2">
  {#if status?.ready}
    {#if creating}
      <form
        class="flex items-center gap-1"
        onsubmit={e => {
          e.preventDefault()
          create()
        }}
      >
        <IconInput
          icon="lucide:file-plus"
          label={m.knowledge_path()}
          placeholder={m.knowledge_path_hint()}
          class="w-full"
          bind:value={path}
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
        onclick={() => {
          creating = true
        }}
      >
        <Icon icon="lucide:file-plus" class="size-4" />
        {m.knowledge_new()}
      </button>
    {/if}
    <button
      type="button"
      class={[
        "btn btn-ghost btn-sm justify-start font-normal",
        nav.doc === GRAPH && "bg-primary/8 text-primary",
      ]}
      onclick={() => {
        nav.doc = GRAPH
      }}
    >
      <Icon icon="lucide:waypoints" class="size-4" />
      {m.knowledge_graph()}
    </button>
    <ErrorAlert message={attempt.failure} />
    <ul class="flex flex-col">
      {@render branch(tree)}
    </ul>
  {:else if status?.error}
    <p class="px-2 py-1 text-sm text-error">
      {m.knowledge_unavailable({ error: status.error })}
    </p>
  {:else}
    <p class="flex items-center gap-2 px-2 py-1 text-sm text-base-content/60">
      <span class="loading loading-spinner loading-xs"></span>
      {m.knowledge_starting()}
    </p>
  {/if}
</div>
