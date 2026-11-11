import { Color } from "three"

const GROUND = "#475569"

const POWER = "#ef4444"

const SIGNALS: Record<string, string> = {
  SDA: "#3b82f6",
  SCL: "#eab308",
  MOSI: "#a855f7",
  MISO: "#ec4899",
  SCK: "#f97316",
  SCLK: "#f97316",
  CS: "#14b8a6",
  NSS: "#14b8a6",
  TX: "#22c55e",
  TXD: "#22c55e",
  RX: "#06b6d4",
  RXD: "#06b6d4",
  SWDIO: "#8b5cf6",
  SWCLK: "#f59e0b",
}

const POWER_TOKENS = [
  "VCC",
  "VDD",
  "VBUS",
  "VBAT",
  "VIN",
  "VSYS",
  "VOUT",
  "PWR",
]

const tokensOf = (net: string) =>
  net
    .toUpperCase()
    .split(/[^A-Z0-9+]+/)
    .filter(Boolean)

const isVoltage = (token: string) =>
  token.startsWith("+") ||
  (token.includes("V") &&
    [...token].every(c => c === "V" || (c >= "0" && c <= "9")) &&
    /\d/.test(token))

const hueOf = (net: string) => {
  let hash = 0

  for (const c of net) {
    hash = (hash * 31 + c.charCodeAt(0)) | 0
  }

  return Math.abs(hash) % 360
}

export const netRole = (net: string) => {
  const tokens = tokensOf(net)

  if (tokens.some(t => t.includes("GND"))) {
    return "ground"
  }

  if (
    tokens.some(t => isVoltage(t) || POWER_TOKENS.some(p => t.startsWith(p)))
  ) {
    return "power"
  }

  return tokens.find(t => Object.hasOwn(SIGNALS, t)) ?? null
}

export const netColor = (net: string) => {
  const role = netRole(net)

  if (role === "ground") {
    return GROUND
  }

  if (role === "power") {
    return POWER
  }

  return role
    ? (SIGNALS[role] ?? GROUND)
    : `#${new Color().setHSL(hueOf(net) / 360, 0.75, 0.62).getHexString()}`
}
