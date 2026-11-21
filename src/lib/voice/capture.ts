import worklet from "./capture.worklet.ts?worker&url"

const PROCESSOR = "atrix-capture"

export const CAPTURE_RATE = 16000

const PRE_ROLL_S = 0.5

const flatten = (frames: Float32Array[]) => {
  const flat = new Float32Array(frames.reduce((n, f) => n + f.length, 0))
  let offset = 0

  for (const frame of frames) {
    flat.set(frame, offset)
    offset += frame.length
  }

  return flat
}

export const wavOf = (frames: Float32Array[], rate: number) => {
  const samples = flatten(frames)
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(at + i, value.charCodeAt(i))
    }
  }

  text(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, samples.length * 2, true)

  samples.forEach((sample, i) => {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true)
  })

  return new Blob([view], { type: "audio/wav" })
}

export class Capture {
  rate: number

  #node: AudioWorkletNode

  #ring: Float32Array[] = []

  #takes = new Set<Float32Array[]>()

  private constructor(node: AudioWorkletNode, rate: number) {
    this.#node = node
    this.rate = rate

    const limit = rate * PRE_ROLL_S

    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      for (const take of this.#takes) {
        take.push(e.data)
      }

      this.#ring.push(e.data)

      let held = this.#ring.reduce((n, f) => n + f.length, 0)

      while (held - this.#ring[0].length >= limit) {
        held -= this.#ring[0].length
        this.#ring.shift()
      }
    }
  }

  static open = async (context: AudioContext, source: AudioNode) => {
    await context.audioWorklet.addModule(worklet)

    const node = new AudioWorkletNode(context, PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    })

    source.connect(node)

    return new Capture(node, context.sampleRate)
  }

  begin = () => {
    const take = [...this.#ring]

    this.#takes.add(take)

    return take
  }

  end = (take: Float32Array[]) => {
    this.#takes.delete(take)
  }

  close = () => {
    this.#takes.clear()
    this.#node.port.onmessage = null
    this.#node.disconnect()
  }
}
