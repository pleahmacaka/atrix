import { enqueue } from "#lib/chat/queue.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { loudness, rms, Vad, type VadEvent } from "./vad.ts"
import { voice } from "./voice.svelte.ts"

const TICK_MS = 30

const MAX_STEP_MS = 100

const ECHO_GATE = 2.5

const SMOOTHING = 0.35

const WAIT_MS = 30000

const SLICE_MS = 200

const PARTIAL_MS = 800

const GRACE_MS = 600

type Take = {
  recorder: MediaRecorder
  parts: Blob[]
  done: Promise<Blob>
  partial?: ReturnType<typeof setInterval>
  asking: boolean
  final: boolean
}

const joined = (...texts: string[]) => texts.filter(Boolean).join(" ")

const blobOf = (take: Take) =>
  new Blob(take.parts, { type: take.recorder.mimeType })

class Conversation {
  owner = $state<string | null>(null)

  host = $state<string | null>(null)

  shown = $state(0)

  full = $state(false)

  muted = $state(false)

  hearing = $state(false)

  transcribing = $state(0)

  waiting = $state(false)

  level = $state(0)

  mic = $state(0)

  heard = $state("")

  error = $state<string | null>(null)

  #stream?: MediaStream

  #context?: AudioContext

  #timer?: ReturnType<typeof setInterval>

  #wait?: ReturnType<typeof setTimeout>

  #take?: Take

  #pending = $state("")

  get holding() {
    return !!this.#pending
  }

  #flush?: ReturnType<typeof setTimeout>

  #chain: Promise<unknown> = Promise.resolve()

  #vad = new Vad()

  #run = 0

  start = (owner: string, host: string) => {
    this.end()
    this.owner = owner
    this.host = host
    this.#open()
  }

  end = () => {
    this.#release()
    voice.stopSpeaking()
    clearTimeout(this.#wait)
    this.owner = null
    this.host = null
    this.full = false
    this.muted = false
    this.waiting = false
    this.heard = ""
    this.error = null
  }

  retry = () => {
    this.#release()
    this.#open()
  }

  setMuted = (muted: boolean) => {
    this.muted = muted

    for (const track of this.#stream?.getAudioTracks() ?? []) {
      track.enabled = !muted
    }

    if (muted) {
      this.#discard()
      this.#vad.reset()
      this.hearing = false
    }
  }

  replied = () => {
    clearTimeout(this.#wait)
    this.waiting = false
  }

  #release = () => {
    this.#run++
    clearInterval(this.#timer)
    this.#discard()
    clearTimeout(this.#flush)
    this.#pending = ""

    for (const track of this.#stream?.getTracks() ?? []) {
      track.stop()
    }

    this.#context?.close().catch(() => {})
    this.#stream = undefined
    this.#context = undefined
    this.hearing = false
    this.transcribing = 0
    this.level = 0
    this.mic = 0
  }

  #open = async () => {
    const run = ++this.#run
    const context = new AudioContext()

    this.error = null
    this.#context = context
    context.resume().catch(() => {})

    let stream: MediaStream

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch {
      if (run === this.#run) {
        this.#release()
        this.error = m.voice_mic_denied()
      }

      return
    }

    if (run !== this.#run) {
      for (const track of stream.getTracks()) {
        track.stop()
      }

      return
    }

    await context.resume().catch(() => {})

    const analyser = context.createAnalyser()
    const samples = new Float32Array(analyser.fftSize)

    context.createMediaStreamSource(stream).connect(analyser)
    this.#stream = stream
    this.#vad = new Vad()

    for (const track of stream.getAudioTracks()) {
      track.enabled = !this.muted
      track.onended = () => {
        if (run === this.#run) {
          this.#release()
          this.error = m.voice_mic_lost()
        }
      }
    }

    let last = performance.now()

    this.#timer = setInterval(() => {
      const now = performance.now()
      const ms = Math.min(now - last, MAX_STEP_MS)
      last = now

      if (context.state === "suspended") {
        context.resume().catch(() => {})
      }

      analyser.getFloatTimeDomainData(samples)

      const input = this.muted ? 0 : rms(samples)
      const event = this.#vad.step(input, ms, voice.speaking ? ECHO_GATE : 1)

      if (event) {
        this.#on(event)
      }

      const heard = loudness(input)
      this.mic += (heard - this.mic) * SMOOTHING
      this.level +=
        (Math.max(heard, loudness(voice.outputLevel())) - this.level) *
        SMOOTHING
    }, TICK_MS)
  }

  #on = (event: VadEvent) => {
    if (event === "rise") {
      this.#record()
    } else if (event === "drop") {
      this.#discard()
    } else if (event === "start") {
      this.hearing = true
      this.heard = this.#pending
      clearTimeout(this.#flush)
      voice.stopSpeaking()
      this.#listen()
    } else {
      this.hearing = false
      this.#finish()
    }
  }

  #record = () => {
    const stream = this.#stream

    if (!stream) {
      return
    }

    this.#discard()

    const parts: Blob[] = []
    const recorder = new MediaRecorder(stream)
    const take: Take = {
      recorder,
      parts,
      done: new Promise<Blob>(resolve => {
        recorder.onstop = () => resolve(blobOf(take))
      }),
      asking: false,
      final: false,
    }

    recorder.ondataavailable = e => parts.push(e.data)
    recorder.start(SLICE_MS)
    this.#take = take
  }

  #listen = () => {
    const take = this.#take
    const run = this.#run

    if (!take) {
      return
    }

    take.partial = setInterval(async () => {
      if (take.asking || take.final || take.parts.length === 0) {
        return
      }

      take.asking = true

      const text = await voice.transcribe(blobOf(take)).catch(() => "")

      take.asking = false

      if (text && !take.final && run === this.#run) {
        this.heard = joined(this.#pending, text)
      }
    }, PARTIAL_MS)
  }

  #discard = () => {
    const take = this.#take

    if (!take) {
      return
    }

    take.final = true
    clearInterval(take.partial)

    if (take.recorder.state === "recording") {
      take.recorder.stop()
    }

    this.#take = undefined
  }

  #finish = async () => {
    const take = this.#take
    const run = this.#run

    this.#take = undefined

    if (take?.recorder.state !== "recording") {
      return
    }

    take.final = true
    clearInterval(take.partial)
    take.recorder.stop()
    this.transcribing++

    const transcript = this.#chain.then(async () =>
      voice.transcribe(await take.done),
    )

    this.#chain = transcript.catch(() => {})

    try {
      const text = await transcript

      if (run !== this.#run) {
        return
      }

      this.#pending = joined(this.#pending, text)
      this.heard = this.#pending

      if (this.#pending && !this.hearing) {
        clearTimeout(this.#flush)
        this.#flush = setTimeout(this.#deliver, GRACE_MS)
      }
    } catch (error) {
      if (run === this.#run) {
        voice.fail(error)
      }
    } finally {
      if (run === this.#run) {
        this.transcribing--
      }
    }
  }

  #deliver = () => {
    const text = this.#pending

    if (!text || this.hearing) {
      return
    }

    this.#pending = ""

    this.waiting = true
    clearTimeout(this.#wait)
    this.#wait = setTimeout(this.replied, WAIT_MS)

    if (this.owner) {
      enqueue(this.owner, text)
    }
  }
}

export const conversation = new Conversation()
