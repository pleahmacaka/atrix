<script lang="ts">
import { select } from "d3-selection"
import { type ZoomBehavior, zoom, zoomIdentity } from "d3-zoom"
import type { Snippet } from "svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { derivedQuery, type Outputs, type Status, status } from "../derived.ts"
import RoutingPanel from "../live/RoutingPanel.svelte"
import { type LiveSource, Routing } from "../live/routing.svelte.ts"
import type { LiveRender } from "../live/types.ts"
import ToolChip, { SEGMENTS, TOOLBAR } from "../ToolChip.svelte"
import { palette } from "../three/palette.svelte.ts"
import { type Artwork, type Copper, DERIVED, type Pcb, type Side } from "../types.ts"
import { rem } from "../units.ts"
import { BACK_SILK, BACKGROUND, boundsOf, colorOf, EDGE, holesOf, pathOf, SILK } from "./artwork.ts"

let {
  outputs,
  placeholder,
  live = null,
}: {
  outputs: Outputs | null
  placeholder: Snippet<[Status]>
  live?: LiveSource | null
} = $props()

const EDGE_LAYER = "Edge.Cuts"

const PARTS_LAYER = m.pcb_artwork_parts()

const FRONT_SILK = "F.Silkscreen"

const PAD_ZOOM = 30

const pcb = derivedQuery<Pcb>(() => outputs, () => DERIVED.pcb)

const copper = derivedQuery<Copper>(() => outputs, () => DERIVED.copper)

const artwork = derivedQuery<Artwork>(() => outputs, () => DERIVED.artwork)

const routing = new Routing(() => live, () => !!copper.data)

let side = $state<Side>("top")

let hidden = $state<string[]>([])

let contrast = $state(false)

let hovered = $state<string | null>(null)

let pad = $state<string | null>(null)

let tip = $state({ x: 0, y: 0 })

let view = $state(zoomIdentity)

let width = $state(0)

let height = $state(0)

let resetView = () => {}

const focus = $derived(routing.hoveredNet ?? routing.pinnedNet ?? hovered)

const seed = $derived(routing.render)

const art = $derived.by(() => {
  const data = copper.data

  if (!data) {
    return null
  }

  const layers = data.layers.map(l => ({
    name: l.name,
    color: colorOf(l.name),
    nets: Object.entries(data.nets).flatMap(([net, byLayer]) => {
      const polygons = byLayer[l.name]

      return polygons?.length ? [{ net, d: pathOf(polygons) }] : []
    }),
  }))

  return {
    layers,
    outline: pathOf([data.outline]),
    plated: holesOf(data.drills.filter(d => d.plated)),
    unplated: holesOf(data.drills.filter(d => !d.plated)),
    bounds: boundsOf(data),
  }
})

const ordered = <T,>(layers: T[]) => (side === "top" ? layers.toReversed() : layers)

const stack = $derived(art ? ordered(art.layers) : [])

const seedCopper = $derived(ordered((routing.layers.data ?? []).filter(l => l.layer.endsWith(".Cu"))))

const seedOther = $derived(
  (routing.layers.data ?? []).filter(l => l.layer === EDGE_LAYER || (l.layer === FRONT_SILK && side === "top")),
)

const active = $derived((seed ? seedCopper.at(-1)?.layer : stack.at(-1)?.name) ?? null)

const silk = $derived.by(() => {
  const name = side === "top" ? FRONT_SILK : "B.Silkscreen"
  const polygons = artwork.data?.silk[name]

  return polygons
    ? { name, color: side === "top" ? SILK : BACK_SILK, d: pathOf(polygons) }
    : null
})

const colorOfAny = (name: string) =>
  name.endsWith(".Cu") ? colorOf(name) : name === EDGE_LAYER ? EDGE : SILK

const toggles = $derived(
  seed
    ? [...seedCopper.toReversed(), ...seedOther].map(l => ({ name: l.layer, color: colorOfAny(l.layer) }))
    : [
        ...(art?.layers ?? []).map(l => ({ name: l.name, color: l.color })),
        { name: EDGE_LAYER, color: EDGE },
        silk ? { name: silk.name, color: silk.color } : { name: PARTS_LAYER, color: SILK },
      ],
)

const bounds = $derived(
  art?.bounds ??
    (seed
      ? {
          x0: seed.meta.originX,
          y0: seed.meta.originY,
          x1: seed.meta.originX + seed.meta.width,
          y1: seed.meta.originY + seed.meta.height,
        }
      : null),
)

const scale = $derived.by(() => {
  if (!bounds || !width || !height) {
    return 0
  }

  const { x0, y0, x1, y1 } = bounds

  return Math.min(width / (x1 - x0), height / (y1 - y0)) * 0.92
})

const fit = $derived.by(() => {
  if (!bounds || !scale) {
    return ""
  }

  const { x0, y0, x1, y1 } = bounds
  const mirror = side === "bottom" ? -1 : 1

  return `translate(${width / 2} ${height / 2}) scale(${mirror * scale} ${scale}) translate(${-(x0 + x1) / 2} ${-(y0 + y1) / 2})`
})

const pads = $derived(
  !seed && scale * view.k >= PAD_ZOOM ? (artwork.data?.pads ?? []).filter(p => p.side === side) : [],
)

const label = (x: number, y: number) =>
  `translate(${x} ${y})${side === "bottom" ? " scale(-1 1)" : ""}`

type Part = {
  ref: string
  box: { x: number; y: number; w: number; h: number } | null
  at: [number, number]
  size: number
}

const parts = $derived(
  (pcb.data?.footprints ?? []).flatMap((f): Part[] => {
    if (f.side !== side) {
      return []
    }

    if (f.box3d) {
      const [x0, y0] = f.box3d.min
      const [x1, y1] = f.box3d.max
      const w = x1 - x0
      const h = y1 - y0

      return [{
        ref: f.ref,
        box: { x: x0, y: y0, w, h },
        at: [x0 + w / 2, y0 + h / 2],
        size: Math.max(0.3, Math.min(w / (f.ref.length * 0.7), h * 0.45, 1.2)),
      }]
    }

    return f.at ? [{ ref: f.ref, box: null, at: f.at, size: 0.5 }] : []
  }),
)

const shown = (name: string) => !hidden.includes(name)

const toggle = (name: string) => {
  hidden = shown(name) ? [...hidden, name] : hidden.filter(h => h !== name)
}

const netAt = (target: EventTarget | null) =>
  target instanceof SVGElement ? (target.dataset.net ?? null) : null

const padAt = (target: EventTarget | null) =>
  target instanceof SVGElement ? (target.dataset.pad ?? null) : null

const layerOpacity = (name: string) => (contrast && name !== active ? 0.2 : 0.85)

const origin = (render: LiveRender) => `translate(${render.meta.originX} ${render.meta.originY})`

const zoomable = (node: HTMLElement) => {
  const behavior: ZoomBehavior<HTMLElement, unknown> = zoom<HTMLElement, unknown>()
    .scaleExtent([0.5, 60])
    .wheelDelta(e => {
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002
      const pinch = e.ctrlKey && Math.abs(e.deltaY) < 50

      return -e.deltaY * unit * (pinch ? 10 : 1)
    })
    .filter(e => (!e.ctrlKey || e.type === "wheel") && !e.button && !(e.target instanceof Element && e.target.closest("button")))
    .on("start", () => {
      const w = node.clientWidth
      const h = node.clientHeight

      behavior.translateExtent([
        [-w, -h],
        [2 * w, 2 * h],
      ])
    })
    .on("zoom", e => {
      view = e.transform
    })
  const selection = select(node).call(behavior)

  resetView = () => selection.call(behavior.transform, zoomIdentity)
  selection.on("dblclick.zoom", resetView)

  return {
    destroy: () => {
      selection.on(".zoom", null)
    },
  }
}

const probe = (node: HTMLElement) => {
  const move = (e: PointerEvent) => {
    const rect = node.getBoundingClientRect()

    hovered = netAt(e.target)
    pad = padAt(e.target)
    tip = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const leave = () => {
    hovered = null
  }

  const click = (e: MouseEvent) => {
    if (!(e.target instanceof Element && e.target.closest("button"))) {
      routing.pinnedNet = netAt(e.target)
    }
  }

  node.addEventListener("pointermove", move)
  node.addEventListener("pointerleave", leave)
  node.addEventListener("click", click)

  return {
    destroy: () => {
      node.removeEventListener("pointermove", move)
      node.removeEventListener("pointerleave", leave)
      node.removeEventListener("click", click)
    },
  }
}

const drawIn = (svg: string) => (node: SVGGElement) => {
  if (!svg) {
    return
  }

  node.querySelectorAll<SVGGeometryElement>("path, line, polyline").forEach((el, i) => {
    el.setAttribute("pathLength", "1")
    el.style.animationDelay = `${(i % 120) * 8}ms`
  })
}
</script>

<svelte:window
  onkeydown={e => {
    if (e.key === "Escape") {
      routing.pinnedNet = null
      routing.hoveredNet = null
      hovered = null
    }
  }}
/>

{#snippet rats(render: LiveRender, preview: boolean)}
  <g transform={origin(render)}>
    {#each render.unrouted as u, i (i)}
      <g class={["rat", preview ? "preview" : u.net === focus && "hot"]}>
        <line x1={u.from[0]} y1={u.from[1]} x2={u.to[0]} y2={u.to[1]} />
        <circle cx={u.from[0]} cy={u.from[1]} r="0.35" />
        <circle cx={u.to[0]} cy={u.to[1]} r="0.35" />
      </g>
    {/each}
  </g>
{/snippet}

{#snippet board()}
  {#if seed}
    {#each seedCopper as l (l.layer)}
      {#if shown(l.layer)}
        <g
          class="draw-in"
          transform={origin(seed)}
          style:color={colorOf(l.layer)}
          opacity={layerOpacity(l.layer)}
          {@attach drawIn(l.svg)}
        >
          {@html l.svg}
        </g>
      {/if}
    {/each}
    {#each seedOther as l (l.layer)}
      {#if shown(l.layer)}
        <g transform={origin(seed)} style:color={colorOfAny(l.layer)}>
          {@html l.svg}
        </g>
      {/if}
    {/each}
    <g pointer-events="none" class={[(focus || routing.preview) && "focus"]}>
      {@render rats(seed, false)}
      {#if routing.preview}
        {@render rats(routing.preview, true)}
      {/if}
    </g>
  {:else if art}
    {#each stack as l (l.name)}
      {#if shown(l.name)}
        <g fill={l.color} fill-rule="nonzero" opacity={layerOpacity(l.name)} class="cursor-pointer">
          {#each l.nets as n (n.net)}
            <path d={n.d} data-net={n.net} opacity={focus && focus !== n.net ? 0.2 : 1} />
          {/each}
        </g>
      {/if}
    {/each}
    <g pointer-events="none">
      <path d={art.plated} fill={BACKGROUND} />
      <path
        d={art.unplated}
        fill={BACKGROUND}
        stroke={EDGE}
        stroke-width="1"
        stroke-opacity="0.6"
        vector-effect="non-scaling-stroke"
      />
      {#if shown(EDGE_LAYER)}
        <path d={art.outline} fill="none" stroke={EDGE} stroke-width="1.5" vector-effect="non-scaling-stroke" />
      {/if}
      {#if silk && shown(silk.name)}
        <path d={silk.d} fill={silk.color} />
      {:else if !silk && shown(PARTS_LAYER)}
        <g fill="none" stroke={SILK} stroke-opacity="0.7">
          {#each parts as p (p.ref)}
            {#if p.box}
              <rect
                x={p.box.x}
                y={p.box.y}
                width={p.box.w}
                height={p.box.h}
                stroke-width="1"
                vector-effect="non-scaling-stroke"
              />
            {/if}
          {/each}
        </g>
        <g fill={SILK} text-anchor="middle" dominant-baseline="central">
          {#each parts as p (p.ref)}
            <text transform={label(p.at[0], p.at[1])} font-size={p.size}>{p.ref}</text>
          {/each}
        </g>
      {/if}
    </g>
    {#if pads.length > 0}
      <g fill="white" fill-opacity="0.9" font-size="0.3" text-anchor="middle" dominant-baseline="central">
        {#each pads as p, i (i)}
          <text transform={label(p.at[0], p.at[1])} data-net={p.net} data-pad={`${p.ref} ${p.number}`}>{p.number}</text>
        {/each}
      </g>
    {/if}
  {/if}
{/snippet}

{#if art || seed}
  <div class="flex size-full min-h-0 flex-col">
    <div role="toolbar" aria-label={m.pcb_artwork_toolbar()} class={[TOOLBAR, "flex-wrap"]}>
      <fieldset aria-label={m.pcb_artwork_layers()} class={SEGMENTS}>
        {#each toggles as t (t.name)}
          <ToolChip label={t.name} pressed={shown(t.name)} onclick={() => toggle(t.name)}>
            <span class="size-2 shrink-0 rounded-full" style:background-color={t.color}></span>
            {t.name}
          </ToolChip>
        {/each}
      </fieldset>

      <fieldset aria-label={m.pcb_artwork_side()} class={SEGMENTS}>
        <ToolChip label={m.pcb_artwork_top()} pressed={side === "top"} onclick={() => (side = "top")} />
        <ToolChip label={m.pcb_artwork_bottom()} pressed={side === "bottom"} onclick={() => (side = "bottom")} />
      </fieldset>

      <fieldset aria-label={m.pcb_artwork_view()} class={SEGMENTS}>
        <ToolChip
          label={m.pcb_artwork_contrast()}
          icon="lucide:contrast"
          pressed={contrast}
          iconOnly
          onclick={() => (contrast = !contrast)}
        />
        <ToolChip
          label={m.pcb_artwork_fit()}
          icon="lucide:scan"
          disabled={view === zoomIdentity}
          onclick={() => resetView()}
        >
          <span class="tabular-nums">{Math.round(view.k * 100)}%</span>
        </ToolChip>
      </fieldset>

      {#if routing.available && !routing.open}
        <IconButton
          icon="lucide:panel-right-open"
          label={m.pcb_artwork_expand_panel()}
          class="ml-auto"
          onclick={() => (routing.open = true)}
        />
      {/if}
    </div>

    <div class="flex min-h-0 flex-1 flex-col @5xl:flex-row">
      <div
        class={[
          "relative min-h-0 min-w-0 flex-1 cursor-grab touch-none overflow-hidden",
          "select-none active:cursor-grabbing",
        ]}
        bind:clientWidth={width}
        bind:clientHeight={height}
        use:zoomable
        use:probe
      >
        <svg class="absolute inset-0 size-full" role="img" aria-label={m.pcb_artwork_label()}>
          <rect width="100%" height="100%" fill={BACKGROUND} />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g transform={fit}>
              {@render board()}
            </g>
          </g>
        </svg>

        {#if hovered}
          <div
            class={[
              "pointer-events-none absolute flex items-center gap-2 rounded-field",
              "bg-raised translate-3 px-2 py-1 text-xs shadow-sm",
            ]}
            style:left={rem(tip.x)}
            style:top={rem(tip.y)}
          >
            <span class="size-2 rounded-full" style:background-color={palette.net(hovered)}></span>
            {hovered}
            {#if pad}
              <span class="text-base-content/60">{pad}</span>
            {/if}
          </div>
        {/if}

        {#if routing.pinnedNet}
          <div
            class={[
              "absolute bottom-2 left-2 flex items-center gap-2 rounded-box",
              "bg-raised py-1 pr-1 pl-2 text-xs",
            ]}
          >
            <span class="size-2 rounded-full" style:background-color={palette.net(routing.pinnedNet)}></span>
            {routing.pinnedNet}
            <IconButton
              icon="lucide:x"
              label={m.pcb_artwork_clear_highlight()}
              size="xs"
              onclick={() => (routing.pinnedNet = null)}
            />
          </div>
        {/if}
      </div>

      {#if routing.available && routing.open}
        <RoutingPanel {routing} final={!!art} />
      {/if}
    </div>
  </div>
{:else if copper.isLoading || copper.isError || routing.status.isLoading}
  {@render placeholder(status(copper, routing.status))}
{:else}
  <EmptyState icon="lucide:layers" text={m.pcb_artwork_no_copper()} class="size-full justify-center" />
{/if}

<style>
  .rat {
    stroke: #f43f5e;
    fill: #f43f5e;
    transition: opacity 0.12s;
  }

  .rat circle {
    stroke: none;
  }

  .rat line {
    stroke-width: 0.25;
    stroke-dasharray: 0.6 0.4;
  }

  .focus .rat:not(.hot, .preview) {
    opacity: 0.15;
  }

  .rat.hot line {
    stroke-width: 0.45;
    animation: march 1s linear infinite;
  }

  .rat.preview {
    stroke: #f8fafc;
    fill: #f8fafc;
  }

  @keyframes march {
    to {
      stroke-dashoffset: -1;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .draw-in :global(:is(path, line, polyline)) {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: draw-in 1.4s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
    }
  }

  @keyframes draw-in {
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
