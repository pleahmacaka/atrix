import type { Copper, Footprint, Pcb } from "../types.ts"
import type { Area } from "./copper.ts"

export type Selection =
  | { kind: "part"; ref: string }
  | { kind: "net"; name: string }
  | { kind: "group"; refs: string[]; label: string }

export type Focus = {
  parts: Set<string>
  nets: string[]
  planes: string[]
  near: Area | null
}

const PLANE_SHARE = 0.25

const areaOf = (f: Footprint): Area | null => {
  if (f.box3d) {
    return [f.box3d.min[0], f.box3d.min[1], f.box3d.max[0], f.box3d.max[1]]
  }

  return f.at ? [f.at[0] - 1, f.at[1] - 1, f.at[0] + 1, f.at[1] + 1] : null
}

export class Inspect {
  selection = $state<Selection | null>(null)

  preview = $state<Selection | null>(null)

  flight = $state<{ refs: string[]; at: number } | null>(null)

  #pcb: () => Pcb | null

  #copper: () => Copper | null

  #solo: boolean

  constructor(
    pcb: () => Pcb | null,
    copper: () => Copper | null,
    solo = false,
  ) {
    this.#pcb = pcb
    this.#copper = copper
    this.#solo = solo
  }

  get #footprints() {
    return this.#pcb()?.footprints ?? []
  }

  partsOn = $derived.by(() => {
    const on = new Map<string, string[]>()

    for (const f of this.#footprints) {
      for (const net of f.nets ?? []) {
        on.set(net, [...(on.get(net) ?? []), f.ref])
      }
    }

    return on
  })

  planes = $derived.by(() => {
    const total = this.#footprints.length
    const pours = this.#copper()?.pours ?? []

    return new Set(
      [...this.partsOn]
        .filter(
          ([net, refs]) =>
            pours.includes(net) || refs.length >= total * PLANE_SHARE,
        )
        .map(([net]) => net),
    )
  })

  part = $derived.by(() => {
    const selected = this.selection

    return selected?.kind === "part"
      ? (this.#footprints.find(f => f.ref === selected.ref) ?? null)
      : null
  })

  #focusOf = (selected: Selection | null): Focus | null => {
    if (!selected) {
      return null
    }

    if (selected.kind === "group") {
      const areas = this.#footprints
        .filter(f => selected.refs.includes(f.ref))
        .map(areaOf)
        .filter(a => a !== null)

      return {
        parts: new Set(selected.refs),
        nets: [],
        planes: [],
        near: areas.length
          ? [
              Math.min(...areas.map(a => a[0])),
              Math.min(...areas.map(a => a[1])),
              Math.max(...areas.map(a => a[2])),
              Math.max(...areas.map(a => a[3])),
            ]
          : null,
      }
    }

    if (selected.kind === "net") {
      return {
        parts: new Set(this.partsOn.get(selected.name) ?? []),
        nets: [selected.name],
        planes: [],
        near: null,
      }
    }

    const part = this.#footprints.find(f => f.ref === selected.ref)
    const nets = part?.nets ?? []
    const traced = nets.filter(n => !this.planes.has(n))

    return {
      parts: new Set([
        selected.ref,
        ...(this.#solo ? [] : traced.flatMap(n => this.partsOn.get(n) ?? [])),
      ]),
      nets: traced,
      planes: nets.filter(n => this.planes.has(n)),
      near: part ? areaOf(part) : null,
    }
  }

  focus = $derived.by(() => this.#focusOf(this.preview ?? this.selection))

  chosen = $derived.by(() => this.#focusOf(this.selection))

  fly = (target: Selection) => {
    const refs =
      target.kind === "part"
        ? [target.ref]
        : target.kind === "group"
          ? target.refs
          : (this.partsOn.get(target.name) ?? [])

    this.select(target)
    this.preview = null
    this.flight = { refs, at: Date.now() }
  }

  select = (next: Selection | null) => {
    this.selection = next
  }
}

export const located = $state<{ target: Selection | null }>({ target: null })

export const groupOf = (refs: string[], label: string): Selection =>
  refs.length === 1
    ? { kind: "part", ref: refs[0] }
    : { kind: "group", refs, label }
