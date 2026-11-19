import { type InvokeArgs, invoke } from "@tauri-apps/api/core"
import { m } from "#lib/paraglide/messages.js"

export const messageOf = (raw: unknown) => {
  const text = String(raw)
  const split = text.indexOf(":")
  const code = split === -1 ? text : text.slice(0, split)
  const detail = split === -1 ? "" : text.slice(split + 1)

  switch (code) {
    case "command_not_found":
      return m.error_command_not_found({ command: detail })
    case "agent_closed":
      return m.error_agent_closed()
    case "subagent_selected":
      return m.error_subagent_selected()
    case "path_not_allowed":
      return m.error_path_not_allowed({ path: detail })
    case "root_protected":
      return m.error_root_protected()
    case "pcb_derive_failed":
      return m.error_pcb_derive_failed({ detail })
    case "pcb_manifest":
      return m.error_pcb_manifest({ detail })
    case "versitygw_download":
    case "versitygw_archive_invalid":
      return m.error_store_download()
    case "versitygw_checksum_mismatch":
      return m.error_store_checksum()
    case "unsupported_platform":
      return m.error_store_platform()
    case "install_permission":
      return m.error_install_permission()
    case "install_download":
      return m.error_install_download()
    case "install_checksum":
      return m.error_install_checksum()
    case "install_archive_invalid":
      return m.error_install_archive({ detail })
    case "install_failed":
    case "install_unsupported":
    case "install_name_invalid":
      return m.error_install_failed({ detail })
    case "kg_store_timeout":
      return m.error_store_timeout()
    case "ds_failed":
      return m.error_ds_failed({ detail })
    case "ds_name_invalid":
      return m.error_ds_name_invalid({ name: detail })
    case "ds_not_found":
      return m.error_ds_not_found({ name: detail })
    case "ds_exists":
      return m.error_ds_exists({ name: detail })
    case "ds_empty_sql":
      return m.error_ds_empty_sql()
    case "ds_multiple_statements":
      return m.error_ds_multiple_statements()
    case "ds_read_only":
      return m.error_ds_read_only()
    case "ds_sync_unset":
      return m.error_ds_sync_unset({ name: detail })
    case "usage_failed":
      return m.error_usage_failed({ detail })
    case "usage_login":
      return m.error_usage_login()
    case "usage_submit_failed":
      return m.error_usage_submit_failed({ detail })
    case "usage_interval_invalid":
      return m.error_usage_interval()
    case "attachment_invalid":
      return m.error_attachment_invalid({ name: detail })
    case "usage_missing":
      return m.error_usage_missing()
    case "usage_timeout":
      return m.error_usage_timeout()
    case "channel_owner_invalid":
      return m.error_channel_owner_invalid()
    case "channel_token_missing":
      return m.error_channel_token_missing()
    case "channel_token_invalid":
      return m.error_channel_token_invalid()
    case "channel_intents":
      return m.error_channel_intents()
    case "channel_closed":
      return m.error_channel_closed({ code: detail })
    case "channel_not_connected":
      return m.error_channel_not_connected()
    case "channel_id_invalid":
      return m.error_channel_id_invalid({ id: detail })
    case "channel_send_failed":
      return m.error_channel_send_failed({ detail })
    case "channel_keyring":
      return m.error_channel_keyring({ detail })
    case "pair_code_invalid":
      return m.error_pair_code()
    case "pair_expired":
      return m.sync_expired()
    case "pair_unreachable":
      return m.error_pair_unreachable()
    case "pair_self":
      return m.error_pair_self()
    case "peer_offline":
      return m.error_peer_offline()
    case "peer_timeout":
      return m.error_peer_timeout()
    case "net_key_invalid":
      return m.error_net_key_invalid({ path: detail })
    default:
      return text
  }
}

export const native = <T>(command: string, args?: InvokeArgs) =>
  invoke<T>(command, args).catch((e: unknown) => {
    throw new Error(messageOf(e))
  })
