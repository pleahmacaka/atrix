import { getContext, setContext } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { z } from "zod"
import { keyOf } from "./keys.ts"
import type { Current } from "./nav.svelte.ts"
import { persisted } from "./stored.svelte.ts"

const SIDES = "panes:sides"

export type Side = "left" | "right" | "top" | "bottom"

export const SIDE_TABS = ["items", "git", "terminal"] as const

export type SideTab = (typeof SIDE_TABS)[number]

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

const holding = (node: Node, current: NonNullable<Current>) =>
  leavesOf(node).find(l => l.current && keyOf(l.current) === keyOf(current))

const prune = (node: Node, key: string): Node | null => {
  if (node.kind === "leaf") {
    return node.current && keyOf(node.current) === key ? null : node
  }

  const a = prune(node.a, key)
  const b = prune(node.b, key)

  if (a && b) {
    return { ...node, a, b }
  }

  return a ?? b
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

  sides = new SvelteMap<string, SideTab>(
    Object.entries(
      persisted(SIDES, {}, z.record(z.string(), z.enum(SIDE_TABS))),
    ),
  )

  stashed = $state<Node[]>([])

  constructor() {
    this.focused = this.root.id
  }

  get leaves() {
    return leavesOf(this.root)
  }

  get active() {
    return this.leaves.find(l => l.id === this.focused) ?? this.leaves[0]
  }

  get clusters() {
    return [this.root, ...this.stashed]
      .filter(n => n.kind === "split")
      .map(n => leavesOf(n).flatMap(l => (l.current ? [keyOf(l.current)] : [])))
  }

  #sideKey = (id: string) => {
    const current = this.leaves.find(l => l.id === id)?.current

    return current ? keyOf(current) : id
  }

  sideOf = (id = this.active.id) => this.sides.get(this.#sideKey(id)) ?? null

  hasSide = (id = this.active.id) => this.sides.has(this.#sideKey(id))

  showSide = (id: string, tab: SideTab | null) => {
    const key = this.#sideKey(id)

    if (tab) {
      this.sides.set(key, tab)
    } else {
      this.sides.delete(key)
    }

    localStorage.setItem(
      SIDES,
      JSON.stringify(
        Object.fromEntries(
          [...this.sides].filter(([k]) => !this.leaves.some(l => l.id === k)),
        ),
      ),
    )
  }

  toggleSide = (id = this.active.id) =>
    this.showSide(id, this.hasSide(id) ? null : "items")

  focus = (id: string) => {
    this.focused = id
    this.typing = null
  }

  step = (side: Side) => {
    const rects = new Map(
      [...document.querySelectorAll<HTMLElement>("[data-pane]")].map(e => [
        e.dataset.pane ?? "",
        e.getBoundingClientRect(),
      ]),
    )
    const from = rects.get(this.focused)

    if (!from) {
      return
    }

    const center = (r: DOMRect) => ({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    })
    const origin = center(from)
    const ahead = (r: DOMRect) =>
      side === "left"
        ? r.right <= from.left + 1
        : side === "right"
          ? r.left >= from.right - 1
          : side === "top"
            ? r.bottom <= from.top + 1
            : r.top >= from.bottom - 1
    const next = [...rects]
      .filter(([id, r]) => id !== this.focused && ahead(r))
      .map(([id, r]) => {
        const c = center(r)

        return { id, distance: Math.hypot(c.x - origin.x, c.y - origin.y) }
      })
      .toSorted((a, b) => a.distance - b.distance)[0]

    if (next) {
      this.focused = next.id
      this.typing = next.id
    }
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

  show = (current: Current) => {
    const shown = current && holding(this.root, current)

    if (shown) {
      this.focus(shown.id)

      return
    }

    if (this.active.current === null && this.root.kind === "split") {
      this.open(current)

      return
    }

    const at = current ? this.stashed.findIndex(n => holding(n, current)) : -1
    const restored = at === -1 ? null : this.stashed.splice(at, 1)[0]

    if (this.root.kind === "split") {
      this.stashed.push(this.root)
    }

    if (restored && current) {
      this.root = restored
      this.focus(holding(restored, current)?.id ?? leavesOf(restored)[0].id)
    } else if (this.root.kind === "split") {
      this.root = leaf(current)
      this.focused = this.root.id
      this.#type(this.root.id)
    } else {
      this.open(current)
    }
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

  forget = (current: NonNullable<Current>) => {
    for (const leaf of this.leaves) {
      if (leaf.current && keyOf(leaf.current) === keyOf(current)) {
        this.close(leaf.id)
      }
    }

    this.stashed = this.stashed.flatMap(node => {
      const kept = prune(node, keyOf(current))

      return kept && kept.kind === "split" ? [kept] : []
    })
  }

  reset = (id: string) => {
    this.root = replace(this.root, id, balance)
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
