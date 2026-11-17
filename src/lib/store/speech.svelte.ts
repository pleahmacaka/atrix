import { isTauri } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { z } from "zod"
import { logFailure } from "#lib/logging.ts"
import { hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { local, type SpeechProvider, type SpeechRole } from "./local.svelte.ts"
import { settings } from "./settings.svelte.ts"

export type SpeechTemplate = {
  id: string
  role: SpeechRole
  kind: SpeechProvider["kind"]
  name: string
  icon: string
  baseURL: string
  model: string
  voice: string
}

export const speechTemplates = (): SpeechTemplate[] => [
  {
    id: "atrix-stt",
    role: "stt",
    kind: "atrix",
    name: m.speech_atrix(),
    icon: "lucide:audio-lines",
    baseURL: "",
    model: "",
    voice: "",
  },
  {
    id: "openai-stt",
    role: "stt",
    kind: "openai",
    name: "OpenAI Whisper",
    icon: "simple-icons:openai",
    baseURL: "https://api.openai.com/v1",
    model: "whisper-1",
    voice: "",
  },
  {
    id: "groq-stt",
    role: "stt",
    kind: "openai",
    name: "Groq Whisper",
    icon: "lucide:zap",
    baseURL: "https://api.groq.com/openai/v1",
    model: "whisper-large-v3-turbo",
    voice: "",
  },
  {
    id: "atrix-tts",
    role: "tts",
    kind: "atrix",
    name: m.speech_atrix(),
    icon: "lucide:audio-lines",
    baseURL: "",
    model: "",
    voice: "",
  },
  {
    id: "openai-tts",
    role: "tts",
    kind: "openai",
    name: "OpenAI TTS",
    icon: "simple-icons:openai",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini-tts",
    voice: "alloy",
  },
]

export const speechTemplateOf = (
  provider: Pick<SpeechProvider, "role" | "kind" | "baseURL">,
) =>
  speechTemplates().find(
    t =>
      t.role === provider.role &&
      t.kind === provider.kind &&
      (t.baseURL === "" || t.baseURL === provider.baseURL),
  )

export const speechIcon = (provider: SpeechProvider) =>
  speechTemplateOf(provider)?.icon ?? "lucide:server"

export const speechProviders = (role: SpeechRole) =>
  local.data.speech.filter(p => p.role === role && !p.removed)

export const activeSpeech = (role: SpeechRole) => {
  const list = speechProviders(role)
  const chosen = local.data.speechActive?.[role]

  return list.find(p => p.id === chosen) ?? list[0]
}

const persist = async () => {
  await local.save()
}

export const saveSpeech = async (provider: Omit<SpeechProvider, "at">) => {
  local.data.speech = [
    ...local.data.speech.filter(p => p.id !== provider.id),
    { ...provider, at: Date.now() },
  ]
  await persist()
}

export const removeSpeech = async (id: string) => {
  local.data.speech = local.data.speech.map(p =>
    p.id === id ? { ...p, key: null, removed: true, at: Date.now() } : p,
  )
  await persist()
}

export const chooseSpeech = async (role: SpeechRole, id: string) => {
  local.data.speechActive = { ...local.data.speechActive, [role]: id }
  await persist()
}

export const migrateVoiceURL = async () => {
  const url = settings.voiceURL

  if (!url || local.data.speech.length > 0) {
    return
  }

  for (const role of ["stt", "tts"] as const) {
    local.data.speech.push({
      id: crypto.randomUUID(),
      role,
      kind: "atrix",
      name: m.speech_my_gateway(),
      baseURL: url,
      key: null,
      model: "",
      voice: "",
      at: Date.now(),
    })
  }

  await persist()
}

const speechFetch: typeof fetch = isTauri() ? tauriFetch : fetch

export const requestFor = (_provider: Pick<SpeechProvider, "kind">) =>
  speechFetch

const transcript = z.object({ text: z.string().optional() })

const providerFor = (role: SpeechRole) => {
  const provider = activeSpeech(role)

  if (!provider) {
    throw new Error(m.voice_unreachable())
  }

  return provider
}

const call = async <T>(
  provider: SpeechProvider,
  path: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<T> => {
  const attempt = async () => {
    const response = await speechFetch(`${provider.baseURL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        ...(provider.key && { Authorization: `Bearer ${provider.key}` }),
      },
    })

    if (!response.ok) {
      throw new Error(`status ${response.status}`)
    }

    return read(response)
  }

  try {
    return await attempt().catch(attempt)
  } catch (e) {
    logFailure(`speech ${path}`, e)

    throw new Error(m.voice_unreachable())
  }
}

export const transcribeLocal = async (audio: Blob) => {
  const provider = providerFor("stt")
  const body = new FormData()

  body.append("file", audio, "speech.webm")

  if (provider.kind === "openai") {
    body.append("model", provider.model)
  }

  const parsed = transcript.safeParse(
    await call(
      provider,
      provider.kind === "atrix" ? "/stt" : "/audio/transcriptions",
      { method: "POST", body },
      response => response.json(),
    ),
  )

  if (!parsed.success) {
    throw new Error(m.voice_failed())
  }

  return (parsed.data.text ?? "").trim()
}

export const synthesizeLocal = (text: string) => {
  const provider = providerFor("tts")
  const atrix = provider.kind === "atrix"

  return call(
    provider,
    atrix ? "/tts" : "/audio/speech",
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(
        atrix
          ? { text, lang: "auto" }
          : { model: provider.model, input: text, voice: provider.voice },
      ),
    },
    async response =>
      new Blob([await response.arrayBuffer()], {
        type: response.headers.get("content-type") ?? "audio/wav",
      }),
  )
}

const remoteHost = () => hostList().find(h => h.id !== LOCAL)?.view

const local_ = () => desktop && !!activeSpeech("stt")

export const speechReady = () => local_() || (!desktop && !!remoteHost())

export const ttsReady = () =>
  (desktop && !!activeSpeech("tts")) || (!desktop && !!remoteHost())

export const transcribeAudio = async (audio: Blob) => {
  const host = remoteHost()

  if (local_() || !host) {
    return transcribeLocal(audio)
  }

  const bytes = new Uint8Array(await audio.arrayBuffer())
  const { text } = await host.speechStt(bytes.toBase64(), audio.type)

  return text
}

export const synthesizeText = async (text: string) => {
  const host = remoteHost()

  if (local_() || !host) {
    return synthesizeLocal(text)
  }

  const { audio, mime } = await host.speechTts(text)

  return new Blob([Uint8Array.fromBase64(audio)], { type: mime })
}

const health = z.object({ model: z.string().optional() }).loose()

const models = z.object({ data: z.array(z.object({ id: z.string() })) })

export const probeSpeech = async (
  provider: Pick<SpeechProvider, "kind" | "baseURL" | "key">,
) => {
  const path = provider.kind === "atrix" ? "/health" : "/models"
  let response: Response

  try {
    response = await requestFor(provider)(`${provider.baseURL}${path}`, {
      headers: provider.key ? { Authorization: `Bearer ${provider.key}` } : {},
    })
  } catch {
    throw new Error(m.gateway_probe_failed())
  }

  if (!response.ok) {
    throw new Error(m.gateway_probe_status({ status: response.status }))
  }

  const body: unknown = await response.json().catch(() => null)

  if (provider.kind === "atrix") {
    const parsed = health.safeParse(body)

    if (!parsed.success) {
      throw new Error(m.gateway_probe_shape())
    }

    return parsed.data.model ? [parsed.data.model] : []
  }

  const parsed = models.safeParse(body)

  if (!parsed.success) {
    throw new Error(m.gateway_probe_shape())
  }

  return parsed.data.data.map(model => model.id).toSorted()
}
