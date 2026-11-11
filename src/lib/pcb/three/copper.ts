import {
  BufferGeometry,
  Path as Curve,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
} from "three"
import type { Copper, Path, Polygon } from "../types.ts"

export type Area = [minX: number, minY: number, maxX: number, maxY: number]

export type Span = [from: number, to: number]

export type Rect = { y: Span; z: Span }

type Indexed = { net: string; polygon: Polygon; area: Area }

const areaOf = ([outline = []]: Polygon): Area => {
  const xs = outline.filter((_, i) => i % 2 === 0)
  const ys = outline.filter((_, i) => i % 2 === 1)

  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export const overlaps = (a: Area, b: Area) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

const crossings = (path: Path, x: number) => {
  const ys: number[] = []

  for (let i = 0; i < path.length; i += 2) {
    const j = (i + 2) % path.length
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = [
      path[i],
      path[i + 1],
      path[j],
      path[j + 1],
    ]

    if (x1 <= x !== x2 <= x) {
      ys.push(y1 + ((x - x1) / (x2 - x1)) * (y2 - y1))
    }
  }

  return ys
}

const spansOf = (paths: Path[], x: number) => {
  const ys = paths.flatMap(p => crossings(p, x)).toSorted((a, b) => a - b)
  const spans: Span[] = []

  for (let i = 0; i + 1 < ys.length; i += 2) {
    spans.push([ys[i] ?? 0, ys[i + 1] ?? 0])
  }

  return spans
}

const inside = (polygon: Polygon, x: number, y: number) =>
  polygon.flatMap(p => crossings(p, x)).filter(c => c > y).length % 2 === 1

const subtract = (spans: Span[], cuts: Span[]) =>
  cuts.reduce<Span[]>(
    (rest, [c0, c1]) =>
      rest.flatMap(([s0, s1]): Span[] =>
        c1 <= s0 || c0 >= s1
          ? [[s0, s1]]
          : [
              ...(c0 > s0 ? [[s0, c0] as Span] : []),
              ...(c1 < s1 ? [[c1, s1] as Span] : []),
            ],
      ),
    spans,
  )

export const indexCopper = (copper: Copper) =>
  new Map(
    copper.layers.map(({ name }) => [
      name,
      Object.entries(copper.nets).flatMap(([net, layers]) =>
        (layers[name] ?? []).map(
          (polygon): Indexed => ({ net, polygon, area: areaOf(polygon) }),
        ),
      ),
    ]),
  )

export type CopperIndex = ReturnType<typeof indexCopper>

export const netAt = (
  index: CopperIndex,
  layer: string,
  x: number,
  y: number,
) =>
  index
    .get(layer)
    ?.find(
      ({ polygon, area }) =>
        overlaps(area, [x, y, x, y]) && inside(polygon, x, y),
    )?.net ?? null

export const focusPolygons = (
  index: CopperIndex,
  copper: Copper,
  nets: string[],
  planes: string[],
  near: Area | null,
) => {
  const outer = [copper.layers[0]?.name, copper.layers.at(-1)?.name]

  return new Map(
    [...index].map(([layer, items]) => [
      layer,
      items
        .filter(
          ({ net, area }) =>
            nets.includes(net) ||
            (near &&
              planes.includes(net) &&
              outer.includes(layer) &&
              overlaps(area, near)),
        )
        .map(({ net, polygon }) => ({ net, polygon })),
    ]),
  )
}

const POUR_RATIO = 4

export const pinSpots = (
  index: CopperIndex,
  layer: string,
  nets: string[],
  [x0, y0, x1, y1]: Area,
) => {
  const size = (x1 - x0) * (y1 - y0)
  const band = Math.max(0.6, Math.min(x1 - x0, y1 - y0) * 0.18)
  const nearEdge = (x: number, y: number) =>
    Math.min(x - x0, x1 - x, y - y0, y1 - y) <= band

  return (index.get(layer) ?? []).flatMap(({ net, polygon, area }) => {
    const [outline = []] = polygon
    const points: [number, number][] = []

    if (
      !nets.includes(net) ||
      !overlaps(area, [x0, y0, x1, y1]) ||
      (area[2] - area[0]) * (area[3] - area[1]) > size * POUR_RATIO
    ) {
      return []
    }

    for (let i = 0; i + 1 < outline.length; i += 2) {
      const [x = 0, y = 0] = [outline[i], outline[i + 1]]

      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && nearEdge(x, y)) {
        points.push([x, y])
      }
    }

    if (points.length === 0) {
      return []
    }

    const sum = points.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0])

    return [{ net, x: sum[0] / points.length, y: sum[1] / points.length }]
  })
}

const curveOf = (path: Path) => {
  const curve = new Curve()

  for (let i = 0; i < path.length; i += 2) {
    const [x = 0, y = 0] = [path[i], path[i + 1]]

    if (i === 0) {
      curve.moveTo(x, y)
    } else {
      curve.lineTo(x, y)
    }
  }

  return curve
}

export const geometryOf = (polygons: Polygon[]) =>
  new ShapeGeometry(
    polygons.map(([outline = [], ...holes]) => {
      const shape = new Shape(curveOf(outline).getPoints())

      shape.holes = holes.map(curveOf)

      return shape
    }),
  )

export const sectionAt = (copper: Copper, x: number, focus: Set<string>) => {
  const crossing = copper.drills.flatMap(d => {
    const dx = x - d.at[0]
    const r = d.diameter / 2
    const half = Math.sqrt(r * r - dx * dx)

    return Math.abs(dx) < r
      ? [{ ...d, y: [d.at[1] - half, d.at[1] + half] as Span }]
      : []
  })
  const holes = crossing.map(d => d.y)
  const dielectric = subtract(spansOf(copper.outline, x), holes).map(
    (y): Rect => ({ y, z: copper.body }),
  )
  const plain: Rect[] = []
  const lit: Rect[] = []

  copper.layers.forEach(({ name, z }, i) => {
    const cuts = crossing
      .filter(d => d.span[0] <= i && i <= d.span[1])
      .map(d => d.y)

    for (const [net, layers] of Object.entries(copper.nets)) {
      const spans = (layers[name] ?? []).flatMap(p => spansOf(p, x))
      const target = focus.has(net) ? lit : plain

      for (const y of subtract(spans, cuts)) {
        target.push({ y, z })
      }
    }
  })

  for (const d of crossing.filter(d => d.plated)) {
    const top = copper.layers[d.span[0]]?.z[1] ?? copper.body[1]
    const bottom = copper.layers[d.span[1]]?.z[0] ?? copper.body[0]
    const wall = Math.min(0.025, (d.y[1] - d.y[0]) / 2)
    const target = focus.has(d.net) ? lit : plain

    target.push(
      { y: [d.y[0], d.y[0] + wall], z: [bottom, top] },
      { y: [d.y[1] - wall, d.y[1]], z: [bottom, top] },
    )
  }

  return { dielectric, plain, lit }
}

export const capGeometry = (rects: Rect[], x: number, shift: number) =>
  new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(
      rects.flatMap(({ y: [y0, y1], z: [z0, z1] }) => {
        const [a, b] = [y0 - shift, y1 - shift]

        return [x, z0, a, x, z1, a, x, z1, b, x, z0, a, x, z1, b, x, z0, b]
      }),
      3,
    ),
  )
