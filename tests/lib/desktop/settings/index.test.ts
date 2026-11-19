import { beforeEach, expect, mock, test } from "bun:test"

const data = new Map<string, unknown>()
const emitted: unknown[] = []
const operations: string[] = []
let saveHook: (() => Promise<void>) | undefined
let emitError: Error | undefined

mock.module("@tauri-apps/plugin-store", () => ({
  load: async (file: string) => {
    expect(file).toBe("settings.json")

    return {
      get: async (key: string) => {
        operations.push(`get:${key}`)

        return data.get(key)
      },
      set: async (key: string, value: unknown) => {
        operations.push(`set:${key}`)
        data.set(key, value)
      },
      delete: async (key: string) => {
        operations.push(`delete:${key}`)

        return data.delete(key)
      },
      save: async () => {
        operations.push("save")
        await saveHook?.()
      },
    }
  },
}))

mock.module("@tauri-apps/api/event", () => ({
  emit: async (name: string, value: unknown) => {
    operations.push(`emit:${name}`)
    if (emitError) {
      throw emitError
    }
    emitted.push(value)
  },
  listen: async () => () => undefined,
}))

const {
  DEVICE_EVENT,
  PROFILE_EVENT,
  defaultDevice,
  defaultProfile,
  loadDevice,
  loadProfile,
  saveDevice,
  saveProfile,
  updateDevice,
  updateProfile,
} = await import("../../../../src/lib/desktop/settings/index.ts")

beforeEach(() => {
  data.clear()
  emitted.length = 0
  operations.length = 0
  saveHook = undefined
  emitError = undefined
})

test("a partial profile is completed before it is stored", async () => {
  const partial = { launcher: { maxResults: 3 } }

  await saveProfile(partial as unknown as Parameters<typeof saveProfile>[0])

  const [emitted0] = emitted as [{ launcher: { showWindows: boolean } }]

  expect(emitted0.launcher.showWindows).toBe(
    defaultProfile.launcher.showWindows,
  )
  expect((await loadProfile()).launcher.webSearch).toBe(
    defaultProfile.launcher.webSearch,
  )
})

test("a device from an older build gains the new dock defaults", async () => {
  data.set("device", { dockHeight: 40 })

  const device = await loadDevice()

  expect(device.dockHeight).toBe(40)
  expect(device.showMedia).toBe(defaultDevice.showMedia)
  expect(device.showMeters).toBe(defaultDevice.showMeters)
  expect(device.showNetwork).toBe(defaultDevice.showNetwork)
})

test("device saves and both updates share one ordered write queue", async () => {
  let release = () => {}
  let started = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const firstSave = new Promise<void>(resolve => {
    started = resolve
  })
  saveHook = async () => {
    saveHook = undefined
    started()
    await gate
  }

  const saved = { ...defaultDevice, dockHeight: 60 }
  const saving = saveDevice(saved)
  const updatingProfile = updateProfile(profile => ({
    ...profile,
    launcher: { ...profile.launcher, showTodos: false },
  }))
  const updatingDevice = updateDevice(device => ({
    ...device,
    dockHeight: device.dockHeight + 1,
  }))

  await firstSave
  expect(operations).toEqual(["set:device", "save"])
  release()
  expect(await saving).toBeUndefined()
  expect(await updatingProfile).toBe(true)
  expect(await updatingDevice).toBeUndefined()
  expect(data.get("device")).toEqual({ ...saved, dockHeight: 61 })
  expect(operations).toEqual([
    "set:device",
    "save",
    `emit:${DEVICE_EVENT}`,
    "get:profile",
    "set:profile",
    "save",
    `emit:${PROFILE_EVENT}`,
    "get:device",
    "set:device",
    "save",
    `emit:${DEVICE_EVENT}`,
  ])
  const profile = await loadProfile()
  expect(profile.launcher.showTodos).toBe(false)
  expect(emitted[0]).toBe(saved)
  expect(emitted[1]).toEqual(profile)
})

test("a failed queued write rejects its caller without poisoning later writes", async () => {
  emitError = new Error("emit failed")
  const saved = { ...defaultDevice, dockHeight: 60 }

  await expect(saveDevice(saved)).rejects.toThrow("emit failed")
  emitError = undefined
  await updateDevice(device => ({
    ...device,
    dockHeight: device.dockHeight + 1,
  }))

  expect(data.get("device")).toEqual({ ...saved, dockHeight: 61 })
  expect(emitted).toEqual([{ ...saved, dockHeight: 61 }])
})

test("profile saves wait in the same write queue as device saves", async () => {
  let release = () => {}
  let started = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const firstSave = new Promise<void>(resolve => {
    started = resolve
  })
  saveHook = async () => {
    saveHook = undefined
    started()
    await gate
  }

  const saving = saveDevice(defaultDevice)
  const profileSave = saveProfile(defaultProfile)
  await firstSave
  expect(operations).toEqual(["set:device", "save"])
  release()
  await saving
  await profileSave
  expect(operations).toEqual([
    "set:device",
    "save",
    `emit:${DEVICE_EVENT}`,
    "get:profile",
    "set:profile",
    "save",
    `emit:${PROFILE_EVENT}`,
  ])
})

test("a profile save reports whether the stored profile changed", async () => {
  const wider = {
    ...defaultProfile,
    launcher: { ...defaultProfile.launcher, maxResults: 12 },
  }

  expect(await saveProfile(defaultProfile)).toBe(false)
  expect(await saveProfile(wider)).toBe(true)
  expect(await saveProfile(wider)).toBe(false)
})
