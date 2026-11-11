import { type InvokeArgs, invoke } from "@tauri-apps/api/core"
import { m } from "#lib/paraglide/messages.js"

const messageOf = (raw: unknown) => {
  const text = String(raw)
  const split = text.indexOf(":")
  const code = split === -1 ? text : text.slice(0, split)
  const detail = split === -1 ? "" : text.slice(split + 1)

  switch (code) {
    case "command_not_found":
      return m.error_command_not_found({ command: detail })
    case "agent_closed":
      return m.error_agent_closed()
    case "path_not_allowed":
      return m.error_path_not_allowed({ path: detail })
    case "root_protected":
      return m.error_root_protected()
    case "pcb_derive_failed":
      return m.error_pcb_derive_failed({ detail })
    case "pcb_manifest":
      return m.error_pcb_manifest({ detail })
    default:
      return text
  }
}

export const native = <T>(command: string, args?: InvokeArgs) =>
  invoke<T>(command, args).catch((e: unknown) => {
    throw new Error(messageOf(e))
  })
