import { isTauri } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { z } from "zod"
import { plainText } from "#lib/chat/plain.ts"
import { m } from "#lib/paraglide/messages.js"
import { settings } from "#lib/store/settings.svelte.ts"
import { rms } from "./vad.ts"

const request = isTauri() ? tauriFetch : fetch

const transcript = z.object({ text: z.string().optional() })

const SPOKEN_LIMIT = 600

const CHUNK_LIMIT = 200

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

const chunksOf = (text: string) => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })
  const chunks: string[] = []
  let total = 0

  for (const { segment } of segmenter.segment(text)) {
    total += segment.length

    if (total > SPOKEN_LIMIT && chunks.length > 0) {
      break
    }

    const last = chunks.at(-1)

    if (
      last !== undefined &&
      chunks.length > 1 &&
      last.length + segment.length <= CHUNK_LIMIT
    ) {
      chunks[chunks.length - 1] = last + segment
    } else {
      chunks.push(segment.slice(0, SPOKEN_LIMIT))
    }
  }

  return chunks.map(c => c.trim()).filter(Boolean)
}

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

  get ready() {
    return !!settings.voiceURL
  }

  fail = (error: unknown) => {
    this.error = error instanceof Error ? error.message : m.voice_failed()
    clearTimeout(this.#clear)
    this.#clear = setTimeout(() => {
      this.error = null
    }, ERROR_MS)
  }

  #call = async (path: string, init: RequestInit) => {
    let response: Response

    try {
      response = await request(`${settings.voiceURL}${path}`, init)
    } catch {
      throw new Error(m.voice_unreachable())
    }

    if (!response.ok) {
      throw new Error(m.voice_failed())
    }

    return response
  }

  transcribe = async (audio: Blob) => {
    const body = new FormData()
    body.append("file", audio, "speech.webm")

    const response = await this.#call("/stt", { method: "POST", body })
    const parsed = transcript.safeParse(await response.json())

    if (!parsed.success) {
      throw new Error(m.voice_failed())
    }

    return (parsed.data.text ?? "").trim()
  }

  synthesize = async (text: string) => {
    const response = await this.#call("/tts", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ text, lang: "auto" }),
    })

    return response.blob()
  }

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

  speak = async (markdown: string) => {
    this.stopSpeaking()

    const run = ++this.#run
    const chunks = chunksOf(plainText(markdown))

    if (chunks.length === 0) {
      return
    }

    this.speaking = true

    try {
      let next = this.#prefetch(chunks[0])

      for (let i = 0; i < chunks.length; i++) {
        const audio = await next

        if (run !== this.#run) {
          return
        }

        if (i + 1 < chunks.length) {
          next = this.#prefetch(chunks[i + 1])
        }

        this.spoken = chunks[i]

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
    this.#run++
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
