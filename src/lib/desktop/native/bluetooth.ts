import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export type BluetoothKind =
  | "headphones"
  | "speaker"
  | "keyboard"
  | "mouse"
  | "gamepad"
  | "pen"
  | "input"
  | "phone"
  | "computer"
  | "watch"
  | "printer"
  | "other"

export type BluetoothDevice = {
  id: string
  name: string
  kind: BluetoothKind
  connected: boolean
  audio: boolean
  signal: number | null
}

export type PairingPrompt = {
  id: string
  kind: "display" | "confirm" | "provide"
  pin: string
}

export const bluetoothDevices = () =>
  invoke<BluetoothDevice[]>("bluetooth_devices")

let scanning: Promise<unknown> = Promise.resolve()

export const bluetoothScan = (on: boolean) => {
  const call = scanning.then(() => invoke<void>("bluetooth_scan", { on }))

  scanning = call.catch(() => undefined)

  return call
}

export const onBluetoothScan = (run: (devices: BluetoothDevice[]) => void) =>
  listen<BluetoothDevice[]>("bluetooth-scan", e => run(e.payload))

export const bluetoothPair = (id: string) =>
  invoke<void>("bluetooth_pair", { id })

export const onPairingPrompt = (run: (prompt: PairingPrompt) => void) =>
  listen<PairingPrompt>("bluetooth-pairing", e => run(e.payload))

export const bluetoothPairReply = (id: string, accept: boolean, pin?: string) =>
  invoke<void>("bluetooth_pair_reply", { id, accept, pin: pin ?? null })

export const bluetoothUnpair = (id: string) =>
  invoke<void>("bluetooth_unpair", { id })

export const bluetoothConnect = (id: string, on: boolean) =>
  invoke<void>("bluetooth_connect", { id, on })
