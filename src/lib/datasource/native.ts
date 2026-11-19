import { native } from "#lib/native.ts"
import type { Answer, DatasourceRequest } from "#lib/p2p/protocol.ts"

const WRITES = new Set<DatasourceRequest["op"]>([
  "ds.create",
  "ds.delete",
  "ds.execute",
  "ds.knowledge.set",
])

export const isWrite = (request: DatasourceRequest) => WRITES.has(request.op)

export const datasourceCall = <R extends DatasourceRequest>({
  op,
  ...args
}: R) => native<Answer<R>>(op.replaceAll(".", "_"), args)
