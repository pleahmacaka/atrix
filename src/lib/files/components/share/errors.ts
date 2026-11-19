import { m } from "#lib/paraglide/messages.js"

const PROBLEMS: Record<string, () => string> = {
  empty: m.files_share_errors_empty,
  unsupported: m.files_share_errors_unsupported,
  unreachable: m.files_share_errors_unreachable,
  denied: m.files_share_errors_denied,
  revoked: m.files_share_errors_revoked,
  blocked: m.files_share_errors_blocked,
  missing: m.files_share_errors_missing,
  busy: m.files_share_errors_busy,
  pending: m.files_share_errors_pending,
  unpaired: m.files_share_errors_unpaired,
  notReady: m.files_share_errors_not_ready,
}

export const shareError = (reason: unknown) => {
  const code = String(reason)
  const message = Object.hasOwn(PROBLEMS, code)
    ? PROBLEMS[code]
    : m.files_share_errors_failed

  return message()
}
