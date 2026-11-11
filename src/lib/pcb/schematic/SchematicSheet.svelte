<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import { derivedQuery, loadDerived, type Outputs } from "../derived.ts"
import { saveFile } from "../save.ts"
import { TOOLBAR } from "../ToolChip.svelte"
import { DERIVED, type SchematicIndex, type SheetLabels } from "../types.ts"
import {
  centerOn,
  findLabels,
  fitView,
  MM,
  type View,
  zoomAt,
} from "./sheet.ts"

let {
  index,
  outputs,
  title,
}: { index: SchematicIndex; outputs: Outputs; title: string } = $props()

const MAX_SCALE = MM * 6

const READABLE_SCALE = MM * 1.5

let active = $state(0)

let canvas = $state<HTMLElement>()

let box = $state({ width: 0, height: 0 })

let layer = $state<HTMLElement>()

let view: View = { scale: 1, x: 0, y: 0 }

let zoom = $state(1)

let naturalWidth = $state(0)

let naturalHeight = $state(0)

let fitted = $state(true)

let dragging = $state(false)

let query = $state("")

let current = $state(0)

let saving = $state(false)

let saveFailed = $state(false)

const sheet = $derived(index.sheets[active] ?? index.sheets[0])

const loaded = derivedQuery<string>(
  () => outputs,
  () => DERIVED.sheet(sheet?.file ?? ""),
  { enabled: () => !!sheet, body: "text" },
)

const svg = $derived(loaded.data ?? null)

const labelled = derivedQuery<SheetLabels>(
  () => outputs,
  () => DERIVED.sheetLabels(sheet?.file ?? ""),
  { enabled: () => !!sheet },
)

const origin = $derived(
  labelled.data?.origin ?? {
    x: 0,
    y: 0,
    width: naturalWidth / MM,
    height: naturalHeight / MM,
  },
)

const matches = $derived(findLabels(labelled.data?.labels ?? [], query))

const url = $derived(
  svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null,
)

const percent = $derived(Math.round((zoom / MM) * 100))

const filename = $derived(
  `${title.trim() || "schematic"}-${sheet?.file.replace(".svg", "") ?? "sheet"}`,
)

const REM = Number.parseFloat(
  getComputedStyle(document.documentElement).fontSize,
)

const pad = () => REM * 2

const fitTarget = () => fitView(origin, box, pad())

let frame = 0

let settle: ReturnType<typeof setTimeout> | undefined

const paint = () => {
  frame = 0
  zoom = view.scale

  if (layer) {
    layer.style.transform = `translate(${view.x / REM}rem, ${view.y / REM}rem) scale(${view.scale / MM})`
  }
}

const show = (next: View) => {
  view = next
  layer?.style.setProperty("will-change", "transform")
  clearTimeout(settle)
  settle = setTimeout(() => layer?.style.removeProperty("will-change"), 150)

  if (!frame) {
    frame = requestAnimationFrame(paint)
  }
}

const pick = (i: number) => {
  active = i
  fitted = true
  query = ""
}

$effect(() => {
  const link = url

  return () => {
    if (link) {
      URL.revokeObjectURL(link)
    }
  }
})

$effect(() => {
  if (!canvas) {
    return
  }

  const observer = new ResizeObserver(([e]) => {
    if (e) {
      box = { width: e.contentRect.width, height: e.contentRect.height }
    }
  })

  observer.observe(canvas)

  return () => observer.disconnect()
})

$effect(() => {
  if (fitted && layer && origin.width > 0 && box.width > 0) {
    show(fitTarget())
  }
})

const clamp = (scale: number) =>
  Math.min(Math.max(scale, fitTarget().scale * 0.5), MAX_SCALE)

const zoomTo = (scale: number, px = box.width / 2, py = box.height / 2) => {
  fitted = false
  show(zoomAt(view, clamp(scale), px, py))
}

const fit = () => {
  fitted = true
  show(fitTarget())
}

const focusMatch = (i: number) => {
  const label = matches[i]

  if (!label) {
    return
  }

  current = i
  fitted = false
  show(centerOn(label, origin, Math.max(view.scale, READABLE_SCALE), box))
}

const step = (delta: number) => {
  if (matches.length > 0) {
    focusMatch((current + delta + matches.length) % matches.length)
  }
}

$effect(() => {
  const found = matches.length > 0

  untrack(() => {
    current = 0

    if (found) {
      focusMatch(0)
    }
  })
})

$effect(() => {
  const el = canvas

  if (!el) {
    return
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()

    const rect = el.getBoundingClientRect()

    zoomTo(
      view.scale * Math.exp(-e.deltaY * 0.0015),
      e.clientX - rect.left,
      e.clientY - rect.top,
    )
  }

  el.addEventListener("wheel", onWheel, { passive: false })

  return () => el.removeEventListener("wheel", onWheel)
})

const pointers = new Map<number, { x: number; y: number }>()

const local = (e: PointerEvent) => {
  const rect = canvas?.getBoundingClientRect()

  return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
}

const down = (e: PointerEvent) => {
  canvas?.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, local(e))
  dragging = true
}

const move = (e: PointerEvent) => {
  const prev = pointers.get(e.pointerId)

  if (!prev) {
    return
  }

  const next = local(e)
  const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1]

  pointers.set(e.pointerId, next)
  fitted = false

  if (!other) {
    show({ ...view, x: view.x + next.x - prev.x, y: view.y + next.y - prev.y })

    return
  }

  const before = Math.hypot(prev.x - other.x, prev.y - other.y)
  const after = Math.hypot(next.x - other.x, next.y - other.y)
  const from = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
  const zoomed = zoomAt(
    view,
    before > 0 ? clamp((view.scale * after) / before) : view.scale,
    from.x,
    from.y,
  )

  show({
    ...zoomed,
    x: zoomed.x + (next.x - prev.x) / 2,
    y: zoomed.y + (next.y - prev.y) / 2,
  })
}

const up = (e: PointerEvent) => {
  pointers.delete(e.pointerId)
  dragging = pointers.size > 0
}

const saveSvg = () => {
  if (svg) {
    saveFile(svg, `${filename}.svg`)
  }
}

const savePdf = async () => {
  if (!index.pdf) {
    return
  }

  saving = true
  saveFailed = false

  try {
    const pdf = await loadDerived<ArrayBuffer>(
      outputs,
      DERIVED.sheet(index.pdf),
      "arraybuffer",
    )

    if (!pdf) {
      throw new Error(`${index.pdf} is missing`)
    }

    saveFile(pdf, `${title.trim() || "schematic"}-schematic.pdf`)
  } catch {
    saveFailed = true
  } finally {
    saving = false
  }
}
</script>

<div class="flex size-full min-h-0 flex-col">
  <div role="toolbar" aria-label={m.pcb_schematic_toolbar()} class={[TOOLBAR, "flex-wrap"]}>
    <label class="input input-sm w-full @2xl:w-64">
      <span class="sr-only">{m.pcb_schematic_search()}</span>
      <Icon icon="lucide:search" class="size-4 opacity-60" />
      <input
        type="search"
        placeholder={m.pcb_schematic_search_placeholder()}
        bind:value={query}
        onkeydown={e => {
          if (e.key === "Enter") {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          }
        }}
      />
    </label>
    {#if query.trim()}
      <div class="flex items-center gap-1">
        <span class="text-base-content/70 min-w-12 text-center text-xs tabular-nums">
          {matches.length > 0 ? `${current + 1}/${matches.length}` : m.pcb_schematic_no_results()}
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.pcb_schematic_previous()}
          disabled={matches.length === 0}
          onclick={() => step(-1)}
        >
          <Icon icon="lucide:chevron-up" class="size-4" />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.pcb_schematic_next()}
          disabled={matches.length === 0}
          onclick={() => step(1)}
        >
          <Icon icon="lucide:chevron-down" class="size-4" />
        </button>
      </div>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      <div class="flex items-center">
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.pcb_schematic_zoom_out()}
          onclick={() => zoomTo(view.scale / 1.25)}
        >
          <Icon icon="lucide:minus" class="size-4" />
        </button>
        <span class="text-base-content/70 flex w-12 items-center justify-center text-xs tabular-nums">
          {percent}%
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.pcb_schematic_zoom_in()}
          onclick={() => zoomTo(view.scale * 1.25)}
        >
          <Icon icon="lucide:plus" class="size-4" />
        </button>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onclick={fit}>{m.pcb_schematic_fit()}</button>
      <button
        type="button"
        class="btn btn-ghost btn-sm hidden @2xl:inline-flex"
        onclick={() => zoomTo(MM)}
      >
        100%
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        aria-label={m.pcb_schematic_download_svg()}
        disabled={!svg}
        onclick={saveSvg}
      >
        <Icon icon="lucide:download" class="size-4" />
        <span class="hidden @2xl:inline">SVG</span>
      </button>
      {#if index.pdf}
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          aria-label={m.pcb_schematic_download_pdf()}
          disabled={saving}
          onclick={savePdf}
        >
          {#if saving}
            <span class="loading loading-spinner loading-xs"></span>
          {:else}
            <Icon icon="lucide:file-down" class="size-4" />
          {/if}
          <span class="hidden @2xl:inline">PDF</span>
        </button>
      {/if}
    </div>
  </div>

  {#if saveFailed}
    <div role="alert" class="alert alert-error alert-soft m-2 text-sm">
      {m.pcb_schematic_pdf_failed()}
    </div>
  {/if}

  {#if index.sheets.length > 1}
    <div role="tablist" class="tabs tabs-border border-base-300 shrink-0 border-b px-2">
      {#each index.sheets as s, i (s.file)}
        <button
          type="button"
          role="tab"
          aria-selected={active === i}
          class={["tab tabular-nums", active === i && "tab-active"]}
          onclick={() => pick(i)}
        >
          {i + 1}. {s.title}
        </button>
      {/each}
    </div>
  {/if}

  <section
    bind:this={canvas}
    aria-label={m.pcb_schematic_drawing()}
    class={[
      "bg-base-300 relative min-h-0 flex-1 touch-none overflow-hidden select-none",
      dragging ? "cursor-grabbing" : "cursor-grab",
    ]}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    ondblclick={e => {
      const rect = canvas?.getBoundingClientRect()

      zoomTo(view.scale * 2, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0))
    }}
  >
    {#if url}
      <div
        bind:this={layer}
        class="absolute top-0 left-0 origin-top-left shadow-xl"
        style:width="{(origin.width * MM) / REM}rem"
        style:height="{(origin.height * MM) / REM}rem"
      >
        <img
          src={url}
          alt={m.pcb_schematic_image()}
          draggable="false"
          class="block size-full"
          bind:naturalWidth
          bind:naturalHeight
        />
        <svg
          class="pointer-events-none absolute inset-0 size-full"
          viewBox="{origin.x} {origin.y} {origin.width} {origin.height}"
          aria-hidden="true"
        >
          {#each matches as hit, i (i)}
            <rect
              x={hit.x}
              y={hit.y}
              width={hit.width}
              height={hit.height}
              rx={hit.height * 0.2}
              transform={hit.transform || undefined}
              stroke-width={2 / zoom}
              class={[
                "stroke-warning",
                i === current ? "fill-warning/40" : "fill-warning/15",
              ]}
            />
          {/each}
        </svg>
      </div>
    {:else if loaded.isError || loaded.isSuccess}
      <div class="flex size-full items-center justify-center p-6">
        <div role="alert" class="alert alert-error alert-soft text-sm">
          {m.pcb_schematic_load_failed()}
        </div>
      </div>
    {:else}
      <div class="size-full p-4" aria-busy="true">
        <div class="skeleton size-full"></div>
      </div>
    {/if}
  </section>
</div>
