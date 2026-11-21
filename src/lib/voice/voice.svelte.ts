import { plainText } from "#lib/chat/plain.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import {
  speechReady,
  synthesizeText,
  transcribeAudio,
  ttsReady,
} from "#lib/store/speech.svelte.ts"
import { rms } from "./vad.ts"

const SPOKEN_LIMIT = 600

const ERROR_MS = 6000

const ENVELOPE_S = 0.05

const ENVELOPE_RATE = 16000

const envelopeOf = async (audio: Blob) => {
  const context = new OfflineAudioContext(1, 1, ENVELOPE_RATE)
  const samples = (
    await context.decodeAudioData(await audio.arrayBuffer())
  ).getChannelData(0)
  const step = ENVELOPE_RATE * ENVELOPE_S
  const levels: number[] = []

  for (let i = 0; i < samples.length; i += step) {
    levels.push(rms(samples.subarray(i, i + step)))
  }

  return levels
}

const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" })

type Line = { text: string; audio?: Promise<Blob> }

class Voice {
  recording = $state(false)

  transcribing = $state(false)

  speaking = $state(false)

  spoken = $state("")

  elapsed = $state(0)

  error = $state<string | null>(null)

  #recorder?: MediaRecorder

  #timer?: ReturnType<typeof setInterval>

  #clear?: ReturnType<typeof setTimeout>

  #audio?: HTMLAudioElement

  #run = 0

  #envelope: number[] = []

  #lines: Line[] = []

  #draining?: Promise<void>

  #fed = 0

  #budget = SPOKEN_LIMIT

  #cut = false

  get ready() {
    return speechReady()
  }

  get canSpeak() {
    return ttsReady()
  }

  fail = (error: unknown) => {
    this.error = error instanceof Error ? error.message : m.voice_failed()
    clearTimeout(this.#clear)
    this.#clear = setTimeout(() => {
      this.error = null
    }, ERROR_MS)
  }

  transcribe = (audio: Blob) => transcribeAudio(audio)

  synthesize = (text: string) => synthesizeText(text)

  #prefetch = (text: string) => {
    const pending = this.synthesize(text)
    pending.catch(() => {})

    return pending
  }

  #play = (audio: Blob) =>
    new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(audio)
      const player = new Audio(url)
      player.preservesPitch = true
      player.playbackRate = settings.voiceRate
      this.#audio = player
      this.#envelope = []

      envelopeOf(audio)
        .then(levels => {
          if (this.#audio === player) {
            this.#envelope = levels
          }
        })
        .catch(() => {})

      player.onpause = () => {
        URL.revokeObjectURL(url)
        resolve()
      }

      player.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error(m.voice_playback()))
      }

      player.play().catch(() => reject(new Error(m.voice_playback())))
    })

  begin = () => {
    this.#fed = 0
    this.#budget = SPOKEN_LIMIT
    this.#cut = false
  }

  feed = (markdown: string, final: boolean) => {
    if (this.#cut || markdown.length < this.#fed) {
      return
    }

    const parts = [...sentences.segment(markdown.slice(this.#fed))]
    const complete = final ? parts : parts.slice(0, -1)

    for (const { segment } of complete) {
      this.#fed += segment.length

      const text = plainText(segment).trim()

      if (text.length > this.#budget && this.#budget < SPOKEN_LIMIT) {
        this.#budget = 0
      } else if (text) {
        const line = text.slice(0, this.#budget)

        this.#budget -= line.length
        this.#lines.push({ text: line })
      }
    }

    const upcoming = this.#lines[0]

    if (this.speaking && this.spoken && upcoming) {
      upcoming.audio ??= this.#prefetch(upcoming.text)
    }

    if (!this.#draining && this.#lines.length > 0) {
      const draining: Promise<void> = this.#drain().finally(() => {
        if (this.#draining === draining) {
          this.#draining = undefined
        }
      })

      this.#draining = draining
    }
  }

  speak = (markdown: string) => {
    this.stopSpeaking()
    this.begin()
    this.feed(markdown, true)

    return this.#draining ?? Promise.resolve()
  }

  #drain = async () => {
    const run = this.#run

    this.speaking = true

    try {
      for (let line = this.#lines.shift(); line; line = this.#lines.shift()) {
        line.audio ??= this.#prefetch(line.text)

        const audio = await line.audio
        const next = this.#lines[0]

        if (next) {
          next.audio ??= this.#prefetch(next.text)
        }

        if (run !== this.#run) {
          return
        }

        this.spoken = line.text

        await this.#play(audio)

        if (run !== this.#run) {
          return
        }
      }
    } catch (error) {
      if (run === this.#run) {
        this.fail(error)
      }
    } finally {
      if (run === this.#run) {
        this.speaking = false
        this.spoken = ""
      }
    }
  }

  outputLevel = () => {
    const player = this.#audio

    if (!player || !this.speaking) {
      return 0
    }

    return this.#envelope[Math.floor(player.currentTime / ENVELOPE_S)] ?? 0
  }

  setRate = (rate: number) => {
    settings.setVoiceRate(rate)

    if (this.#audio) {
      this.#audio.playbackRate = rate
    }
  }

  stopSpeaking = () => {
    this.hush()
    this.#cut = true
  }

  hush = () => {
    this.#run++
    this.#lines = []
    this.#draining = undefined
    this.#audio?.pause()
    this.#audio = undefined
    this.speaking = false
    this.spoken = ""
  }

  toggle = (onText: (text: string) => void) => {
    if (this.recording) {
      this.#recorder?.stop()
    } else if (!this.transcribing) {
      this.#start(onText)
    }
  }

  #start = async (onText: (text: string) => void) => {
    this.stopSpeaking()
    this.error = null

    let stream: MediaStream
    let recorder: MediaRecorder

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorder = new MediaRecorder(stream)
    } catch {
      this.fail(new Error(m.voice_mic_denied()))

      return
    }

    const parts: Blob[] = []

    recorder.ondataavailable = e => parts.push(e.data)

    recorder.onstop = async () => {
      for (const track of stream.getTracks()) {
        track.stop()
      }

      clearInterval(this.#timer)
      this.recording = false

      const audio = new Blob(parts, { type: recorder.mimeType })

      if (audio.size === 0) {
        return
      }

      this.transcribing = true

      try {
        const text = await this.transcribe(audio)

        if (text) {
          onText(text)
        }
      } catch (error) {
        this.fail(error)
      } finally {
        this.transcribing = false
      }
    }

    const started = Date.now()

    recorder.start()
    this.#recorder = recorder
    this.elapsed = 0
    this.recording = true
    this.#timer = setInterval(() => {
      this.elapsed = Math.floor((Date.now() - started) / 1000)
    }, 250)
  }
}

export const voice = new Voice()
