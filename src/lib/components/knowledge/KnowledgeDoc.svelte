<script lang="ts">
import Icon from "@iconify/svelte"
import { onDestroy, onMount, untrack } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import Island from "#lib/components/ui/Island.svelte"
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

let copied = $state(false)

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

const copyId = async () => {
  await navigator.clipboard.writeText(id)
  copied = true
  setTimeout(() => (copied = false), 1600)
}
</script>

{#if loaded && draft}
  <div class="scroll-stable min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-6xl gap-8 px-8 py-8">
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
              class={[
                "flex min-w-20 items-center justify-end gap-1.5 pe-1 text-xs",
                "whitespace-nowrap text-base-content/55",
              ]}
            >
              {#if attempt.busy}
                <span class="loading loading-spinner loading-xs"></span>
                {m.knowledge_saving()}
              {:else if !locked && !dirty}
                <Icon icon="lucide:check" class="size-3.5" />
                {m.knowledge_saved()}
              {/if}
            </span>
            <button
              type="button"
              class="btn btn-sm btn-ghost btn-square text-base-content/55"
              aria-label={m.knowledge_copy_id()}
              title={m.knowledge_copy_id()}
              onclick={copyId}
            >
              <Icon icon={copied ? "lucide:check" : "lucide:link"} class="size-4" />
            </button>
            <span class="mx-1.5 h-5 w-px bg-base-300"></span>
            <button
              type="button"
              class={["btn btn-sm btn-ghost btn-square", history && "btn-active"]}
              aria-label={m.knowledge_history_title()}
              title={m.knowledge_history_title()}
              aria-pressed={history}
              onclick={() => {
                history = !history
              }}
            >
              <Icon icon="lucide:history" class="size-4" />
            </button>
            <button
              type="button"
              class={["btn btn-sm btn-square", locked ? "btn-primary" : "btn-ghost"]}
              aria-label={locked ? m.knowledge_unlock() : m.knowledge_lock()}
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
            >
              <Icon icon={locked ? "lucide:pencil" : "lucide:lock"} class="size-4" />
            </button>
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
            <Icon icon="lucide:globe" class="size-4 text-base-content/40" />
            {loaded.meta.scope}
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
        {#if attempt.failure}
          <div class="mt-4">
            <ErrorAlert message={attempt.failure} />
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
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-square -my-1"
                aria-label={m.knowledge_graph_all()}
                title={m.knowledge_graph_all()}
                onclick={() => {
                  nav.doc = GRAPH
                }}
              >
                <Icon icon="lucide:maximize-2" class="size-3.5" />
              </button>
            {/snippet}
            <div class="overflow-hidden rounded-field bg-base-200/40">
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
                        "transition-colors hover:bg-base-200 hover:text-base-content",
                      ]}
                      onclick={() => {
                        nav.doc = edge.to
                      }}
                    >
                      <Icon icon={edge.icon} class="size-3.5 shrink-0 text-base-content/40" />
                      <span class="min-w-0 flex-1 truncate">{titleOf(edge.to)}</span>
                      <span class="text-xs text-base-content/40">{edge.rel}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </Island>
          {#if !locked}
            <Island title={m.knowledge_properties()}>
              <Properties {host} {id} bind:draft />
            </Island>
          {/if}
        </div>
      </aside>
    </div>
  </div>
{:else}
  <div class="grid flex-1 place-items-center">
    {#if attempt.failure}
      <ErrorAlert message={attempt.failure} />
    {:else}
      <span class="loading loading-spinner opacity-60"></span>
    {/if}
  </div>
{/if}
