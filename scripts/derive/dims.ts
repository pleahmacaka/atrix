import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  type Box3,
  DERIVED,
  type Dimensions,
  type Overhang,
} from "../../src/lib/pcb/types.ts"
import type { Context } from "./cli.ts"

export type Ring = [number, number][]

type Point = [number, number]

type Anchor = "start" | "middle" | "end"

export const TOLERANCE = 0.05

const INK = "#1a1a1a"

const FILL = { board: "#8cb38c", part: "#d9d9d9", overhang: "#f2b88c" }

const SIDE_NAMES: Record<Overhang["side"], string> = {
  left: "왼쪽",
  top: "위쪽",
  right: "오른쪽",
  bottom: "아래쪽",
}

const FONT_CSS = "pretendard/dist/web/static/pretendard-dynamic-subset.css"

const FONT_FILE = "Pretendard-Regular."

const ARROW = 5

const FIRST = 18

const LANE = 16

const GAP = 90

const PAD = 30

const DIM_TEXT = 8

export const fmt = (mm: number) => String(Number(mm.toFixed(2)))

const xmlText = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

const widthOf = (text: string, size: number) =>
  [...text].reduce(
    (w, c) => w + ((c.codePointAt(0) ?? 0) > 0x1100 ? size : size * 0.6),
    0,
  )

const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start)

  if (from < 0) {
    return ""
  }

  const value = from + start.length

  return text.slice(value, text.indexOf(end, value)).trim()
}

const covers = (range: string, code: number) =>
  range.split(",").some(part => {
    const [lo = "", hi = lo] = part.trim().slice(2).split("-")

    return code >= Number.parseInt(lo, 16) && code <= Number.parseInt(hi, 16)
  })

const fontFaces = (cssFile: string, text: string) => {
  const codes = [...new Set(text)].map(c => c.codePointAt(0) ?? 0)

  return readFileSync(cssFile, "utf8")
    .split("@font-face")
    .flatMap(block => {
      const file = between(block, "url(./woff2-dynamic-subset/", ")")
      const range = between(block, "unicode-range:", ";")

      if (!file.startsWith(FONT_FILE) || !codes.some(c => covers(range, c))) {
        return []
      }

      const font = readFileSync(
        join(dirname(cssFile), "woff2-dynamic-subset", file),
      ).toString("base64")

      return [
        `@font-face{font-family:Pretendard;src:url(data:font/woff2;base64,${font}) format("woff2");unicode-range:${range}}`,
      ]
    })
    .join("")
}

class Sheet {
  private items: string[] = []

  private texts: string[] = []

  private box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }

  get bounds() {
    return this.box
  }

  private grow(x: number, y: number) {
    this.box.x0 = Math.min(this.box.x0, x)
    this.box.y0 = Math.min(this.box.y0, y)
    this.box.x1 = Math.max(this.box.x1, x)
    this.box.y1 = Math.max(this.box.y1, y)
  }

  line(a: Point, b: Point, width = 0.3) {
    this.grow(...a)
    this.grow(...b)
    this.items.push(
      `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}" stroke="${INK}" stroke-width="${width}"/>`,
    )
  }

  rect(a: Point, b: Point, fill: string, dashed = false) {
    const [x, y] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])]
    const [w, h] = [Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]

    this.grow(x, y)
    this.grow(x + w, y + h)
    this.items.push(
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${fill}" stroke="${INK}" stroke-width="0.6"${dashed ? ' stroke-dasharray="3 2"' : ""}/>`,
    )
  }

  rings(rings: Point[][], fill: string) {
    const d = rings
      .map(r => `M${r.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}Z`)
      .join("")

    for (const [x, y] of rings.flat()) {
      this.grow(x, y)
    }

    this.items.push(
      `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${INK}" stroke-width="0.6"/>`,
    )
  }

  text(
    [x, y]: Point,
    value: string,
    size = DIM_TEXT,
    anchor: Anchor = "middle",
    rotated = false,
  ) {
    const width = widthOf(value, size)
    const start = { start: 0, middle: -width / 2, end: -width }[anchor]

    if (rotated) {
      this.grow(x - size, y - start)
      this.grow(x + size * 0.25, y - start - width)
    } else {
      this.grow(x + start, y - size)
      this.grow(x + start + width, y + size * 0.25)
    }

    this.texts.push(value)
    this.items.push(
      `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${size}" text-anchor="${anchor}"${rotated ? ` transform="rotate(-90 ${fmt(x)} ${fmt(y)})"` : ""}>${xmlText(value)}</text>`,
    )
  }

  private arrow(tip: Point, dir: Point) {
    const back: Point = [tip[0] - dir[0] * ARROW, tip[1] - dir[1] * ARROW]
    const side: Point = [-dir[1] * 1.4, dir[0] * 1.4]

    this.items.push(
      `<path d="M${fmt(tip[0])} ${fmt(tip[1])}L${fmt(back[0] + side[0])} ${fmt(back[1] + side[1])}L${fmt(back[0] - side[0])} ${fmt(back[1] - side[1])}Z" fill="${INK}"/>`,
    )
  }

  dimension(axis: 0 | 1, a: Point, b: Point, at: number, label: string) {
    const other = axis === 0 ? 1 : 0
    const extend = (f: Point) => {
      const p: Point = [f[0], f[1]]
      const reach = at - f[other]
      const sign = Math.sign(reach)

      p[other] = at

      if (Math.abs(reach) > 2) {
        const from: Point = [f[0], f[1]]
        const to: Point = [p[0], p[1]]

        from[other] += sign * 2
        to[other] += sign * 2
        this.line(from, to, 0.25)
      }

      return p
    }
    const [p0, p1] = [extend(a), extend(b)]
    const span = Math.abs(p1[axis] - p0[axis])
    const u: Point = [0, 0]

    u[axis] = Math.sign(p1[axis] - p0[axis]) || 1

    const outside = span < 2 * ARROW + 4
    const reach = outside ? ARROW + 6 : 0

    this.line(
      [p0[0] - u[0] * reach, p0[1] - u[1] * reach],
      [p1[0] + u[0] * reach, p1[1] + u[1] * reach],
    )
    this.arrow(p0, outside ? u : [-u[0], -u[1]])
    this.arrow(p1, outside ? [-u[0], -u[1]] : u)

    const mid: Point = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]

    if (axis === 0) {
      this.text([mid[0], at - 3], label)

      return
    }

    if (span >= widthOf(label, DIM_TEXT) + 2 * ARROW) {
      this.text([at - 3, mid[1]], label, DIM_TEXT, "middle", true)

      return
    }

    const outward = at < a[0] ? -1 : 1

    this.text(
      [at + outward * 4, mid[1] + DIM_TEXT * 0.35],
      label,
      DIM_TEXT,
      outward < 0 ? "end" : "start",
    )
  }

  svg(cssFile: string) {
    const { x0, y0, x1, y1 } = this.box
    const [x, y] = [x0 - PAD, y0 - PAD]
    const [w, h] = [x1 - x0 + 2 * PAD, y1 - y0 + 2 * PAD]
    const style = `${fontFaces(cssFile, this.texts.join(""))}text{font-family:Pretendard,sans-serif;fill:${INK}}`

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(h)}" viewBox="${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)}">`,
      `<style>${style}</style>`,
      `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="#fff"/>`,
      ...this.items,
      "</svg>",
    ].join("\n")
  }
}

export const drawingOf = (
  title: string,
  outline: Ring[],
  dims: Dimensions,
  parts: Map<string, Box3>,
  cssFile: string,
) => {
  const { board, envelope } = dims
  const [bx0, by0, bz0] = board.min
  const [bx1, by1, bz1] = board.max
  const [ex0, ey0, ez0] = envelope.min
  const [ex1, ey1, ez1] = envelope.max
  const [width, length, height] = [ex1 - ex0, ey1 - ey0, ez1 - ez0]
  const s = Math.min(520 / (width + length), 400 / (length + height))
  const sheet = new Sheet()
  const sticking = new Set(dims.overhangs.map(o => o.ref))
  const boxOf = (ref: string) => parts.get(ref) ?? board
  const boxes = [board, ...parts.values()]
  const edge = (k: 0 | 1 | 2, end: "min" | "max") =>
    boxes.find(b => b[end][k] === envelope[end][k]) ?? board

  const plan = (x: number, y: number): Point => [(x - ex0) * s, (y - ey0) * s]

  sheet.rings(
    outline.map(r => r.map(([x, y]) => plan(x, y))),
    FILL.board,
  )

  for (const ref of sticking) {
    const { min, max } = boxOf(ref)
    const [a, b] = [plan(min[0], min[1]), plan(max[0], max[1])]

    sheet.rect(a, b, FILL.overhang, true)
    sheet.text([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 3], ref)
  }

  const [left, top] = plan(ex0, ey0)
  const [right, bottom] = plan(ex1, ey1)
  const topLanes: (() => void)[] = []
  const rightLanes: (() => void)[] = []
  const laneAt = (lanes: unknown[], from: number, sign: number) =>
    from + sign * (FIRST + LANE * lanes.length)

  for (const o of dims.overhangs) {
    const { min, max } = boxOf(o.ref)
    const label = fmt(o.mm)

    if (o.side === "left" || o.side === "right") {
      const y = laneAt(topLanes, top, -1)
      const [a, b] =
        o.side === "left"
          ? [plan(min[0], min[1]), plan(bx0, by0)]
          : [plan(bx1, by0), plan(max[0], min[1])]

      topLanes.push(() => sheet.dimension(0, a, b, y, label))
    } else {
      const x = laneAt(rightLanes, right, 1)
      const [a, b] =
        o.side === "top"
          ? [plan(max[0], min[1]), plan(bx1, by0)]
          : [plan(bx1, by1), plan(max[0], max[1])]

      rightLanes.push(() => sheet.dimension(1, a, b, x, label))
    }
  }

  if (width - (bx1 - bx0) > TOLERANCE) {
    const y = laneAt(topLanes, top, -1)

    topLanes.push(() =>
      sheet.dimension(
        0,
        plan(ex0, edge(0, "min").min[1]),
        plan(ex1, edge(0, "max").min[1]),
        y,
        fmt(width),
      ),
    )
  }

  if (dims.envelopeLonger) {
    const x = laneAt(rightLanes, right, 1)

    rightLanes.push(() =>
      sheet.dimension(
        1,
        plan(edge(1, "min").max[0], ey0),
        plan(edge(1, "max").max[0], ey1),
        x,
        fmt(length),
      ),
    )
  }

  for (const draw of [...topLanes, ...rightLanes]) {
    draw()
  }

  sheet.dimension(
    0,
    plan(bx0, by1),
    plan(bx1, by1),
    bottom + FIRST,
    fmt(bx1 - bx0),
  )
  sheet.dimension(
    1,
    plan(bx0, by0),
    plan(bx0, by1),
    left - FIRST,
    fmt(by1 - by0),
  )
  sheet.text([(left + right) / 2, bottom + FIRST + 28], "윗면", 9)

  const above = dims.above.mm > TOLERANCE ? dims.above : null
  const below = dims.below.mm > TOLERANCE ? dims.below : null
  const facts = [
    `기판 (가로 × 세로 × 두께): ${fmt(bx1 - bx0)} × ${fmt(by1 - by0)} × ${fmt(bz1 - bz0)}`,
    `전체 외형 (가로 × 세로 × 높이): ${fmt(width)} × ${fmt(length)} × ${fmt(height)}`,
    `기판 윗면 위 최대 높이: ${above ? `${fmt(above.mm)} (${above.ref})` : "0"}`,
    `기판 밑면 아래 최대 깊이: ${below ? `${fmt(below.mm)} (${below.ref})` : "0"}`,
    ...(dims.overhangs.length
      ? dims.overhangs.map(
          o => `기판 외부 돌출: ${o.ref} ${SIDE_NAMES[o.side]} ${fmt(o.mm)}`,
        )
      : ["기판 외부 돌출: 없음"]),
  ]
  const sx = right + GAP
  const factsX = Math.max(sx, laneAt(rightLanes, right, 1) + 30)

  facts.forEach((line, i) => {
    sheet.text([factsX, top + 10 + i * 16], line, 9, "start")
  })

  const sideTop = dims.envelopeLonger ? FIRST + 20 : 0
  const fy = Math.max(
    bottom + FIRST + 28 + 40,
    top + 10 + facts.length * 16 + sideTop + 20,
  )

  const front = (x: number, z: number): Point => [
    (x - ex0) * s,
    fy + (ez1 - z) * s,
  ]

  const side = (y: number, z: number): Point => [
    sx + (ey1 - y) * s,
    fy + (ez1 - z) * s,
  ]

  for (const [ref, { min, max }] of parts) {
    const fill = sticking.has(ref) ? FILL.overhang : FILL.part

    sheet.rect(front(min[0], max[2]), front(max[0], min[2]), fill)
    sheet.rect(side(max[1], max[2]), side(min[1], min[2]), fill)
  }

  sheet.rect(front(bx0, bz1), front(bx1, bz0), FILL.board)
  sheet.rect(side(by1, bz1), side(by0, bz0), FILL.board)

  const [frontLeft, frontTop] = front(ex0, ez1)
  const [frontRight, frontBottom] = front(ex1, ez0)
  const [sideRight] = side(ey0, 0)
  const labelY = frontBottom + FIRST + 28

  sheet.dimension(
    1,
    front(edge(2, "max").min[0], ez1),
    front(edge(2, "min").min[0], ez0),
    frontLeft - FIRST,
    fmt(height),
  )

  if (above) {
    sheet.dimension(
      1,
      front(edge(2, "max").max[0], ez1),
      front(bx1, bz1),
      frontRight + FIRST,
      fmt(above.mm),
    )
  }

  if (below) {
    sheet.dimension(
      1,
      front(bx1, bz0),
      front(edge(2, "min").max[0], ez0),
      frontRight + FIRST,
      fmt(below.mm),
    )
  }

  sheet.text([(frontLeft + frontRight) / 2, labelY], "정면", 9)

  sheet.dimension(
    1,
    side(by0, bz1),
    side(by0, bz0),
    sideRight + FIRST,
    fmt(bz1 - bz0),
  )
  sheet.dimension(
    0,
    side(by1, bz0),
    side(by0, bz0),
    frontBottom + FIRST,
    fmt(by1 - by0),
  )

  if (dims.envelopeLonger) {
    sheet.dimension(
      0,
      side(ey1, edge(1, "max").max[2]),
      side(ey0, edge(1, "min").max[2]),
      frontTop - FIRST,
      fmt(length),
    )
  }

  sheet.text([(sx + sideRight) / 2, labelY], "우측면", 9)

  const { x0, y0 } = sheet.bounds

  sheet.text([x0, y0 - 34], title, 16, "start")
  sheet.text([x0, y0 - 16], "단위 mm, 제3각법", 9, "start")

  return sheet.svg(cssFile)
}

export const writeDrawing = (
  ctx: Context,
  outline: Ring[],
  dims: Dimensions,
  parts: Map<string, Box3>,
) => {
  const target = join(ctx.staging, DERIVED.drawing)
  const css = Bun.resolveSync(FONT_CSS, ctx.root)

  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(
    target,
    drawingOf(`${ctx.projectName} 외형 치수`, outline, dims, parts, css),
  )
}
