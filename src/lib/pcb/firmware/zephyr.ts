import { m } from "#lib/paraglide/messages.js"
import { loadDerived, type Outputs } from "../derived.ts"
import { saveFile } from "../save.ts"
import {
  DERIVED,
  type ZephyrKind,
  type ZephyrNode,
  type ZephyrReport,
  type ZephyrUnresolved,
} from "../types.ts"

export type TreeNode = { name: string; path: string; children: TreeNode[] }

const PREFIX = DERIVED.zephyr("")

export const KINDS: Record<ZephyrKind, { label: () => string; icon: string }> =
  {
    spi: { label: m.pcb_zephyr_spi, icon: "lucide:cable" },
    uwb: { label: m.pcb_zephyr_uwb, icon: "lucide:radio" },
    accel: { label: m.pcb_zephyr_accel, icon: "lucide:move-3d" },
    led: { label: () => "LED", icon: "lucide:lightbulb" },
    button: { label: m.pcb_zephyr_button, icon: "lucide:circle-dot" },
    uart: { label: () => "UART", icon: "lucide:terminal" },
    usb: { label: () => "USB", icon: "lucide:usb" },
    swd: { label: m.pcb_zephyr_swd, icon: "lucide:bug" },
    reset: { label: m.pcb_zephyr_reset, icon: "lucide:rotate-ccw" },
  }

export const zephyrFiles = (outputs: Outputs) =>
  Object.keys(outputs.manifest.outputs)
    .filter(f => f.startsWith(PREFIX))
    .map(f => f.slice(PREFIX.length))

const insert = (level: TreeNode[], parts: string[], path: string) => {
  const [head, ...rest] = parts

  if (!head) {
    return
  }

  const prefix = path ? `${path}/${head}` : head
  const existing = level.find(n => n.name === head && n.children.length > 0)

  if (rest.length === 0) {
    level.push({ name: head, path: prefix, children: [] })
  } else if (existing) {
    insert(existing.children, rest, prefix)
  } else {
    const dir: TreeNode = { name: head, path: prefix, children: [] }

    level.push(dir)
    insert(dir.children, rest, prefix)
  }
}

const sortTree = (nodes: TreeNode[]): TreeNode[] =>
  nodes
    .map(n => ({ ...n, children: sortTree(n.children) }))
    .toSorted(
      (a, b) =>
        Number(a.children.length > 0) - Number(b.children.length > 0) ||
        a.name.localeCompare(b.name),
    )

export const treeOf = (files: string[]) => {
  const root: TreeNode[] = []

  for (const file of files) {
    insert(root, file.split("/"), "")
  }

  return sortTree(root)
}

export const flatten = (nodes: TreeNode[]): string[] =>
  nodes.flatMap(n => (n.children.length > 0 ? flatten(n.children) : [n.path]))

export const linesOf = (text: string) =>
  (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")

export type Focus = {
  ids: string[]
  pins: string[]
  nets: string[]
  parts: string[]
}

export const nodeFocus = (n: ZephyrNode): Focus => ({
  ids: [n.id],
  pins: n.pins.map(p => p.pin),
  nets: n.pins.map(p => p.net).filter(Boolean),
  parts: n.parts,
})

export const netFocus = (u: ZephyrUnresolved): Focus => ({
  ids: [],
  pins: [u.pin],
  nets: [u.net],
  parts: u.parts,
})

const pinRefs = (pin: string) => {
  const [port, index] = pin.slice(1).split(".")

  if (!pin.startsWith("P") || !port || !index) {
    return []
  }

  const n = Number(index)

  return [pin, `gpio${port} ${n} `, `gpio${port} ${n}>`, `, ${port}, ${n})`]
}

const shares = (a: string[], b: string[]) => a.some(x => b.includes(x))

export const related = (a: Focus, b: Focus) =>
  shares(a.ids, b.ids) ||
  shares(a.pins, b.pins) ||
  shares(a.nets, b.nets) ||
  shares(a.parts, b.parts)

export const mentions = (focus: Focus, line: string) => {
  const words = new Set(line.split(/\W+/))

  return (
    [...focus.ids, ...focus.nets, ...focus.parts].some(w => words.has(w)) ||
    focus.pins.flatMap(pinRefs).some(r => line.includes(r))
  )
}

export const starterHref = (report: ZephyrReport) =>
  `https://github.com/${report.starter.repo}/tree/${report.starter.sha}`

export const downloadProject = async (
  outputs: Outputs,
  report: ZephyrReport,
) => {
  const zip = await loadDerived<ArrayBuffer>(
    outputs,
    DERIVED.zephyrProject,
    "arraybuffer",
  )

  if (!zip) {
    throw new Error("project.zip missing")
  }

  saveFile(zip, `${report.board}-zephyr.zip`)
}
