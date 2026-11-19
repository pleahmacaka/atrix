import { m } from "#lib/paraglide/messages.js"

const ERRORS: Record<string, () => string> = {
  "denied-user": m.dock_radio_denied_user,
  "denied-system": m.dock_radio_denied_system,
  missing: m.dock_radio_missing,
}

export const radioError = (code: string) =>
  (ERRORS[code] ?? m.dock_radio_failed)()
