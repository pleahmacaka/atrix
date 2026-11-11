import { m } from "#lib/paraglide/messages.js"
import type { BomLine } from "../types.ts"
import { byImportance, categoryOf, isPassive } from "./rank.ts"

export type BomRow = {
  item: number
  part: string
  spec: string
  package: string
  qty: number
  refs: string[]
  lcsc: string
  category: string
}

export type SortKey = keyof BomRow

export const COLUMNS: { key: SortKey; label: () => string }[] = [
  { key: "item", label: () => "#" },
  { key: "part", label: m.pcb_bom_part },
  { key: "spec", label: m.pcb_bom_spec },
  { key: "package", label: m.pcb_bom_package },
  { key: "qty", label: m.pcb_bom_qty },
  { key: "lcsc", label: () => "LCSC" },
  { key: "refs", label: m.pcb_bom_refs },
]

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const specOf = (line: BomLine) => {
  if (isPassive(line)) {
    return line.info?.summary || line.value
  }

  return [line.info?.manufacturer, line.info?.category]
    .filter(Boolean)
    .join(" ")
}

export const rowsOf = (lines: BomLine[]): BomRow[] =>
  lines
    .map(l => ({ ...l, refs: l.refs.toSorted(byCodeUnit) }))
    .toSorted(byImportance)
    .map((l, i) => ({
      item: i + 1,
      part: isPassive(l) ? categoryOf(l) : l.mpn || l.value,
      spec: specOf(l),
      package: l.info?.package || l.package,
      qty: l.refs.length,
      refs: l.refs,
      lcsc: l.lcsc,
      category: categoryOf(l),
    }))

const collator = new Intl.Collator("ko", { numeric: true })

const keyOf = (row: BomRow, key: SortKey) =>
  key === "refs" ? (row.refs[0] ?? "") : row[key]

export const sortRows = (rows: BomRow[], key: SortKey, ascending: boolean) =>
  rows.toSorted((a, b) => {
    const x = keyOf(a, key)
    const y = keyOf(b, key)
    const order =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : key === "refs"
          ? byCodeUnit(String(x), String(y))
          : collator.compare(String(x), String(y))

    return ascending ? order : -order
  })

export const filterRows = (rows: BomRow[], query: string) => {
  const q = query.trim().toLowerCase()

  return q
    ? rows.filter(r =>
        [r.part, r.spec, r.package, r.lcsc, r.category, ...r.refs].some(v =>
          v.toLowerCase().includes(q),
        ),
      )
    : rows
}

export const lcscUrl = (lcsc: string) =>
  `https://www.lcsc.com/product-detail/${encodeURIComponent(lcsc)}.html`

const QUOTED = [",", '"', "\n", "\r"]

const cell = (value: unknown) => {
  const s = value === null || value === undefined ? "" : String(value)

  return QUOTED.some(c => s.includes(c)) ? `"${s.replaceAll('"', '""')}"` : s
}

export const toCsv = (rows: unknown[][], newline = "\r\n") =>
  rows.map(row => row.map(cell).join(",")).join(newline)

export const bomCsv = (rows: BomRow[]) =>
  `﻿${toCsv([
    COLUMNS.map(c => c.label()),
    ...rows.map(r => [
      r.item,
      r.part,
      r.spec,
      r.package,
      r.qty,
      r.lcsc || m.pcb_bom_consigned(),
      r.refs.join(", "),
    ]),
  ])}`

export type BoardBom = { label: string; lines: BomLine[] }

const partKey = (l: BomLine) => l.lcsc || l.mpn || `${l.value}|${l.package}`

export const mergeBoms = (boards: BoardBom[]): BomLine[] => {
  const merged = new Map<string, BomLine>()

  for (const { label, lines } of boards) {
    for (const line of lines) {
      const refs = line.refs.map(r => `${label}/${r}`)
      const known = merged.get(partKey(line))

      merged.set(
        partKey(line),
        known
          ? { ...known, refs: [...known.refs, ...refs] }
          : { ...line, refs },
      )
    }
  }

  return [...merged.values()]
}
