export type Vec = [number, number, number]

export class Measure {
  active = $state(false)

  points = $state<Vec[]>([])

  get delta() {
    const [a, b] = this.points

    if (!a || !b) {
      return null
    }

    return { x: b[0] - a[0], y: b[2] - a[2], z: b[1] - a[1] }
  }

  get distance() {
    const d = this.delta

    return d ? Math.hypot(d.x, d.y, d.z) : null
  }

  add = (point: Vec) => {
    this.points = this.points.length >= 2 ? [point] : [...this.points, point]
  }

  clear = () => {
    this.points = []
  }
}
