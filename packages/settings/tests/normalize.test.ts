import { expect, test } from "bun:test"
import {
  DOCK_ALIGNS,
  DOCK_STYLES,
  defaultAppearance,
  defaultDevice,
  defaultProfile,
  SYSTEM_FONT,
  standaloneLook,
  TERMINAL_APPS,
} from "../src/defaults"
import type { DeviceSettings, DockWidget, Profile } from "../src/model"
import { isLastEntryPoint } from "../src/model"
import {
  sanitizeWidgets,
  standaloneAppearance,
  withDeviceDefaults,
  withProfileDefaults,
} from "../src/normalize"

test("defaults retain shared identities", () => {
  expect(defaultProfile.appearance).toBe(defaultAppearance)
  expect(standaloneLook).toEqual({ ...defaultAppearance, mode: "system" })
  expect(DOCK_STYLES).toEqual(["windows", "mac"])
  expect(DOCK_ALIGNS).toEqual(["start", "center"])
  expect(TERMINAL_APPS).toEqual([
    "auto",
    "atrix",
    "wt",
    "pwsh",
    "powershell",
    "cmd",
  ])
  expect(SYSTEM_FONT).toBe("system")
})

test("missing devices and profiles receive defaults without mutating them", () => {
  for (const saved of [undefined, null, {}]) {
    const device = withDeviceDefaults(saved)
    const profile = withProfileDefaults(saved)

    expect(device).toEqual(defaultDevice)
    expect(profile).toEqual(defaultProfile)
    expect(device).not.toBe(defaultDevice)
    expect(device.features).not.toBe(defaultDevice.features)
    expect(device.dockWidgets[0]).not.toBe(defaultDevice.dockWidgets[0])
    expect(profile.appearance).not.toBe(defaultAppearance)
    expect(profile.calendar.tags).toBe(defaultProfile.calendar.tags)
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
  expect(device.features).toEqual({
    dock: true,
    launcher: false,
    calendar: true,
  })
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

test("profiles merge every nested section with its defaults", () => {
  const saved = {
    appearance: { mode: "light", accentHue: 50 },
    launcher: { maxResults: 0, showTodos: false },
    calendar: { tags: [], weekStartsOn: 1 },
    todo: { showCompleted: true },
  } as unknown as Partial<Profile>
  const profile = withProfileDefaults(saved)

  expect(profile.appearance).toEqual({
    ...defaultAppearance,
    mode: "light",
    accentHue: 50,
  })
  expect(profile.launcher).toEqual({
    ...defaultProfile.launcher,
    maxResults: 0,
    showTodos: false,
  })
  expect(profile.calendar).toEqual({
    ...defaultProfile.calendar,
    tags: [],
    weekStartsOn: 1,
  })
  expect(profile.todo).toEqual({
    ...defaultProfile.todo,
    showCompleted: true,
  })
})

test("standalone appearance follows the linked profile only when both switches are enabled", () => {
  const profile = { appearance: { ...defaultAppearance, accentHue: 90 } }

  for (const linked of [false, true]) {
    for (const followAtrix of [false, true]) {
      const appearance = standaloneAppearance(
        { linked, profile },
        { followAtrix, mode: "dark", look: { mode: "light", texture: 0.8 } },
      )

      expect(appearance).toEqual(
        linked && followAtrix
          ? profile.appearance
          : { ...defaultAppearance, mode: "light", texture: 0.8 },
      )
    }
  }
  expect(
    standaloneAppearance(
      { linked: true, profile: null },
      { followAtrix: true, mode: "light" },
    ),
  ).toEqual(defaultAppearance)
})

test("only dock and launcher are entry points", () => {
  expect(
    isLastEntryPoint({ dock: true, launcher: false, calendar: true }, "dock"),
  ).toBe(true)
  expect(
    isLastEntryPoint(
      { dock: false, launcher: true, calendar: false },
      "launcher",
    ),
  ).toBe(true)
  expect(isLastEntryPoint(defaultDevice.features, "dock")).toBe(false)
  expect(
    isLastEntryPoint(
      { dock: false, launcher: false, calendar: true },
      "calendar",
    ),
  ).toBe(false)
})
