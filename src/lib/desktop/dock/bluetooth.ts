import type { BluetoothKind } from "#lib/desktop/native/bluetooth.js"
import { m } from "#lib/paraglide/messages.js"

export const KIND_ICONS: Record<BluetoothKind, string> = {
  headphones: "lucide:headphones",
  speaker: "lucide:speaker",
  keyboard: "lucide:keyboard",
  mouse: "lucide:mouse",
  gamepad: "lucide:gamepad-2",
  pen: "lucide:pen-tool",
  input: "lucide:mouse-pointer-2",
  phone: "lucide:smartphone",
  computer: "lucide:laptop",
  watch: "lucide:watch",
  printer: "lucide:printer",
  other: "lucide:bluetooth",
}

export const KIND_LABELS: Record<BluetoothKind, () => string> = {
  headphones: m.dock_bluetooth_kind_headphones,
  speaker: m.dock_bluetooth_kind_speaker,
  keyboard: m.dock_bluetooth_kind_keyboard,
  mouse: m.dock_bluetooth_kind_mouse,
  gamepad: m.dock_bluetooth_kind_gamepad,
  pen: m.dock_bluetooth_kind_pen,
  input: m.dock_bluetooth_kind_input,
  phone: m.dock_bluetooth_kind_phone,
  computer: m.dock_bluetooth_kind_computer,
  watch: m.dock_bluetooth_kind_watch,
  printer: m.dock_bluetooth_kind_printer,
  other: m.dock_bluetooth_kind_other,
}

export const SIGNAL_ICONS = [
  "lucide:signal-zero",
  "lucide:signal-low",
  "lucide:signal-medium",
  "lucide:signal-high",
  "lucide:signal",
]

const PAIR_ERRORS: Record<string, () => string> = {
  timeout: m.dock_bluetooth_pair_timeout,
  auth: m.dock_bluetooth_pair_auth,
  "not-ready": m.dock_bluetooth_pair_not_ready,
  busy: m.dock_bluetooth_pair_busy,
}

export const pairError = (code: string) =>
  code === "canceled"
    ? ""
    : (PAIR_ERRORS[code] ?? m.dock_bluetooth_pair_failed)()
