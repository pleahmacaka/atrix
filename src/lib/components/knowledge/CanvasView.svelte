<script lang="ts">
import Icon from "@iconify/svelte"
import { zoomIdentity } from "d3-zoom"
import { onMount } from "svelte"
import Markdown from "#lib/components/chat/Markdown.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
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

const drag = (e: PointerEvent, node: CanvasNode) => {
  if (locked || e.button !== 0) {
    return
  }

  e.stopPropagation()

  const start = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }
  const target = e.currentTarget as HTMLElement

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
    <div class="flex flex-wrap items-center gap-1 px-3 py-2">
      <span class="min-w-0 flex-1 truncate text-sm font-semibold">{path}</span>
      {#if !locked}
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onclick={addText}
        >
          <Icon icon="lucide:type" class="size-4" />
          {m.knowledge_canvas_text()}
        </button>
        <div class={["dropdown", picking && "dropdown-open"]}>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => (picking = !picking)}>
            <Icon icon="lucide:file-plus" class="size-4" />
            {m.knowledge_canvas_doc()}
          </button>
          {#if picking}
            <ul
              class={[
                "dropdown-content menu z-30 mt-2 max-h-80 w-64 flex-nowrap overflow-y-auto",
                "rounded-box border border-base-300 bg-base-100 p-2 shadow-lg",
              ]}
            >
              {#each host.knowledge as entry (entry.meta.id)}
                <li>
                  <button
                    type="button"
                    onclick={() => {
                      addDoc(entry.meta.id)
                      picking = false
                    }}
                  >
                    <Icon icon="lucide:file-text" class="size-4" />
                    <span class="truncate">{entry.meta.title}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
        <button
          type="button"
          class={["btn btn-ghost btn-sm", linking && "bg-primary/8 text-primary"]}
          disabled={!selected}
          title={m.knowledge_canvas_connect_hint()}
          onclick={() => (linking = linking ? null : selected)}
        >
          <Icon icon="lucide:spline" class="size-4" />
          {m.knowledge_canvas_connect()}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.knowledge_canvas_delete()}
          title={m.knowledge_canvas_delete()}
          disabled={!selected}
          onclick={remove}
        >
          <Icon icon="lucide:trash-2" class="size-4" />
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          disabled={!dirty || attempt.busy}
          onclick={save}
        >
          <Icon icon="lucide:save" class="size-4" />
          {m.common_save()}
        </button>
      {/if}
      <button
        type="button"
        class={["btn btn-sm btn-square", locked ? "btn-primary" : "btn-ghost"]}
        aria-label={locked ? m.knowledge_unlock() : m.knowledge_lock()}
        title={locked ? m.knowledge_unlock() : m.knowledge_lock()}
        aria-pressed={!locked}
        onclick={() => {
          locked = !locked
          selected = null
          linking = null
        }}
      >
        <Icon icon={locked ? "lucide:pencil" : "lucide:lock"} class="size-4" />
      </button>
    </div>
    {#if conflict}
      <div role="alert" class="alert alert-warning alert-soft m-3 text-sm">
        <Icon icon="lucide:git-compare" class="size-4" />
        <span class="flex-1">{m.knowledge_canvas_conflict()}</span>
        <button type="button" class="btn btn-sm" onclick={() => attempt.run(load)}>
          {m.knowledge_reload()}
        </button>
      </div>
    {/if}
    <ErrorAlert message={attempt.failure} />
    <div
      class="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-base-200/40 active:cursor-grabbing"
      {@attach node => pan(node, t => (view = t), e => !(e.target as Element).closest("[data-node]"))}
    >
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
              "text-sm transition-colors",
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
                      ? node.url
                      : m.knowledge_canvas_note()}
              </span>
            </button>
            {#if node.type === "text"}
              {#if locked}
                <div class="min-h-0 flex-1 overflow-y-auto p-3">
                  <Markdown text={node.text || m.knowledge_canvas_empty()} look="wiki compact" />
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
              <p class="truncate p-3 text-primary">{node.url}</p>
            {:else}
              <p class="p-3 text-xs font-semibold text-base-content/55">{node.label}</p>
            {/if}
          </div>
        {/each}
      </div>
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
