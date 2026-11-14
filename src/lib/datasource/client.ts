import { sql } from "drizzle-orm"
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"

const dialect = new SQLiteSyncDialect()

export const datasource = <TSchema extends Record<string, unknown>>(
  host: HostView,
  name: string,
  schema?: TSchema,
) =>
  drizzle<TSchema>(
    async (query, params, method) => {
      if (method === "run") {
        await host.dsExecute(name, query, params)

        return { rows: [] }
      }

      const { rows } = await host.dsQuery(name, query, params)

      return { rows: method === "get" ? rows[0] : rows }
    },
    { schema },
  )

export const previewQuery = (table: string, limit: number) =>
  dialect.sqlToQuery(sql`SELECT * FROM ${sql.identifier(table)} LIMIT ${limit}`)
