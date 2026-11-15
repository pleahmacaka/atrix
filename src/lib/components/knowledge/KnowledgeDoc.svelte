<script lang="ts">
import Icon from "@iconify/svelte"
import { onDestroy, onMount, untrack } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Island from "#lib/components/ui/Island.svelte"
import Separator from "#lib/components/ui/Separator.svelte"
import { actorDetail, actorName, timeAgo, timeOf } from "#lib/knowledge/actor.ts"
import { GRAPH } from "#lib/knowledge/host.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Loaded, Version } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import ConflictView from "./ConflictView.svelte"
import { type Draft, draftOf, patchOf } from "./draft.ts"
import GraphView from "./GraphView.svelte"
import HistoryPanel from "./HistoryPanel.svelte"
import Properties from "./Properties.svelte"
import RichEditor from "./RichEditor.svelte"
import Toc from "./Toc.svelte"

const AUTOSAVE_MS = 800

let { host, id }: { host: HostView; id: string } = $props()

const attempt = new Attempt()

let loaded = $state<Loaded | null>(null)

let draft = $state<Draft | null>(null)

let conflict = $state<Loaded | null>(null)

let history = $state(false)

let locked = $state(true)

let stale = $state(false)

let root = $state<HTMLElement | null>(null)

let lossy = $state(false)

let timer: ReturnType<typeof setTimeout> | undefined

const load = async () => {
  const next = await host.readDoc(id)

  loaded = next
  draft = draftOf(next)
  conflict = null
  stale = false
}

const dirty = $derived(
  !!loaded && !!draft && JSON.stringify(draftOf(loaded)) !== JSON.stringify(draft),
)

const scope = $derived(
  loaded?.meta.scope === "network"
    ? m.knowledge_scope_network()
    : (loaded?.meta.scope.replace(/^p2p:/, "") ?? ""),
)

const saveState = $derived(
  attempt.busy
    ? m.knowledge_saving()
    : !locked && !dirty
      ? m.knowledge_saved()
      : null,
)

const crumbs = $derived(loaded?.key.split("/").slice(0, -1) ?? [])

const titleOf = (target: string) =>
  host.knowledge.find(e => e.meta.id === target)?.meta.title ?? null

const related = $derived.by(() => {
  if (!loaded) {
    return []
  }

  const outgoing = loaded.edges.map(e => ({ ...e, icon: "lucide:arrow-up-right" }))
  const incoming = host.knowledge.flatMap(e =>
    e.edges
      .filter(l => l.to === id)
      .map(l => ({ to: e.meta.id, rel: l.rel, icon: "lucide:arrow-down-left" })),
  )

  return [...outgoing, ...incoming].filter(e => titleOf(e.to))
})

const hasHeadings = $derived(
  !!draft && draft.body.split("\n").some(l => /^#{2,4} /.test(l)),
)

onMount(() => {
  attempt.run(load)
})

onDestroy(() => clearTimeout(timer))

$effect(() => {
  const change = host.lastChange

  if (!change || change.id !== id || change.etag === loaded?.etag) {
    return
  }

  untrack(() => {
    if (attempt.busy) {
      return
    }

    if (dirty) {
      stale = true
    } else {
      attempt.run(load)
    }
  })
})

const write = (etag: string, next: Draft) =>
  attempt.run(async () => {
    const saved = await host.updateDoc(id, etag, patchOf(next))

    if (!saved.ok) {
      conflict = saved.current

      return
    }

    if (loaded) {
      loaded = {
        ...loaded,
        etag: saved.entry.etag,
        meta: saved.entry.meta,
        edges: saved.entry.edges,
        body: next.body,
      }
    }
  })

$effect(() => {
  if (!dirty || locked || conflict || stale) {
    return
  }

  const snapshot = $state.snapshot(draft)
  const etag = loaded?.etag

  clearTimeout(timer)
  timer = setTimeout(() => {
    if (etag && snapshot && !attempt.busy) {
      write(etag, snapshot)
    }
  }, AUTOSAVE_MS)
})

const revert = (version: Version) =>
  attempt.run(async () => {
    if (!loaded) {
      return
    }

    const saved = await host.revertDoc(id, version.versionId, loaded.etag)

    if (!saved.ok) {
      throw new Error(m.knowledge_changed())
    }

    history = false
    await load()
  })
</script>

{#snippet properties()}
  {#if draft}
    <Island title={m.knowledge_properties()}>
      <Properties {host} {id} bind:draft />
    </Island>
  {/if}
{/snippet}

{#if loaded && draft}
  <div class="scroll-stable min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-8 sm:py-8">
      <article class="mx-auto w-full max-w-2xl min-w-0">
        {#if crumbs.length}
          <nav class="breadcrumbs mb-1 py-0 text-sm text-base-content/50">
            <ul>
              {#each crumbs as crumb, i (i)}
                <li>{crumb}</li>
              {/each}
            </ul>
          </nav>
        {/if}

        <div class="flex flex-wrap items-start justify-between gap-3">
          {#if locked}
            <h1 class="min-w-0 text-2xl leading-tight font-bold tracking-tight">
              {draft.title}
            </h1>
          {:else}
            <input
              class={[
                "input input-ghost h-auto min-w-0 flex-1 px-1 py-0",
                "text-2xl leading-tight font-bold tracking-tight",
              ]}
              aria-label={m.knowledge_title()}
              bind:value={draft.title}
            />
          {/if}
          <div class="flex shrink-0 items-center gap-0.5">
            <span
              class="grid size-8 place-items-center text-base-content/55"
              role="status"
              title={saveState ?? undefined}
              aria-label={saveState ?? undefined}
            >
              {#if attempt.busy}
                <span class="loading loading-spinner loading-xs"></span>
              {:else if saveState}
                <Icon icon="lucide:cloud-check" class="size-4" />
              {/if}
            </span>
            <CopyButton
              text={id}
              label={m.knowledge_copy_id()}
              icon="lucide:link"
              size="sm"
              class="text-base-content/55"
            />
            <Separator vertical />
            <IconButton
              icon="lucide:history"
              label={m.knowledge_history_title()}
              class={[history && "btn-active"]}
              aria-pressed={history}
              onclick={() => {
                history = !history
              }}
            />
            <IconButton
              icon={locked ? "lucide:pencil" : "lucide:lock"}
              label={locked ? m.knowledge_unlock() : m.knowledge_lock()}
              tone={locked ? "primary" : "ghost"}
              title={lossy
                ? m.knowledge_lossy()
                : locked
                  ? m.knowledge_unlock()
                  : m.knowledge_lock()}
              aria-pressed={!locked}
              disabled={locked && lossy}
              onclick={() => {
                locked = !locked
                history = false
              }}
            />
          </div>
        </div>

        <div
          class={[
            "mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm",
            "text-base-content/70",
          ]}
        >
          {#if loaded.meta.tags.length}
            <span class="flex items-center gap-1.5" title={m.knowledge_tags()}>
              <Icon icon="lucide:tag" class="size-4 text-base-content/40" />
              {loaded.meta.tags.join(", ")}
            </span>
          {/if}
          <span class="flex items-center gap-1.5" title={m.knowledge_scope()}>
            <Icon
              icon={loaded.meta.scope === "network" ? "lucide:globe" : "lucide:users"}
              class="size-4 text-base-content/40"
            />
            {scope}
          </span>
          <span
            class="flex min-w-0 items-center gap-1.5"
            title="{actorDetail(loaded.meta.updated_by)}, {timeOf(loaded.meta.updated_at)}"
          >
            <Icon icon="lucide:user-pen" class="size-4 text-base-content/40" />
            <span class="truncate">{actorName(loaded.meta.updated_by)}</span>
            <span class="text-base-content/50">{timeAgo(loaded.meta.updated_at)}</span>
          </span>
        </div>

        {#if loaded.meta.description}
          <p class="mt-2 text-sm text-base-content/60">{loaded.meta.description}</p>
        {/if}

        {#if stale}
          <div role="alert" class="alert alert-warning alert-soft mt-4 text-sm">
            <Icon icon="lucide:git-compare" class="size-4" />
            <span class="flex-1">{m.knowledge_changed()}</span>
            <button type="button" class="btn btn-sm" onclick={() => attempt.run(load)}>
              {m.knowledge_reload()}
            </button>
          </div>
        {/if}
        {#if lossy}
          <div role="alert" class="alert alert-info alert-soft mt-4 text-sm">
            <Icon icon="lucide:lock" class="size-4" />
            {m.knowledge_lossy()}
          </div>
        {/if}
        <ErrorAlert message={attempt.failure} />

        {#if !locked}
          <div class="mt-4 lg:hidden">
            {@render properties()}
          </div>
        {/if}

        <div class="mt-8">
          {#if history}
            <HistoryPanel {host} {id} etag={loaded.etag} onrevert={revert} />
          {:else if conflict}
            <ConflictView
              base={loaded.body}
              mine={draft.body}
              theirs={conflict.body}
              busy={attempt.busy}
              onsave={body => draft && conflict && write(conflict.etag, { ...draft, body })}
              oncancel={() => attempt.run(load)}
            />
          {:else}
            <RichEditor
              markdown={draft.body}
              editable={!locked}
              title={titleOf}
              open={target => {
                nav.doc = target
              }}
              onchange={body => {
                if (draft) {
                  draft.body = body
                }
              }}
              bind:root
              bind:lossy
            />
          {/if}
        </div>
      </article>

      <aside class="hidden w-56 shrink-0 lg:block">
        <div class="sticky top-0 flex flex-col gap-3">
          {#if hasHeadings}
            <Island title={m.knowledge_toc()}>
              <Toc markdown={draft.body} {root} />
            </Island>
          {/if}
          <Island title={m.knowledge_graph()}>
            {#snippet action()}
              <IconButton
                icon="lucide:maximize-2"
                label={m.knowledge_graph_all()}
                size="xs"
                iconClass="size-3.5"
                class="-my-1"
                onclick={() => {
                  nav.doc = GRAPH
                }}
              />
            {/snippet}
            <div class="overflow-hidden rounded-field bg-inset/40">
              <GraphView {host} focus={id} compact />
            </div>
            {#if related.length}
              <ul class="mt-2 flex flex-col gap-0.5">
                {#each related as edge (`${edge.icon}:${edge.to}:${edge.rel}`)}
                  <li>
                    <button
                      type="button"
                      class={[
                        "flex w-full cursor-pointer items-center gap-2 rounded-field",
                        "px-2 py-1 text-start text-sm text-base-content/70",
                        "transition-colors duration-150 hover:bg-base-content/8",
                        "hover:text-base-content",
                      ]}
                      onclick={() => {
                        nav.doc = edge.to
                      }}
                    >
                      <Icon icon={edge.icon} class="size-3.5 shrink-0 text-base-content/40" />
                      <span class="min-w-0 flex-1 truncate">{titleOf(edge.to)}</span>
                      <span class="max-w-1/3 truncate text-xs text-base-content/40" title={edge.rel}>
                        {edge.rel}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </Island>
          {#if !locked}
            {@render properties()}
          {/if}
        </div>
      </aside>
    </div>
  </div>
{:else}
  <div class="grid flex-1 place-items-center p-4">
    {#if attempt.failure}
      <ErrorAlert message={attempt.failure} />
    {:else}
      <span class="loading loading-spinner opacity-60"></span>
    {/if}
  </div>
{/if}
