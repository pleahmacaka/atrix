import { expect, test } from "bun:test"
import {
  defaultDevice,
  defaultProfile,
} from "../../../../src/lib/desktop/settings/defaults.ts"
import type {
  DeviceSettings,
  DockWidget,
  Profile,
} from "../../../../src/lib/desktop/settings/model.ts"
import { isLastEntryPoint } from "../../../../src/lib/desktop/settings/model.ts"
import {
  sanitizeWidgets,
  withDeviceDefaults,
  withProfileDefaults,
} from "../../../../src/lib/desktop/settings/normalize.ts"

test("missing devices and profiles receive defaults without mutating them", () => {
  for (const saved of [undefined, null, {}]) {
    const device = withDeviceDefaults(saved)
    const profile = withProfileDefaults(saved)

    expect(device).toEqual(defaultDevice)
    expect(profile).toEqual(defaultProfile)
    expect(device).not.toBe(defaultDevice)
    expect(device.features).not.toBe(defaultDevice.features)
    expect(device.dockWidgets[0]).not.toBe(defaultDevice.dockWidgets[0])
    expect(profile.launcher).not.toBe(defaultProfile.launcher)
  }
})

test("device normalization merges nested defaults and preserves false", () => {
  const saved = {
    dockHeight: 40,
    features: { launcher: false },
  } as unknown as Partial<DeviceSettings>
  const before = structuredClone(saved)
  const device = withDeviceDefaults(saved)

  expect(device.dockHeight).toBe(40)
  expect(device.features).toEqual({ dock: true, launcher: false })
  expect(saved).toEqual(before)
})

test("widgets keep valid order, deduplicate ids, append missing kinds and normalize sizes", () => {
  const saved = [
    { id: "bad", kind: "unknown", size: 42 },
    { id: "bad", kind: "spacer", size: 4 },
    { id: "bad", kind: "apps", size: 9 },
    { id: "custom-tray", kind: "tray", size: 99 },
    { id: "zero", kind: "spacer", size: 0 },
    { id: "large", kind: "spacer", size: 48 },
  ] as DockWidget[]
  const before = structuredClone(saved)

  expect(sanitizeWidgets(saved)).toEqual([
    { id: "bad", kind: "spacer", size: 8 },
    { id: "custom-tray", kind: "tray", size: 0 },
    { id: "zero", kind: "spacer", size: 24 },
    { id: "large", kind: "spacer", size: 48 },
    { id: "lead", kind: "lead", size: 0 },
    { id: "apps", kind: "apps", size: 0 },
  ])
  expect(saved).toEqual(before)
  expect(sanitizeWidgets(undefined)).toEqual(defaultDevice.dockWidgets)
  expect(sanitizeWidgets([])).toEqual(defaultDevice.dockWidgets)
})

test("profiles merge the launcher section with its defaults", () => {
  const saved = {
    launcher: { maxResults: 0, showTodos: false },
  } as unknown as Partial<Profile>
  const profile = withProfileDefaults(saved)

  expect(profile.launcher).toEqual({
    ...defaultProfile.launcher,
    maxResults: 0,
    showTodos: false,
  })
})

test("only dock and launcher are entry points", () => {
  expect(isLastEntryPoint({ dock: true, launcher: false }, "dock")).toBe(true)
  expect(isLastEntryPoint({ dock: false, launcher: true }, "launcher")).toBe(
    true,
  )
  expect(isLastEntryPoint(defaultDevice.features, "dock")).toBe(false)
  expect(isLastEntryPoint({ dock: false, launcher: false }, "dock")).toBe(false)
})
