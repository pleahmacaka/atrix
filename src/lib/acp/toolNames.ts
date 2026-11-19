import { McpServer } from "@modelcontextprotocol/server"

export const BRIDGE_NAME = "atrix"

export const ATRIX_TOOLS = [
  "show_ui",
  "app_list",
  "app_save",
  "list_sessions",
  "send_message",
  "open_session",
  "close_session",
  "channel_send",
  "kg_list",
  "kg_read",
  "kg_create",
  "kg_update",
  "kg_delete",
  "kg_history",
  "kg_subscribe",
  "calendar_list",
  "calendar_add",
  "ds_list",
  "ds_query",
  "ds_execute",
] as const

export const newServer = () =>
  new McpServer({ name: BRIDGE_NAME, version: "0.1.0" })
