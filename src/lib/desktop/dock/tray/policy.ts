import type { Battery } from "#lib/desktop/native/index.js"
import { m } from "#lib/paraglide/messages.js"

export function batteryIcon(battery: Battery): string {
  if (battery.charging) {
    return "lucide:battery-charging"
  }

  if (battery.percent >= 80) {
    return "lucide:battery-full"
  }

  if (battery.percent >= 40) {
    return "lucide:battery-medium"
  }

  if (battery.percent >= 15) {
    return "lucide:battery-low"
  }

  return "lucide:battery-warning"
}

export function batteryTitle(battery: Battery): string {
  return battery.charging
    ? m.dock_battery_charging({ percent: battery.percent })
    : m.dock_battery_level({ percent: battery.percent })
}
