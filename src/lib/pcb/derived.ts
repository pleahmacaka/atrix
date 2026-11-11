import { createQuery } from "@tanstack/svelte-query"
import { convertFileSrc } from "@tauri-apps/api/core"
import axios from "axios"
import { DERIVED, type Manifest } from "./types.ts"

export type Outputs = { projectId: string; dir: string; manifest: Manifest }

type Body = "json" | "text" | "arraybuffer"

export type Status = "error" | "pending" | "empty"

const hrefOf = (dir: string, file: string) => convertFileSrc(`${dir}/${file}`)

const fetchBody = async <T>(url: string, body: Body = "json") => {
  const response = await axios.get<T>(url, {
    responseType: body,
    validateStatus: s => s === 200 || s === 404,
  })

  return response.status === 404 ? null : response.data
}

export const loadOutputs = async (
  projectId: string,
  dir: string,
): Promise<Outputs | null> => {
  const manifest = await fetchBody<Manifest>(hrefOf(dir, DERIVED.manifest))

  return manifest ? { projectId, dir, manifest } : null
}

const versionOf = (outputs: Outputs, files: string[]) =>
  files.map(f => outputs.manifest.outputs[f]?.sha256 ?? "")

export const keyOf = (outputs: Outputs, kind: string, files: string[]) => [
  "pcb",
  outputs.dir,
  kind,
  ...files,
  ...versionOf(outputs, files),
]

export const derivedHrefs = async (outputs: Outputs, files: string[]) =>
  files.map(f =>
    f in outputs.manifest.outputs ? hrefOf(outputs.dir, f) : null,
  )

export const loadDerived = async <T>(
  outputs: Outputs,
  file: string,
  body: Body = "json",
): Promise<T | null> =>
  file in outputs.manifest.outputs
    ? fetchBody<T>(hrefOf(outputs.dir, file), body)
    : null

export const derivedQuery = <T>(
  outputs: () => Outputs | null | undefined,
  file: () => string,
  opts: { enabled?: () => boolean; body?: Body } = {},
) =>
  createQuery(() => {
    const out = outputs()

    return {
      queryKey: out ? keyOf(out, "file", [file()]) : ["pcb", "none"],
      queryFn: () => (out ? loadDerived<T>(out, file(), opts.body) : null),
      enabled: !!out && (opts.enabled?.() ?? true),
      staleTime: Number.POSITIVE_INFINITY,
    }
  })

export const hrefsQuery = (
  outputs: () => Outputs | null | undefined,
  files: () => string[],
  enabled: () => boolean = () => true,
) =>
  createQuery(() => {
    const out = outputs()

    return {
      queryKey: out ? keyOf(out, "hrefs", files()) : ["pcb", "none"],
      queryFn: () => (out ? derivedHrefs(out, files()) : []),
      enabled: !!out && enabled(),
      staleTime: Number.POSITIVE_INFINITY,
    }
  })

export const status = (
  ...queries: { isError: boolean; isLoading: boolean }[]
): Status =>
  queries.some(q => q.isError)
    ? "error"
    : queries.some(q => q.isLoading)
      ? "pending"
      : "empty"
