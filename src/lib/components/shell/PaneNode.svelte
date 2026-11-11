<script lang="ts">
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
  const handle = e.currentTarget as HTMLElement
  const rect = box.getBoundingClientRect()

  handle.setPointerCapture(e.pointerId)

  const move = (m: PointerEvent) => {
    const ratio =
      split.dir === "row"
        ? (m.clientX - rect.left) / rect.width
        : (m.clientY - rect.top) / rect.height

    panes.resize(split.id, ratio)
  }

  const stop = () => {
    handle.removeEventListener("pointermove", move)
    handle.removeEventListener("pointerup", stop)
  }

  handle.addEventListener("pointermove", move)
  handle.addEventListener("pointerup", stop)
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
        "group/resize relative shrink-0 bg-base-300 transition-colors",
        "hover:bg-primary active:bg-primary",
        node.dir === "row"
          ? "w-0.5 cursor-col-resize"
          : "h-0.5 cursor-row-resize",
      ]}
      onpointerdown={drag}
    >
      <span
        class={[
          "absolute",
          node.dir === "row" ? "inset-y-0 -inset-x-1" : "inset-x-0 -inset-y-1",
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
