declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void

const BATCH = 2048

class CaptureProcessor extends AudioWorkletProcessor {
  buffer = new Float32Array(BATCH)

  filled = 0

  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0]

    if (!channel) {
      return true
    }

    this.buffer.set(channel, this.filled)
    this.filled += channel.length

    if (this.filled + channel.length > BATCH) {
      this.port.postMessage(this.buffer.slice(0, this.filled))
      this.filled = 0
    }

    return true
  }
}

registerProcessor("atrix-capture", CaptureProcessor)

export {}
