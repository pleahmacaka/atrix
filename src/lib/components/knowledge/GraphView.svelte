<script lang="ts" module>
const positions = new Map<string, { x: number; y: number }>()
</script>

<script lang="ts">
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force"
import { zoomIdentity } from "d3-zoom"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { pan } from "#lib/knowledge/pan.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"

let {
  host,
  focus = null,
  compact = false,
}: { host: HostView; focus?: string | null; compact?: boolean } = $props()

type Point = SimulationNodeDatum & { id: string; title: string }

type Link = { source: string; target: string }

const PAD = 48

const TICKS = 300

let view = $state(zoomIdentity)

let width = $state(0)

let height = $state(0)

let hovered = $state<string | null>(null)

const layout = $derived.by(() => {
  const points: Point[] = host.knowledge.map(e => ({
    id: e.meta.id,
    title: e.meta.title,
    ...positions.get(e.meta.id),
  }))
  const ids = new Set(points.map(p => p.id))
  const links: Link[] = host.knowledge.flatMap(e =>
    e.edges
      .filter(l => ids.has(l.to) && l.to !== e.meta.id)
      .map(l => ({ source: e.meta.id, target: l.to })),
  )

  forceSimulation(points)
    .force(
      "link",
      forceLink<Point, { source: string | Point; target: string | Point }>(
        links.map(l => ({ ...l })),
      )
        .id(p => p.id)
        .distance(90),
    )
    .force("charge", forceManyBody<Point>().strength(-320))
    .force("center", forceCenter<Point>(0, 0))
    .force(
      "collide",
      forceCollide<Point>(p => Math.max(30, p.title.length * 6)),
    )
    .stop()
    .tick(TICKS)

  for (const p of points) {
    positions.set(p.id, { x: p.x ?? 0, y: p.y ?? 0 })
  }

  return { points, links }
})

const near = $derived.by(() => {
  const key = hovered ?? focus
  const set = new Set<string>(key ? [key] : [])

  for (const l of layout.links) {
    if (l.source === key) {
      set.add(l.target)
    }

    if (l.target === key) {
      set.add(l.source)
    }
  }

  return set
})

const at = $derived(new Map(layout.points.map(p => [p.id, p])))

const fit = $derived.by(() => {
  const focused = compact && focus
  const shown = focused
    ? layout.points.filter(p => near.has(p.id))
    : layout.points
  const xs = shown.map(p => p.x ?? 0)
  const ys = shown.map(p => p.y ?? 0)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const k =
    Math.min(
      1.4,
      width / (maxX - minX + PAD * 2),
      height / (maxY - minY + PAD * 2),
    ) || 1

  return {
    k,
    x: width / 2 - ((maxX + minX) / 2) * k,
    y: height / 2 - ((maxY + minY) / 2) * k,
  }
})

const dim = (id: string) => (hovered ?? focus) !== null && !near.has(id)
</script>

{#if host.knowledge.length === 0}
  <EmptyState
    icon="lucide:waypoints"
    title={m.knowledge_empty()}
    text={m.knowledge_empty_hint()}
    centered
  />
{:else}
  <div
    class={[
      "relative min-h-0 cursor-grab overflow-hidden active:cursor-grabbing",
      compact ? "aspect-4/5" : "flex-1",
    ]}
    bind:clientWidth={width}
    bind:clientHeight={height}
    {@attach node => pan(node, t => (view = t))}
  >
    <svg class="absolute inset-0 size-full" aria-label={m.knowledge_graph()}>
      <g
        transform="translate({view.x + fit.x * view.k} {view.y + fit.y * view.k}) scale({fit.k * view.k})"
      >
        {#each layout.links as link (`${link.source}:${link.target}`)}
          {@const from = at.get(link.source)}
          {@const to = at.get(link.target)}
          {#if from && to}
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              class={[
                "transition-opacity",
                near.has(link.source) && near.has(link.target)
                  ? "stroke-primary/60"
                  : "stroke-base-content/20",
                dim(link.source) && dim(link.target) && "opacity-30",
              ]}
              stroke-width="1.5"
            />
          {/if}
        {/each}
        {#each layout.points as point (point.id)}
          <g transform="translate({point.x} {point.y})">
            <a
              href="#{point.id}"
              class={["cursor-pointer transition-opacity", dim(point.id) && "opacity-30"]}
              onclick={e => {
                e.preventDefault()
                nav.doc = point.id
              }}
              onpointerenter={() => (hovered = point.id)}
              onpointerleave={() => (hovered = null)}
            >
              <circle
                r={point.id === focus ? 8 : 6}
                class={point.id === focus ? "fill-primary" : "fill-base-content/45"}
              />
              <text
                y="20"
                text-anchor="middle"
                class={[
                  "fill-base-content",
                  compact ? "text-xs" : "text-sm",
                  point.id === focus && "font-semibold",
                ]}
              >
                {point.title}
              </text>
            </a>
          </g>
        {/each}
      </g>
    </svg>
  </div>
{/if}
