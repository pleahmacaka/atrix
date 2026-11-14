<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import LayoutView from "./LayoutView.svelte"
import { type LayoutNode, layout, visible } from "./layout.svelte.ts"
import { WIDGETS } from "./registry.ts"
import Widget from "./Widget.svelte"

let { node }: { node: LayoutNode } = $props()

let box = $state<HTMLDivElement>()

const fitsHeight = (child: LayoutNode): boolean =>
  child.kind === "widget"
    ? WIDGETS[child.type].intrinsic
    : child.children.filter(visible).every(fitsHeight)

const sizeOf = (child: LayoutNode, size: number | null) =>
  node.kind === "group" && node.dir === "col" && fitsHeight(child)
    ? null
    : (size ?? 1)

const shown = $derived(
  node.kind === "group"
    ? node.children
        .map((child, index) => ({
          child,
          index,
          size: sizeOf(child, node.sizes[index]),
        }))
        .filter(c => visible(c.child))
    : [],
)

const drag = (e: PointerEvent, index: number, next: number) => {
  if (node.kind !== "group" || !box) {
    return
  }

  const target = node
  const handle = e.currentTarget as HTMLElement
  const children = [...box.children].filter(
    c => !c.hasAttribute("data-handle"),
  ) as HTMLElement[]
  const before = children[shown.findIndex(s => s.index === index)]
  const after = children[shown.findIndex(s => s.index === next)]

  if (!before || !after) {
    return
  }

  const row = target.dir === "row"
  const start = before.getBoundingClientRect()
  const end = after.getBoundingClientRect()
  const span = row ? end.right - start.left : end.bottom - start.top
  const origin = row ? start.left : start.top
  const pair = (target.sizes[index] ?? 1) + (target.sizes[next] ?? 1)

  handle.setPointerCapture(e.pointerId)

  const move = (p: PointerEvent, live: boolean) => {
    const offset = (row ? p.clientX : p.clientY) - origin

    layout.resize(target.id, index, (offset / span) * pair, live)
  }

  const onMove = (p: PointerEvent) => move(p, true)

  const stop = (p: PointerEvent) => {
    move(p, false)
    handle.removeEventListener("pointermove", onMove)
    handle.removeEventListener("pointerup", stop)
  }

  handle.addEventListener("pointermove", onMove)
  handle.addEventListener("pointerup", stop)
}
</script>

{#if node.kind === "widget"}
  {#if !node.hidden}
    <Widget leaf={node} />
  {/if}
{:else}
  <div
    bind:this={box}
    class={[
      "flex min-h-0 min-w-0 flex-1 gap-2",
      node.dir === "col" && "flex-col",
    ]}
  >
    {#each shown as item, i (item.child.id)}
      {@const neighbor = shown[i + 1]}
      <div
        class={[
          "flex min-h-0 min-w-0 flex-col",
          item.size === null ? "flex-none" : "basis-0",
        ]}
        style:flex-grow={item.size ?? undefined}
      >
        <LayoutView node={item.child} />
      </div>
      {#if neighbor && item.size !== null && neighbor.size !== null}
        <button
          type="button"
          data-handle
          aria-label={m.shell_resize_pane()}
          class={[
            "relative -mx-1 shrink-0 rounded-full transition-colors",
            "hover:bg-primary/60 active:bg-primary",
            node.dir === "row"
              ? "w-0 cursor-col-resize"
              : "-my-1 mx-0 h-0 cursor-row-resize",
            layout.editing && "bg-primary/30",
            layout.editing && (node.dir === "row" ? "w-1" : "h-1"),
          ]}
          onpointerdown={e => drag(e, item.index, neighbor.index)}
        >
          <span
            class={[
              "absolute",
              node.dir === "row" ? "inset-y-0 -inset-x-1.5" : "inset-x-0 -inset-y-1.5",
            ]}
          ></span>
        </button>
      {/if}
    {/each}
  </div>
{/if}
