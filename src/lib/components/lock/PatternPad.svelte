<script lang="ts">
const DOTS = Array.from({ length: 9 }, (_, i) => ({
  i,
  x: (i % 3) + 0.5,
  y: Math.floor(i / 3) + 0.5,
}))

const HIT = 0.32

let { oncomplete }: { oncomplete: (pattern: string) => void } = $props()

let path = $state<number[]>([])

let pointer = $state<{ x: number; y: number } | null>(null)

let box = $state<SVGSVGElement>()

const at = (e: PointerEvent) => {
  const rect = box?.getBoundingClientRect()

  return rect
    ? {
        x: ((e.clientX - rect.left) / rect.width) * 3,
        y: ((e.clientY - rect.top) / rect.height) * 3,
      }
    : null
}

const visit = (e: PointerEvent) => {
  const p = at(e)

  pointer = p

  if (!p) {
    return
  }

  const hit = DOTS.find(d => Math.hypot(d.x - p.x, d.y - p.y) < HIT)

  if (hit && !path.includes(hit.i)) {
    path = [...path, hit.i]
  }
}

const finish = () => {
  if (path.length > 0) {
    oncomplete(path.join("-"))
  }

  path = []
  pointer = null
}

const last = $derived(path.length ? DOTS[path[path.length - 1]] : null)
</script>

<svg
  bind:this={box}
  viewBox="0 0 3 3"
  class="size-60 touch-none select-none"
  role="img"
  aria-hidden="true"
  onpointerdown={e => {
    e.currentTarget.setPointerCapture(e.pointerId)
    path = []
    visit(e)
  }}
  onpointermove={e => {
    if (e.buttons) {
      visit(e)
    }
  }}
  onpointerup={finish}
  onpointercancel={finish}
>
  {#each path.slice(1) as dot, i (i)}
    {@const from = DOTS[path[i]]}
    <line
      x1={from.x}
      y1={from.y}
      x2={DOTS[dot].x}
      y2={DOTS[dot].y}
      class="stroke-primary"
      stroke-width="0.08"
      stroke-linecap="round"
    />
  {/each}
  {#if last && pointer}
    <line
      x1={last.x}
      y1={last.y}
      x2={pointer.x}
      y2={pointer.y}
      class="stroke-primary/50"
      stroke-width="0.06"
      stroke-linecap="round"
    />
  {/if}
  {#each DOTS as dot (dot.i)}
    <circle
      cx={dot.x}
      cy={dot.y}
      r={path.includes(dot.i) ? 0.14 : 0.09}
      class={path.includes(dot.i) ? "fill-primary" : "fill-base-content/40"}
    />
  {/each}
</svg>
