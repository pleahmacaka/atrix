import { toast } from "#lib/files/store/toast.svelte.ts"
import { m } from "#lib/paraglide/messages.js"

export type CommandErrors = {
  fail: (reason: unknown) => void
  failed: (reason: unknown) => null
}

const ERRORS: Record<string, () => string> = {
  denied: m.files_errors_denied,
  missing: m.files_errors_missing,
  notReady: m.files_errors_not_ready,
  password: m.files_errors_password,
  unsupported: m.files_errors_unsupported,
  unreachable: m.files_errors_unreachable,
  timeout: m.files_errors_timeout,
  full: m.files_errors_full,
  invalid: m.files_errors_invalid,
}

export const errorMessage = (reason: unknown) => {
  const text = String(reason)

  return ERRORS[text]?.() ?? text
}

export const fail = (reason: unknown) => {
  if (String(reason) !== "cancelled") {
    toast(errorMessage(reason), "error")
  }
}

export const failed = (reason: unknown) => {
  fail(reason)

  return null
}
