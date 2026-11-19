import { invoke } from "@tauri-apps/api/core"
import type { Volume } from "./system"

export const setVolume = (level: number) =>
  invoke<void>("set_volume", { level })

export const toggleMute = () => invoke<void>("toggle_mute")

export type AudioDevice = {
  id: string
  name: string
  default: boolean
}

export const audioDevices = () => invoke<AudioDevice[]>("audio_devices")

export const setAudioDevice = (id: string) =>
  invoke<void>("set_audio_device", { id })

export type AudioSession = {
  id: string
  name: string
  path: string
  level: number
  muted: boolean
  system: boolean
}

export type AudioMixer = {
  master: Volume | null
  sessions: AudioSession[]
}

export const audioMixer = () => invoke<AudioMixer>("audio_mixer")

export const setSessionVolume = (id: string, level: number) =>
  invoke<void>("set_session_volume", { id, level })

export const setSessionMute = (id: string, muted: boolean) =>
  invoke<void>("set_session_mute", { id, muted })

export type MediaStatus = {
  title: string
  artist: string
  app: string
  playing: boolean
}

export type MediaAction = "playpause" | "next" | "previous" | "stop"

export const mediaStatus = () => invoke<MediaStatus | null>("media_status")

export const mediaCommand = (action: MediaAction) =>
  invoke<void>("media_command", { action })

export const spectrumStart = () => invoke<void>("spectrum_start")

export const spectrumStop = () => invoke<void>("spectrum_stop")
