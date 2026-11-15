import { getContext, setContext } from "svelte"
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

type Dir = Split["dir"]

const MIN_REM: Record<Dir, number> = { row: 20, col: 16 }

const HANDLE_REM = 0.25

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

const remPx = () =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

const minExtent = (node: Node, dir: Dir): number => {
  if (node.kind === "leaf") {
    return MIN_REM[dir]
  }

  const a = minExtent(node.a, dir)
  const b = minExtent(node.b, dir)

  return node.dir === dir ? a + b + HANDLE_REM : Math.max(a, b)
}

const slots = (node: Node, dir: Dir): number =>
  node.kind === "split" && node.dir === dir
    ? slots(node.a, dir) + slots(node.b, dir)
    : 1

const balance = (node: Node): Node => {
  if (node.kind === "leaf") {
    return node
  }

  const same = (child: Node) =>
    child.kind === "split" && child.dir === node.dir ? balance(child) : child
  const a = slots(node.a, node.dir)
  const b = slots(node.b, node.dir)

  return { ...node, ratio: a / (a + b), a: same(node.a), b: same(node.b) }
}

const rebalance = (root: Node, id: string, dir: Dir) => {
  let top = id

  for (
    let parent = parentOf(root, top);
    parent?.dir === dir;
    parent = parentOf(root, top)
  ) {
    top = parent.id
  }

  return replace(root, top, found =>
    found.kind === "split" && found.dir === dir ? balance(found) : found,
  )
}

const splitTree = (root: Node, id: string, side: Side, added: Leaf) => {
  const dir: Dir = side === "left" || side === "right" ? "row" : "col"
  const first = side === "left" || side === "top"
  const splitId = crypto.randomUUID()

  const tree = replace(root, id, found => ({
    kind: "split",
    id: splitId,
    dir,
    ratio: 0.5,
    a: first ? added : found,
    b: first ? found : added,
  }))

  return rebalance(tree, splitId, dir)
}

const fits = (node: Node, width: number, height: number): boolean => {
  if (node.kind === "leaf") {
    return width >= MIN_REM.row && height >= MIN_REM.col
  }

  const room = (node.dir === "row" ? width : height) - HANDLE_REM
  const a = room * node.ratio
  const b = room - a

  return node.dir === "row"
    ? fits(node.a, a, height) && fits(node.b, b, height)
    : fits(node.a, width, a) && fits(node.b, width, b)
}

const PANE = Symbol("pane")

export const providePane = (id: () => string) => setContext(PANE, id)

export const usePane = () => getContext<(() => string) | undefined>(PANE)

class Panes {
  root = $state<Node>(leaf())

  focused = $state("")

  typing = $state<string | null>(null)

  width = $state(0)

  height = $state(0)

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
    this.typing = null
  }

  #type = (id: string) => {
    this.typing = matchMedia("(pointer: fine)").matches ? id : null
  }

  open = (current: Current, id = this.active.id) => {
    this.root = replace(this.root, id, found =>
      found.kind === "leaf" ? { ...found, current } : found,
    )
    this.focused = id
    this.#type(id)
  }

  canSplit = (id: string, side: Side) => {
    if (this.width === 0 || this.height === 0) {
      return true
    }

    const rem = remPx()

    return fits(
      splitTree(this.root, id, side, leaf()),
      this.width / rem,
      this.height / rem,
    )
  }

  split = (id: string, side: Side, current: Current = null) => {
    if (!this.canSplit(id, side)) {
      return false
    }

    const added = leaf(current)

    this.root = splitTree(this.root, id, side, added)
    this.focused = added.id
    this.#type(added.id)

    return true
  }

  resize = (id: string, ratio: number, size: number) => {
    this.root = replace(this.root, id, found => {
      if (found.kind !== "split") {
        return found
      }

      const rem = remPx()
      const room = size / rem - HANDLE_REM
      const low = minExtent(found.a, found.dir) / room
      const high = 1 - minExtent(found.b, found.dir) / room

      if (low > high) {
        return found
      }

      return { ...found, ratio: Math.min(high, Math.max(low, ratio)) }
    })
  }

  close = (id: string) => {
    const parent = parentOf(this.root, id)

    if (!parent) {
      this.open(null, id)

      return
    }

    const sibling = parent.a.id === id ? parent.b : parent.a

    this.root = rebalance(
      replace(this.root, parent.id, () => sibling),
      sibling.id,
      parent.dir,
    )
    this.focused = leavesOf(sibling)[0].id
  }
}

export const panes = new Panes()
