import type {
  ZephyrNode,
  ZephyrUnresolved,
} from "../../../src/lib/pcb/types.ts"

export type Pad = { number: string; net: string }

export type Part = {
  ref: string
  value: string
  footprint: string
  mpn: string
  pads: Pad[]
}

export type Soc = {
  name: string
  dtsi: string
  kconfig: string
  arch: string
  ramKb: number
  flashKb: number
  toolchain: string[]
  supported: string[]
  ports: Record<string, { node: string; pins: number }>
  reset: string
  nfc: string[]
  spi: { node: string; maxHz: number; sharesWith: string | null }[]
  uart: string[]
  uartSpeed: number
  usb: string
  psel: Record<string, string>
  enable: string[]
  chosen: Record<string, string>
  aliases: Record<string, string>
  partitions: { label: string; name: string; offset: number; size: number }[]
  boardCmake: string[]
  dtcFlags: string[]
  defconfig: string[]
  consoleConfig: string[]
}

export type InternalDevice = {
  label: string
  name: string
  compatible: string[]
  reg: number
  gpios: Record<string, [string, string]>
  alias: string
  bus: string[]
  pinctrl: string[]
}

export type Internal = {
  kind: "uwb" | "accel"
  part: string
  bus: string
  pins: Record<string, string>
  cs: string | null
  sideband: Record<string, string>
  device: InternalDevice | null
}

export type GpioEntry = {
  node: string
  label: string
  alias: string
  pin: string
  flags: string
}

export type Module = {
  id: string
  name: string
  match: string[]
  soc: string
  pads: Record<string, string>
  internal: Internal[]
  kconfigDefaults: Record<string, string>
  regulator: { node: string; mode: string }
  baseBoard: {
    name: string
    leds: GpioEntry[]
    buttons: GpioEntry[]
    uart: { node: string; TX: string; RX: string }
    usb: boolean
  }
}

export type PartData = {
  match: string[]
  label: string
  node: string
  maxHz: number
  active: Record<string, "low" | "high">
  compatible?: string
  gpios?: Record<string, string>
}

export type McuPin = { pad: string; pin: string; net: string }

export type Indicator = GpioEntry & { ref: string; source: McuPin }

export type SpiDevice = {
  bus: string
  reg: number
  label: string
  name: string
  compatible: string
  hz: number
  part: Part
  pins: Record<string, McuPin>
  cs: McuPin | null
  gpios: { prop: string; pin: McuPin; flags: string }[]
}

export type Uart = { node: string; TX: McuPin; RX: McuPin }

export type SampleGpio = { pin: string; flags: string }

export type Board = {
  name: string
  vendor: string
  title: string
  provenance: string
  sample: { led: SampleGpio; input: SampleGpio } | null
  module: Module
  soc: Soc
  leds: Indicator[]
  buttons: Indicator[]
  spis: SpiDevice[]
  uart: Uart | null
  usb: boolean
  reset: boolean
  nfcAsGpio: boolean
  nodes: ZephyrNode[]
  unresolved: ZephyrUnresolved[]
}
