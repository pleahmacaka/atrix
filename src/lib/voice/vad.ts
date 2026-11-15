export type VadEvent = "rise" | "start" | "drop" | "end"

const START_MS = 150

const END_MS = 900

const MAX_MS = 30000

const MIN_LEVEL = 0.008

const FLOOR_RATIO = 3

const HOLD_RATIO = 0.6

const FALL_RATE = 0.2

const RISE_RATE = 0.01

const WARM_MS = 500

export const rms = (samples: Float32Array) => {
  let sum = 0

  for (const s of samples) {
    sum += s * s
  }

  return Math.sqrt(sum / samples.length)
}

export const loudness = (level: number) => {
  const db = 20 * Math.log10(Math.max(level, 1e-6))

  return Math.min(1, Math.max(0, (db + 60) / 45))
}

export class Vad {
  floor = MIN_LEVEL / FLOOR_RATIO

  state: "quiet" | "rising" | "speech" = "quiet"

  #voiced = 0

  #silence = 0

  #length = 0

  #warm = 0

  threshold = (gate = 1) => Math.max(MIN_LEVEL, this.floor * FLOOR_RATIO) * gate

  reset = () => {
    this.state = "quiet"
  }

  step = (level: number, ms: number, gate = 1): VadEvent | undefined => {
    if (this.#warm < WARM_MS) {
      this.#warm += ms
      this.floor += (level - this.floor) * FALL_RATE

      return
    }

    const on = this.threshold(gate)
    const hold = on * HOLD_RATIO

    if (this.state === "quiet") {
      if (level > on) {
        this.state = "rising"
        this.#voiced = ms

        return "rise"
      }

      const rate = level < this.floor ? FALL_RATE : RISE_RATE
      this.floor += (level - this.floor) * rate

      return
    }

    if (this.state === "rising") {
      if (level < hold) {
        this.state = "quiet"

        return "drop"
      }

      this.#voiced += ms

      if (this.#voiced >= START_MS) {
        this.state = "speech"
        this.#length = this.#voiced
        this.#silence = 0

        return "start"
      }

      return
    }

    this.#length += ms
    this.#silence = level < hold ? this.#silence + ms : 0

    if (this.#length >= MAX_MS) {
      this.floor = Math.max(this.floor, level)
    }

    if (this.#silence >= END_MS || this.#length >= MAX_MS) {
      this.state = "quiet"

      return "end"
    }
  }
}
