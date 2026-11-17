<script lang="ts">
import { trackPointer } from "#lib/components/ui/pointer.ts"
import { m } from "#lib/paraglide/messages.js"
import { type Node, panes } from "#lib/store/panes.svelte.ts"
import PaneNode from "./PaneNode.svelte"
import PaneView from "./PaneView.svelte"

let { node }: { node: Node } = $props()

let box = $state<HTMLDivElement>()

const drag = (e: PointerEvent) => {
  if (node.kind !== "split" || !box) {
    return
  }

  const split = node
  const rect = box.getBoundingClientRect()

  trackPointer(e, p => {
    const ratio =
      split.dir === "row"
        ? (p.clientX - rect.left) / rect.width
        : (p.clientY - rect.top) / rect.height

    panes.resize(split.id, ratio, split.dir === "row" ? rect.width : rect.height)
  })
}

const STEP = 0.05

const nudge = (e: KeyboardEvent) => {
  if (node.kind !== "split" || !box) {
    return
  }

  const rect = box.getBoundingClientRect()
  const back = node.dir === "row" ? "ArrowLeft" : "ArrowUp"
  const forward = node.dir === "row" ? "ArrowRight" : "ArrowDown"

  if (e.key === back || e.key === forward) {
    e.preventDefault()
    panes.resize(
      node.id,
      node.ratio + (e.key === back ? -STEP : STEP),
      node.dir === "row" ? rect.width : rect.height,
    )
  }
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
        "relative shrink-0 rounded-full transition-colors",
        "hover:bg-primary/60 focus-visible:bg-primary/60 active:bg-primary",
        node.dir === "row" ? "my-2 w-1 cursor-col-resize" : "mx-2 h-1 cursor-row-resize",
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
