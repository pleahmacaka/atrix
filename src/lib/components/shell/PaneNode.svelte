<script lang="ts">
import { trackPointer } from "#lib/components/ui/pointer.ts"
import { m } from "#lib/paraglide/messages.js"
import { type Node, panes, type Split } from "#lib/store/panes.svelte.ts"
import PaneNode from "./PaneNode.svelte"
import PaneView from "./PaneView.svelte"

let { node }: { node: Node } = $props()

let box = $state<HTMLDivElement>()

const STEP = 0.05

const arrow = (split: Split) =>
  split.dir === "row"
    ? { back: "ArrowLeft", forward: "ArrowRight" }
    : { back: "ArrowUp", forward: "ArrowDown" }

const apply = (split: Split, ratio: number) => {
  const rect = box?.getBoundingClientRect()

  if (!rect) {
    return
  }

  panes.resize(split.id, ratio, split.dir === "row" ? rect.width : rect.height)
}

const drag = (e: PointerEvent) => {
  if (node.kind !== "split") {
    return
  }

  const split = node
  const rect = box?.getBoundingClientRect()

  if (!rect) {
    return
  }

  trackPointer(e, p =>
    apply(
      split,
      split.dir === "row"
        ? (p.clientX - rect.left) / rect.width
        : (p.clientY - rect.top) / rect.height,
    ),
  )
}

const nudge = (e: KeyboardEvent) => {
  if (node.kind !== "split") {
    return
  }

  const { back, forward } = arrow(node)

  if (e.key !== back && e.key !== forward) {
    return
  }

  e.preventDefault()
  apply(node, node.ratio + (e.key === back ? -STEP : STEP))
}
</script>

{#if node.kind === "leaf"}
  <PaneView leaf={node} />
{:else}
  <div
    bind:this={box}
    class={["flex min-h-0 min-w-0 flex-1", node.dir === "col" && "flex-col"]}
  >
    <div class="flex min-h-0 min-w-0 basis-0 flex-col" style:flex-grow={node.ratio}>
      <PaneNode node={node.a} />
    </div>
    <button
      type="button"
      aria-label={m.shell_resize_pane()}
      class={[
        "relative z-10 shrink-0 bg-base-300 transition-colors",
        "hover:bg-primary/60 focus-visible:bg-primary/60 active:bg-primary",
        node.dir === "row" ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
      ]}
      onpointerdown={drag}
      ondblclick={() => panes.reset(node.id)}
      onkeydown={nudge}
    >
      <span
        class={[
          "absolute",
          node.dir === "row" ? "inset-y-0 -inset-x-1.5" : "inset-x-0 -inset-y-1.5",
        ]}
      ></span>
    </button>
    <div
      class="flex min-h-0 min-w-0 basis-0 flex-col"
      style:flex-grow={1 - node.ratio}
    >
      <PaneNode node={node.b} />
    </div>
  </div>
{/if}
