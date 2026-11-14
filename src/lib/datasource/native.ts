import { native } from "#lib/acp/native.ts"
import type { DatasourceRequest } from "#lib/p2p/protocol.ts"

const WRITES = new Set<DatasourceRequest["op"]>([
  "ds.create",
  "ds.delete",
  "ds.execute",
  "ds.sync.set",
  "ds.sync",
])

export const isWrite = (request: DatasourceRequest) => WRITES.has(request.op)

export const datasourceCall = ({ op, ...args }: DatasourceRequest) =>
  native(op.replaceAll(".", "_"), args)
