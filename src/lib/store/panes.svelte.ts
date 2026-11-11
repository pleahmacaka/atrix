import type { Current } from "./nav.svelte.ts"

export type Side = "left" | "right" | "top" | "bottom"

export type Leaf = { kind: "leaf"; id: string; current: Current }

export type Split = {
  kind: "split"
  id: string
  dir: "row" | "col"
  ratio: number
  a: Node
  b: Node
}

export type Node = Leaf | Split

const leaf = (current: Current = null): Leaf => ({
  kind: "leaf",
  id: crypto.randomUUID(),
  current,
})

const replace = (node: Node, id: string, next: (found: Node) => Node): Node => {
  if (node.id === id) {
    return next(node)
  }

  if (node.kind === "leaf") {
    return node
  }

  return { ...node, a: replace(node.a, id, next), b: replace(node.b, id, next) }
}

const leavesOf = (node: Node): Leaf[] =>
  node.kind === "leaf" ? [node] : [...leavesOf(node.a), ...leavesOf(node.b)]

const parentOf = (node: Node, id: string): Split | null => {
  if (node.kind === "leaf") {
    return null
  }

  if (node.a.id === id || node.b.id === id) {
    return node
  }

  return parentOf(node.a, id) ?? parentOf(node.b, id)
}

class Panes {
  root = $state<Node>(leaf())

  focused = $state("")

  constructor() {
    this.focused = this.root.id
  }

  get leaves() {
    return leavesOf(this.root)
  }

  get active() {
    return this.leaves.find(l => l.id === this.focused) ?? this.leaves[0]
  }

  focus = (id: string) => {
    this.focused = id
  }

  open = (current: Current, id = this.active.id) => {
    this.root = replace(this.root, id, found =>
      found.kind === "leaf" ? { ...found, current } : found,
    )
    this.focused = id
  }

  split = (id: string, side: Side, current: Current = null) => {
    const added = leaf(current)

    this.root = replace(this.root, id, found => ({
      kind: "split",
      id: crypto.randomUUID(),
      dir: side === "left" || side === "right" ? "row" : "col",
      ratio: 0.5,
      a: side === "left" || side === "top" ? added : found,
      b: side === "left" || side === "top" ? found : added,
    }))
    this.focused = added.id
  }

  resize = (id: string, ratio: number) => {
    this.root = replace(this.root, id, found =>
      found.kind === "split"
        ? { ...found, ratio: Math.min(0.85, Math.max(0.15, ratio)) }
        : found,
    )
  }

  close = (id: string) => {
    const parent = parentOf(this.root, id)

    if (!parent) {
      this.open(null, id)

      return
    }

    const sibling = parent.a.id === id ? parent.b : parent.a

    this.root = replace(this.root, parent.id, () => sibling)
    this.focused = leavesOf(sibling)[0].id
  }
}

export const panes = new Panes()
