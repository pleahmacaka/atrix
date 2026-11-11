import {
  type CreateQueryResult,
  createQuery,
  useQueryClient,
} from "@tanstack/svelte-query"
import axios from "axios"
import type { LiveRender, LiveSeed, LiveStatus } from "./types.ts"

export type LiveSource = {
  id: string
  href: (file: string) => Promise<string | null>
}

export type LayerSvg = { layer: string; svg: string }

const MAX_PASSES = 30

const score = (s: LiveSeed) =>
  (s.errors ?? Number.POSITIVE_INFINITY) * 1000 + (s.warnings ?? 0)

const inner = (svg: string) =>
  svg
    .slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"))
    .replaceAll("fill-opacity:0.22", "fill-opacity:1")

export const progress = (s: LiveSeed) =>
  s.state === "checked" || s.state === "clean"
    ? 100
    : Math.min(100, (s.pass / MAX_PASSES) * 100)

export class Routing {
  selected = $state<number | null>(null)

  hoveredSeed = $state<number | null>(null)

  hoveredNet = $state<string | null>(null)

  pinnedNet = $state<string | null>(null)

  open = $state(true)

  status: CreateQueryResult<LiveStatus | null>

  layers: CreateQueryResult<LayerSvg[]>

  seeds = $derived.by(() => this.status.data?.seeds ?? [])

  best = $derived(
    this.seeds.filter(s => s.render).toSorted((a, b) => score(a) - score(b))[0],
  )

  current = $derived(this.seeds.find(s => s.seed === this.selected) ?? null)

  render: LiveRender | null = $derived.by(
    () =>
      this.current?.render ??
      (this.#final()
        ? null
        : (this.best?.render ?? this.status.data?.base ?? null)),
  )

  seed = $derived(this.current ?? (this.best?.render ? this.best : null))

  problems = $derived.by(() => {
    const counts = new Map<string, number>()

    for (const u of (this.render ?? this.best?.render)?.unrouted ?? []) {
      counts.set(u.net, (counts.get(u.net) ?? 0) + 1)
    }

    return [...counts].toSorted(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )
  })

  preview = $derived(
    this.hoveredSeed !== null && this.hoveredSeed !== this.seed?.seed
      ? (this.seeds.find(s => s.seed === this.hoveredSeed)?.render ?? null)
      : null,
  )

  #client = useQueryClient()

  #source: () => LiveSource | null

  #final: () => boolean

  constructor(source: () => LiveSource | null, final: () => boolean) {
    this.#source = source
    this.#final = final

    this.status = createQuery(() => ({
      queryKey: ["live", source()?.id ?? "", "status"],
      queryFn: async () => {
        const url = (await source()?.href("status.json")) ?? null

        return url
          ? (await axios.get<LiveStatus>(url, { params: { t: Date.now() } }))
              .data
          : null
      },
      enabled: !!source(),
      retry: false,
      refetchInterval: query =>
        query.state.data?.stage === "done" ? 10_000 : 1500,
    }))

    this.layers = createQuery(() => ({
      ...this.#layersOf(this.render),
      enabled: !!this.render,
      placeholderData: previous => previous,
    }))
  }

  get available() {
    return !!this.status.data
  }

  enter = (s: LiveSeed) => {
    this.hoveredSeed = s.seed

    if (s.render) {
      this.#client.prefetchQuery(this.#layersOf(s.render))
    }
  }

  #layersOf = (render: LiveRender | null) => ({
    queryKey: ["live", this.#source()?.id ?? "", "layers", render?.file ?? ""],
    queryFn: async () => {
      const url = render ? await this.#source()?.href(render.file) : null
      const bundle = url
        ? (await axios.get<Record<string, string>>(url)).data
        : {}

      return (render?.layers ?? []).flatMap(layer =>
        bundle[layer] ? [{ layer, svg: inner(bundle[layer]) }] : [],
      )
    },
    staleTime: Number.POSITIVE_INFINITY,
  })
}
