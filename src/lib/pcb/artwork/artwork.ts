import type { Copper, Drill, Path, Polygon } from "../types.ts"

export const BACKGROUND = "#001023"

export const EDGE = "#D0D2CD"

export const SILK = "#F2EDA1"

export const BACK_SILK = "#E8B2A7"

const COPPER: Record<string, string> = {
  "F.Cu": "#C83434",
  "In1.Cu": "#7FC87F",
  "In2.Cu": "#CE7D2C",
  "In3.Cu": "#4FCBCB",
  "In4.Cu": "#DB628B",
  "B.Cu": "#4D7FC4",
}

export const colorOf = (layer: string) => COPPER[layer] ?? "#A0A0A0"

const ring = (path: Path) => {
  const points: string[] = []

  for (let i = 0; i + 1 < path.length; i += 2) {
    points.push(`${path[i]} ${path[i + 1]}`)
  }

  return `M${points.join("L")}Z`
}

export const pathOf = (polygons: Polygon[]) =>
  polygons.flatMap(p => p.map(ring)).join("")

const circle = ({ at: [x, y], diameter }: Drill) => {
  const r = diameter / 2

  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${diameter} 0a${r} ${r} 0 1 0 ${-diameter} 0Z`
}

export const holesOf = (drills: Drill[]) => drills.map(circle).join("")

export const boundsOf = (copper: Copper) => {
  const xs = copper.outline.flatMap(p => p.filter((_, i) => i % 2 === 0))
  const ys = copper.outline.flatMap(p => p.filter((_, i) => i % 2 === 1))

  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  }
}
