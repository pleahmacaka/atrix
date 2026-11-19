import { emit, listen } from "@tauri-apps/api/event"
import { load } from "@tauri-apps/plugin-store"
import { isEqual } from "es-toolkit"
import type { DeviceSettings, Profile } from "./model"
import { withDeviceDefaults, withProfileDefaults } from "./normalize"

const FILE = "settings.json"
const DEVICE_KEY = "device"
const PROFILE_KEY = "profile"
const LOCK = "atrix-settings"
export const DEVICE_EVENT = "settings-changed"
export const PROFILE_EVENT = "profile-changed"

// navigator.locks spans every window; the chain keeps order where locks are missing, such as tests
let writing: Promise<unknown> = Promise.resolve()

const exclusive = <T>(task: () => Promise<T>) =>
  typeof navigator !== "undefined" && "locks" in navigator
    ? navigator.locks.request(LOCK, task)
    : task()

const queued = <T>(task: () => Promise<T>) => {
  const next = writing.then(() => exclusive(task))

  writing = next.then(
    () => undefined,
    () => undefined,
  )

  return next
}

export const loadDevice = async (): Promise<DeviceSettings> => {
  const store = await load(FILE)

  return withDeviceDefaults(
    await store.get<Partial<DeviceSettings>>(DEVICE_KEY),
  )
}

const writeDevice = async (value: DeviceSettings) => {
  const store = await load(FILE)

  await store.set(DEVICE_KEY, value)
  await store.save()
  await emit(DEVICE_EVENT, value)
}

export const saveDevice = (value: DeviceSettings) =>
  queued(() => writeDevice(value))

export const updateDevice = (
  change: (device: DeviceSettings) => DeviceSettings,
) => queued(async () => writeDevice(change(await loadDevice())))

export const onDevice = (handler: (value: DeviceSettings) => void) =>
  listen<DeviceSettings>(DEVICE_EVENT, event => handler(event.payload))

export const loadProfile = async (): Promise<Profile> => {
  const store = await load(FILE)

  return withProfileDefaults(await store.get<Partial<Profile>>(PROFILE_KEY))
}

const writeProfile = async (value: Profile, before: Profile) => {
  const profile = withProfileDefaults(value)
  const store = await load(FILE)

  await store.set(PROFILE_KEY, profile)
  await store.save()
  await emit(PROFILE_EVENT, profile)

  return !isEqual(profile, before)
}

export const saveProfile = (value: Profile) =>
  queued(async () => writeProfile(value, await loadProfile()))

export const updateProfile = (change: (profile: Profile) => Profile) =>
  queued(async () => {
    const before = await loadProfile()

    return writeProfile(change(before), before)
  })

export const onProfile = (handler: (value: Profile) => void) =>
  listen<Profile>(PROFILE_EVENT, event => handler(event.payload))
