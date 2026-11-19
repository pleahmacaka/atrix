<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import IconButton from "./IconButton.svelte"

export type Viewed = { url: string; name: string }

let {
  image = $bindable(),
  onEdit,
}: { image: Viewed | null; onEdit?: (edited: Blob) => void } = $props()

type Tool = "pen" | "rect" | "text"

type Mark =
  | { tool: "pen"; color: string; width: number; points: [number, number][] }
  | { tool: "rect"; color: string; width: number; from: [number, number]; to: [number, number] }
  | { tool: "text"; color: string; width: number; at: [number, number]; text: string }

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff", "#111827"]

const WIDTHS = [2, 4, 8]

const TOOLS: { id: Tool; icon: string; label: () => string }[] = [
  { id: "pen", icon: "lucide:pencil", label: m.image_pen },
  { id: "rect", icon: "lucide:square", label: m.image_rect },
  { id: "text", icon: "lucide:type", label: m.image_text },
]

let dialog = $state<HTMLDialogElement>()

let canvas = $state<HTMLCanvasElement>()

let editing = $state(false)

let tool = $state<Tool>("pen")

let color = $state(COLORS[0])

let width = $state(WIDTHS[1])

let marks = $state<Mark[]>([])

let drawing = $state<Mark | null>(null)

let typing = $state<{ at: [number, number]; left: number; top: number; text: string } | null>(
  null,
)

let source: HTMLImageElement | null = null

$effect(() => {
  if (image && !dialog?.open) {
    dialog?.showModal()
  }
})

const scale = () => (source ? Math.max(1, source.naturalWidth / 800) : 1)

const draw = (ctx: CanvasRenderingContext2D, mark: Mark) => {
  const size = mark.width * scale()

  ctx.strokeStyle = mark.color
  ctx.fillStyle = mark.color
  ctx.lineWidth = size
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  if (mark.tool === "pen") {
    ctx.beginPath()
    const [[x0, y0] = [0, 0], ...rest] = mark.points

    ctx.moveTo(x0, y0)

    for (const [x, y] of rest) {
      ctx.lineTo(x, y)
    }

    ctx.stroke()
  } else if (mark.tool === "rect") {
    const [x1, y1] = mark.from
    const [x2, y2] = mark.to

    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
  } else {
    ctx.font = `600 ${size * 6}px Pretendard, sans-serif`
    ctx.textBaseline = "top"
    ctx.fillText(mark.text, mark.at[0], mark.at[1])
  }
}

const render = () => {
  const ctx = canvas?.getContext("2d")

  if (!canvas || !ctx || !source) {
    return
  }

  ctx.drawImage(source, 0, 0)

  for (const mark of [...marks, ...(drawing ? [drawing] : [])]) {
    draw(ctx, mark)
  }
}

$effect(() => {
  void marks.length
  void drawing
  render()
})

const startEdit = () => {
  if (!image) {
    return
  }

  const img = new Image()

  img.onload = () => {
    source = img
    editing = true
    requestAnimationFrame(() => {
      if (canvas) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        render()
      }
    })
  }
  img.src = image.url
}

const pointOf = (e: PointerEvent): [number, number] => {
  const r = canvas?.getBoundingClientRect()

  if (!canvas || !r) {
    return [0, 0]
  }

  return [
    ((e.clientX - r.left) / r.width) * canvas.width,
    ((e.clientY - r.top) / r.height) * canvas.height,
  ]
}

const down = (e: PointerEvent & { currentTarget: HTMLCanvasElement }) => {
  const at = pointOf(e)

  if (tool === "text") {
    const r = e.currentTarget.getBoundingClientRect()
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

    commitText()
    typing = { at, left: (e.clientX - r.left) / rem, top: (e.clientY - r.top) / rem, text: "" }

    return
  }

  e.currentTarget.setPointerCapture(e.pointerId)
  drawing =
    tool === "pen"
      ? { tool, color, width, points: [at] }
      : { tool: "rect", color, width, from: at, to: at }
}

const move = (e: PointerEvent) => {
  if (!drawing) {
    return
  }

  const at = pointOf(e)

  drawing =
    drawing.tool === "pen"
      ? { ...drawing, points: [...drawing.points, at] }
      : drawing.tool === "rect"
        ? { ...drawing, to: at }
        : drawing
}

const up = () => {
  if (drawing) {
    marks = [...marks, drawing]
    drawing = null
  }
}

const commitText = () => {
  if (typing?.text.trim()) {
    marks = [...marks, { tool: "text", color, width, at: typing.at, text: typing.text.trim() }]
  }

  typing = null
}

const stopEdit = () => {
  editing = false
  marks = []
  drawing = null
  typing = null
}

const save = () => {
  commitText()
  render()
  canvas?.toBlob(blob => {
    if (blob) {
      onEdit?.(blob)
    }

    stopEdit()
    dialog?.close()
  }, "image/png")
}

const cycle = <T,>(list: T[], value: T) => list[(list.indexOf(value) + 1) % list.length]

const ZOOM = { min: 0.1, max: 16, step: 1.25 }

let stage = $state<HTMLDivElement>()

let content = $state<HTMLElement>()

let view = $state({ scale: 1, x: 0, y: 0 })

let animate = $state(false)

const pointers = new Map<number, { x: number; y: number }>()

let pan: { x: number; y: number; vx: number; vy: number } | null = null

let pinch: { distance: number; scale: number } | null = null

const fit = () => {
  animate = true
  view = { scale: 1, x: 0, y: 0 }
}

$effect(() => {
  void image?.url
  view = { scale: 1, x: 0, y: 0 }
})

const offset = (clientX: number, clientY: number) => {
  const r = stage?.getBoundingClientRect()

  return r ? { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 } : { x: 0, y: 0 }
}

const zoomAt = (next: number, cx: number, cy: number) => {
  const scale = Math.min(ZOOM.max, Math.max(ZOOM.min, next))
  const k = scale / view.scale

  view = { scale, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }
}

const wheel = (e: WheelEvent) => {
  e.preventDefault()
  animate = false

  const c = offset(e.clientX, e.clientY)

  zoomAt(view.scale * Math.exp(-e.deltaY / 400), c.x, c.y)
}

const step = (dir: 1 | -1) => {
  animate = true
  zoomAt(dir > 0 ? view.scale * ZOOM.step : view.scale / ZOOM.step, 0, 0)
}

const toggle = (e: MouseEvent) => {
  if (editing) {
    return
  }

  const natural = content instanceof HTMLImageElement ? content.naturalWidth : 0
  const shown = (content?.getBoundingClientRect().width ?? 0) / view.scale

  if (view.scale !== 1 || !natural || !shown) {
    fit()

    return
  }

  const c = offset(e.clientX, e.clientY)

  animate = true
  zoomAt(natural / shown > 1 ? natural / shown : 2, c.x, c.y)
}

const distance = () => {
  const [a, b] = [...pointers.values()]

  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

const press = (e: PointerEvent & { currentTarget: HTMLDivElement }) => {
  if (editing && e.button === 0 && e.target === canvas) {
    return
  }

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  e.currentTarget.setPointerCapture(e.pointerId)
  animate = false

  if (pointers.size === 2) {
    pan = null
    pinch = { distance: distance(), scale: view.scale }
  } else {
    pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
}

const drag = (e: PointerEvent) => {
  if (!pointers.has(e.pointerId)) {
    return
  }

  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const c = offset((a.x + b.x) / 2, (a.y + b.y) / 2)

    zoomAt((pinch.scale * distance()) / pinch.distance, c.x, c.y)
  } else if (pan) {
    view = { ...view, x: pan.vx + e.clientX - pan.x, y: pan.vy + e.clientY - pan.y }
  }
}

const release = (e: PointerEvent) => {
  pointers.delete(e.pointerId)
  pinch = null
  pan = null
}
</script>

<dialog
  bind:this={dialog}
  class="modal backdrop:bg-base-300/80 backdrop:backdrop-blur-sm"
  aria-label={image?.name ?? ""}
  onclose={() => {
    stopEdit()
    image = null
  }}
>
  <div class="col-start-1 row-start-1 flex size-full flex-col items-center gap-3 px-4 pt-10 pb-4">
    {#if image}
      <div
        bind:this={stage}
        class={["relative min-h-0 w-full flex-1 touch-none overflow-hidden", editing ? "" : "cursor-grab active:cursor-grabbing"]}
        role="application"
        aria-label={image.name}
        onwheel={wheel}
        onpointerdown={press}
        onpointermove={drag}
        onpointerup={release}
        onpointercancel={release}
        ondblclick={toggle}
      >
        <div
          class={["absolute inset-0 grid place-items-center", animate && "transition-transform duration-140"]}
          style:transform="translate({view.x}px, {view.y}px) scale({view.scale})"
        >
          <div class="relative flex max-h-full max-w-full">
            {#if editing}
              <canvas
                bind:this={canvas}
                class={[
                  "max-h-full max-w-full touch-none rounded-box border border-base-300 shadow-2xl",
                  tool === "text" ? "cursor-text" : "cursor-crosshair",
                ]}
                onpointerdown={down}
                onpointermove={move}
                onpointerup={up}
              ></canvas>
              {#if typing}
                <input
                  class="input input-sm absolute w-48"
                  style:left="{typing.left / view.scale}rem"
                  style:top="{typing.top / view.scale}rem"
                  aria-label={m.image_text()}
                  bind:value={typing.text}
                  {@attach node => node.focus()}
                  onkeydown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      commitText()
                    }
                  }}
                  onblur={commitText}
                />
              {/if}
            {:else}
              <img
                bind:this={content}
                src={image.url}
                alt={image.name}
                draggable="false"
                class="max-h-full max-w-full rounded-box border border-base-300 object-contain shadow-2xl select-none"
              />
            {/if}
          </div>
        </div>
      </div>
      <div class="relative z-10 flex shrink-0 flex-wrap items-center justify-center gap-2">
        <div
          class="flex items-center gap-1 rounded-full border border-base-300 bg-base-100 p-1 shadow-lg"
          role="toolbar"
          aria-label={m.image_fit()}
        >
          <IconButton
            icon="lucide:zoom-out"
            label={m.image_zoom_out()}
            class="btn-circle"
            onclick={() => step(-1)}
          />
          <span class="w-14 text-center text-sm tabular-nums text-base-content/70">
            {Math.round(view.scale * 100)}%
          </span>
          <IconButton
            icon="lucide:zoom-in"
            label={m.image_zoom_in()}
            class="btn-circle"
            onclick={() => step(1)}
          />
          <IconButton
            icon="lucide:maximize"
            label={m.image_fit()}
            class="btn-circle"
            onclick={fit}
          />
          {#if onEdit && !editing}
            <IconButton
              icon="lucide:pencil"
              label={m.image_annotate()}
              class="btn-circle"
              onclick={startEdit}
            />
          {/if}
          <IconButton
            icon="lucide:x"
            label={m.common_close()}
            class="btn-circle"
            onclick={() => dialog?.close()}
          />
        </div>
        {#if editing}
          <div
            class="flex items-center gap-1 rounded-full border border-base-300 bg-base-100 p-1 shadow-lg"
            role="toolbar"
            aria-label={m.image_annotate()}
          >
            {#each TOOLS as entry (entry.id)}
              <IconButton
                icon={entry.icon}
                label={entry.label()}
                aria-pressed={tool === entry.id}
                class={["btn-circle", tool === entry.id && "bg-primary/15 text-primary"]}
                onclick={() => {
                  commitText()
                  tool = entry.id
                }}
              />
            {/each}
            <button
              type="button"
              class="btn btn-ghost btn-circle"
              aria-label={m.image_color()}
              title={m.image_color()}
              onclick={() => {
                color = cycle(COLORS, color)
              }}
            >
              <span class="size-4 rounded-full border border-base-300" style:background-color={color}></span>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-circle"
              aria-label={m.image_width()}
              title={m.image_width()}
              onclick={() => {
                width = cycle(WIDTHS, width)
              }}
            >
              <span class="w-4 rounded-full bg-base-content" style:height="{width / 4}rem"></span>
            </button>
            <button type="button" class="btn btn-sm btn-primary rounded-full" onclick={save}>
              {m.common_save()}
            </button>
            <IconButton icon="lucide:x" label={m.common_cancel()} class="btn-circle" onclick={stopEdit} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
