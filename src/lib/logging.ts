import { error, warn } from "@tauri-apps/plugin-log"
import { desktop } from "#lib/platform.ts"

const describe = (value: unknown) => {
  if (value instanceof Error) {
    return value.stack ?? value.message
  }

  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const line = (values: unknown[]) => values.map(describe).join(" ")

const ignore = () => {}

export const logFailure = (context: string, failure: unknown) => {
  if (desktop) {
    error(`${context}: ${describe(failure)}`).catch(ignore)
  }
}

export const startLogging = () => {
  if (!desktop) {
    return
  }

  const forward = {
    error: console.error,
    warn: console.warn,
  }

  console.error = (...values: unknown[]) => {
    forward.error(...values)
    error(line(values)).catch(ignore)
  }

  console.warn = (...values: unknown[]) => {
    forward.warn(...values)
    warn(line(values)).catch(ignore)
  }

  window.addEventListener("error", e => {
    error(`${e.message} at ${e.filename}:${e.lineno}`).catch(ignore)
  })

  window.addEventListener("unhandledrejection", e => {
    error(`unhandled rejection: ${describe(e.reason)}`).catch(ignore)
  })
}
