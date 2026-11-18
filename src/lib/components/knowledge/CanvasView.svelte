<script lang="ts">
import Icon from "@iconify/svelte"
import { zoomIdentity } from "d3-zoom"
import { onMount } from "svelte"
import Markdown from "#lib/components/chat/Markdown.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { type Canvas, type CanvasNode, docOf, fileOf } from "#lib/knowledge/canvas.ts"
import { pan } from "#lib/knowledge/pan.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"

let { host, path }: { host: HostView; path: string } = $props()

const SIZE = { width: 260, height: 140 }

const NODE_ICONS: Record<CanvasNode["type"], string> = {
  text: "lucide:type",
  file: "lucide:file-text",
  link: "lucide:link",
  group: "lucide:group",
}

const attempt = new Attempt()

let canvas = $state<Canvas | null>(null)

let etag = $state<string | null>(null)

let saved = $state("")

let view = $state(zoomIdentity)

let locked = $state(true)

let selected = $state<string | null>(null)

let linking = $state<string | null>(null)

let picking = $state(false)

let conflict = $state(false)

let query = $state("")

const title = $derived(path.split("/").at(-1)?.replace(/.canvas$/, "") ?? path)

const docs = $derived(
  host.knowledge.filter(e =>
    e.meta.title.toLowerCase().includes(query.trim().toLowerCase()),
  ),
)

const load = async () => {
  const loaded = await host.readCanvas(path)

  canvas = loaded.canvas
  etag = loaded.etag
  saved = JSON.stringify(loaded.canvas)
  conflict = false
}

onMount(() => {
  attempt.run(load)
})

const dirty = $derived(!!canvas && JSON.stringify(canvas) !== saved)

const titleOf = (node: CanvasNode) =>
  node.type === "file"
    ? (host.knowledge.find(e => e.meta.id === docOf(node.file))?.meta.title ?? node.file)
    : ""

const center = (node: CanvasNode) => ({
  x: node.x + node.width / 2,
  y: node.y + node.height / 2,
})

const place = () => {
  const count = canvas?.nodes.length ?? 0

  return { x: 40 + (count % 4) * 300, y: 40 + Math.floor(count / 4) * 180, ...SIZE }
}

const addText = () => {
  canvas?.nodes.push({ ...place(), id: crypto.randomUUID(), type: "text", text: "" })
}

const addDoc = (docId: string) => {
  canvas?.nodes.push({
    ...place(),
    id: crypto.randomUUID(),
    type: "file",
    file: fileOf(docId),
  })
}

const remove = () => {
  if (!canvas || !selected) {
    return
  }

  canvas.nodes = canvas.nodes.filter(n => n.id !== selected)
  canvas.edges = canvas.edges.filter(e => e.fromNode !== selected && e.toNode !== selected)
  selected = null
}

const pick = (id: string) => {
  if (locked) {
    const node = canvas?.nodes.find(n => n.id === id)

    if (node?.type === "file") {
      nav.doc = docOf(node.file)
    }

    return
  }

  if (linking && linking !== id) {
    canvas?.edges.push({
      id: crypto.randomUUID(),
      fromNode: linking,
      toNode: id,
      toEnd: "arrow",
    })
    linking = null

    return
  }

  selected = id
}

const drag = (
  e: PointerEvent & { currentTarget: HTMLElement },
  node: CanvasNode,
) => {
  if (locked || e.button !== 0) {
    return
  }

  e.stopPropagation()

  const start = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }
  const target = e.currentTarget

  target.setPointerCapture(e.pointerId)

  const move = (ev: PointerEvent) => {
    node.x = Math.round(start.nodeX + (ev.clientX - start.x) / view.k)
    node.y = Math.round(start.nodeY + (ev.clientY - start.y) / view.k)
  }

  target.addEventListener("pointermove", move)
  target.addEventListener(
    "pointerup",
    () => target.removeEventListener("pointermove", move),
    { once: true },
  )
}

const save = () =>
  attempt.run(async () => {
    if (!canvas) {
      return
    }

    const result = await host.saveCanvas(path, etag, $state.snapshot(canvas))

    if (result.ok) {
      etag = result.entry.etag
      saved = JSON.stringify(canvas)
    } else {
      conflict = true
    }
  })
</script>

{#if canvas}
  <div class="flex min-h-0 flex-1 flex-col">
    <PageHeader icon="lucide:layout-dashboard" {title}>
      {#snippet actions()}
        {#if !locked}
          <IconButton icon="lucide:type" label={m.knowledge_canvas_text()} onclick={addText} />
          <Popover
            label={m.knowledge_canvas_doc()}
            placement="bottom-end"
            width="w-72"
            sheet
            bind:open={picking}
          >
            {#snippet trigger(p)}
              <IconButton
                {...p}
                icon="lucide:file-plus"
                label={m.knowledge_canvas_doc()}
                onclick={() => {
                  query = ""
                }}
              />
            {/snippet}
            <SearchField bind:value={query} data-autofocus class="mb-1" />
            {#each docs as entry (entry.meta.id)}
              <MenuItem
                icon="lucide:file-text"
                label={entry.meta.title}
                onclick={() => {
                  addDoc(entry.meta.id)
                  picking = false
                }}
              />
            {:else}
              <EmptyState icon="lucide:file-search" text={m.common_no_results()} />
            {/each}
          </Popover>
          <IconButton
            icon="lucide:spline"
            label={m.knowledge_canvas_connect()}
            title={m.knowledge_canvas_connect_hint()}
            class={[linking && "bg-primary/8 text-primary"]}
            disabled={!selected}
            aria-pressed={!!linking}
            onclick={() => (linking = linking ? null : selected)}
          />
          <IconButton
            icon="lucide:trash-2"
            label={m.knowledge_canvas_delete()}
            disabled={!selected}
            onclick={remove}
          />
          <IconButton
            icon="lucide:save"
            label={m.common_save()}
            tone="primary"
            busy={attempt.busy}
            disabled={!dirty || attempt.busy}
            onclick={save}
          />
        {/if}
        <IconButton
          icon={locked ? "lucide:pencil" : "lucide:lock"}
          label={locked ? m.knowledge_unlock() : m.knowledge_lock()}
          tone={locked ? "primary" : "ghost"}
          aria-pressed={!locked}
          onclick={() => {
            locked = !locked
            selected = null
            linking = null
          }}
        />
      {/snippet}
    </PageHeader>
    {#if conflict || attempt.failure}
      <div class="px-4 pb-2 sm:px-6">
        {#if conflict}
          <div role="alert" class="alert alert-warning alert-soft text-sm">
            <Icon icon="lucide:git-compare" class="size-4" />
            <span class="flex-1">{m.knowledge_canvas_conflict()}</span>
            <button type="button" class="btn btn-sm" onclick={() => attempt.run(load)}>
              {m.knowledge_reload()}
            </button>
          </div>
        {/if}
        <ErrorAlert message={attempt.failure} />
      </div>
    {/if}
    <div
      class={[
        "relative min-h-0 flex-1 cursor-grab overflow-hidden bg-inset/40",
        "active:cursor-grabbing",
      ]}
      {@attach node =>
        pan(
          node,
          t => (view = t),
          e => !(e.target instanceof Element && e.target.closest("[data-node]")),
        )}
    >
      {#if canvas.nodes.length === 0}
        <div class="pointer-events-none absolute inset-0 flex">
          <EmptyState
            icon="lucide:layout-dashboard"
            title={m.knowledge_canvas_empty()}
            text={locked
              ? m.knowledge_canvas_empty_hint()
              : m.knowledge_canvas_add_hint()}
            centered
          />
        </div>
      {/if}
      <div
        class="absolute top-0 left-0 m-10 origin-top-left"
        style:transform="translate({view.x}px, {view.y}px) scale({view.k})"
      >
        <svg
          class="pointer-events-none absolute overflow-visible"
          width="1"
          height="1"
          aria-hidden="true"
        >
          {#each canvas.edges as edge (edge.id)}
            {@const from = canvas.nodes.find(n => n.id === edge.fromNode)}
            {@const to = canvas.nodes.find(n => n.id === edge.toNode)}
            {#if from && to}
              <line
                x1={center(from).x}
                y1={center(from).y}
                x2={center(to).x}
                y2={center(to).y}
                class="stroke-base-content/35"
                stroke-width="2"
              />
            {/if}
          {/each}
        </svg>
        {#each canvas.nodes as node (node.id)}
          <div
            data-node
            class={[
              "absolute flex flex-col overflow-hidden rounded-box border bg-base-100",
              "text-sm transition-colors duration-140",
              selected === node.id || linking === node.id
                ? "border-primary"
                : "border-base-300",
            ]}
            style:left="{node.x}px"
            style:top="{node.y}px"
            style:width="{node.width}px"
            style:height="{node.height}px"
          >
            <button
              type="button"
              class={[
                "flex w-full items-center gap-2 px-3 py-1.5",
                "text-start text-xs font-semibold text-base-content/55",
                locked ? "cursor-pointer" : "cursor-move",
              ]}
              onpointerdown={e => drag(e, node)}
              onclick={() => pick(node.id)}
            >
              <Icon
                icon={NODE_ICONS[node.type]}
                class={["size-3.5 shrink-0", node.type === "file" && "text-primary"]}
              />
              <span class="min-w-0 truncate">
                {node.type === "file"
                  ? titleOf(node)
                  : node.type === "group"
                    ? (node.label ?? "")
                    : node.type === "link"
                      ? m.knowledge_canvas_link()
                      : m.knowledge_canvas_note()}
              </span>
            </button>
            {#if node.type === "text"}
              {#if locked}
                <div class="content-fixed min-h-0 flex-1 overflow-y-auto p-3">
                  <Markdown
                    text={node.text || m.knowledge_canvas_text_empty()}
                    look="wiki compact"
                  />
                </div>
              {:else}
                <textarea
                  class="min-h-0 flex-1 resize-none bg-transparent p-3 outline-none"
                  aria-label={m.knowledge_canvas_text()}
                  bind:value={node.text}
                ></textarea>
              {/if}
            {:else if node.type === "file"}
              <p class="min-h-0 flex-1 overflow-hidden px-3 py-2 text-base-content/60">
                {host.knowledge.find(e => e.meta.id === docOf(node.file))?.meta.description}
              </p>
            {:else if node.type === "link"}
              <p class="truncate p-3 text-primary" title={node.url}>{node.url}</p>
            {:else}
              <p class="p-3 text-xs font-semibold text-base-content/55">{node.label}</p>
            {/if}
          </div>
        {/each}
      </div>
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
