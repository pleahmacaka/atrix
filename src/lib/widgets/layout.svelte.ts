import type { Side } from "#lib/store/panes.svelte.ts"

export type WidgetType = "actions" | "navigator" | "pages" | "workspace" | "app"

export type WidgetLeaf = {
  kind: "widget"
  id: string
  type: WidgetType
  options: Record<string, string>
  hidden: boolean
}

export type Group = {
  kind: "group"
  id: string
  dir: "row" | "col"
  sizes: (number | null)[]
  children: LayoutNode[]
}

export type LayoutNode = WidgetLeaf | Group

const STORE = "layout"

const MIN_FRACTION = 0.08

const widget = (type: WidgetType, options: Record<string, string> = {}) =>
  ({
    kind: "widget",
    id: crypto.randomUUID(),
    type,
    options,
    hidden: false,
  }) satisfies WidgetLeaf

const group = (
  dir: Group["dir"],
  children: LayoutNode[],
  sizes: (number | null)[],
): Group => ({ kind: "group", id: crypto.randomUUID(), dir, sizes, children })

const defaultLayout = () =>
  group(
    "row",
    [
      group(
        "col",
        [
          widget("actions", { layout: "list" }),
          widget("navigator"),
          widget("pages"),
        ],
        [null, 1, null],
      ),
      widget("workspace"),
    ],
    [0.21, 0.79],
  )

const restore = (): LayoutNode => {
  try {
    const saved = localStorage.getItem(STORE)

    return saved ? (JSON.parse(saved) as LayoutNode) : defaultLayout()
  } catch {
    return defaultLayout()
  }
}

const leavesOf = (node: LayoutNode): WidgetLeaf[] =>
  node.kind === "widget" ? [node] : node.children.flatMap(leavesOf)

export const visible = (node: LayoutNode): boolean =>
  node.kind === "widget" ? !node.hidden : node.children.some(visible)

const map = (
  node: LayoutNode,
  id: string,
  next: (found: LayoutNode) => LayoutNode | null,
): LayoutNode | null => {
  if (node.id === id) {
    return next(node)
  }

  if (node.kind === "widget") {
    return node
  }

  const children: LayoutNode[] = []
  const sizes: (number | null)[] = []

  node.children.forEach((child, i) => {
    const mapped = map(child, id, next)

    if (mapped) {
      children.push(mapped)
      sizes.push(node.sizes[i])
    }
  })

  if (children.length === 1) {
    return children[0]
  }

  return { ...node, children, sizes }
}

const find = (node: LayoutNode, id: string): LayoutNode | null => {
  if (node.id === id) {
    return node
  }

  return node.kind === "group"
    ? (node.children.map(c => find(c, id)).find(Boolean) ?? null)
    : null
}

class Layout {
  root = $state<LayoutNode>(restore())

  editing = $state(false)

  get widgets() {
    return leavesOf(this.root)
  }

  get hidden() {
    return this.widgets.filter(w => w.hidden)
  }

  save = () => {
    localStorage.setItem(STORE, JSON.stringify($state.snapshot(this.root)))
  }

  #replace = (id: string, next: (found: LayoutNode) => LayoutNode | null) => {
    this.root = map(this.root, id, next) ?? defaultLayout()
    this.save()
  }

  setHidden = (id: string, hidden: boolean) =>
    this.#replace(id, found =>
      found.kind === "widget" ? { ...found, hidden } : found,
    )

  setOption = (id: string, key: string, value: string) =>
    this.#replace(id, found =>
      found.kind === "widget"
        ? { ...found, options: { ...found.options, [key]: value } }
        : found,
    )

  resize = (groupId: string, index: number, fraction: number, live = true) => {
    const target = find(this.root, groupId)

    if (target?.kind !== "group") {
      return
    }

    const sizes = [...target.sizes]
    const a = sizes[index] ?? 1
    const b = sizes[index + 1] ?? 1

    const pair = a + b
    const next = Math.min(pair - MIN_FRACTION, Math.max(MIN_FRACTION, fraction))

    sizes[index] = next
    sizes[index + 1] = pair - next

    this.root =
      map(this.root, groupId, found => ({ ...found, sizes })) ?? this.root

    if (!live) {
      this.save()
    }
  }

  move = (id: string, targetId: string, side: Side) => {
    const moving = find(this.root, id)

    if (moving?.kind !== "widget" || id === targetId) {
      return
    }

    const without = map(this.root, id, () => null)

    if (!without || !find(without, targetId)) {
      return
    }

    const dir = side === "left" || side === "right" ? "row" : "col"
    const first = side === "left" || side === "top"

    this.root =
      map(without, targetId, found =>
        group(dir, first ? [moving, found] : [found, moving], [0.5, 0.5]),
      ) ?? defaultLayout()
    this.save()
  }

  addWidget = (type: WidgetType, options: Record<string, string>) => {
    const workspace = this.widgets.find(w => w.type === "workspace")

    if (!workspace) {
      return
    }

    this.root =
      map(this.root, workspace.id, found =>
        group("row", [found, widget(type, options)], [0.72, 0.28]),
      ) ?? this.root
    this.save()
  }

  reset = () => {
    this.root = defaultLayout()
    this.save()
  }
}

export const layout = new Layout()
