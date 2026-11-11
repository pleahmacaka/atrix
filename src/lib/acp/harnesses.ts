import { invoke } from "@tauri-apps/api/core"
import { fetch } from "@tauri-apps/plugin-http"
import { z } from "zod"

const REGISTRY =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"

const runner = z.object({
  package: z.string(),
  args: z.array(z.string()).catch([]),
  env: z.record(z.string(), z.string()).catch({}),
})

const entry = z.object({
  id: z.string(),
  name: z.string(),
  distribution: z
    .object({
      npx: runner.optional(),
      uvx: runner.optional(),
      binary: z
        .record(
          z.string(),
          z.object({ cmd: z.string(), args: z.array(z.string()).catch([]) }),
        )
        .optional(),
    })
    .catch({}),
})

type Entry = z.infer<typeof entry>

export type Launch = {
  command: string
  args: string[]
  env: Record<string, string>
}

export type Harness = { id: string; name: string; launch: Launch }

const binaryOf = ({ distribution }: Entry) => {
  const local = Object.values(distribution.binary ?? {})[0]

  if (!local) {
    return null
  }

  const name = local.cmd.split("/").at(-1) ?? local.cmd

  return { command: name.replace(/\.exe$/, ""), args: local.args }
}

const cliNames = ({ id, name }: Entry) => [
  ...new Set([
    id,
    id.replace(/-(acp|cli|code)$/, ""),
    name.split(" ")[0].toLowerCase(),
  ]),
]

const launchOf = (e: Entry, installed: Set<string>): Launch | null => {
  const binary = binaryOf(e)

  if (binary && installed.has(binary.command)) {
    return { ...binary, env: {} }
  }

  const { npx, uvx } = e.distribution

  if (npx && installed.has("npx")) {
    return {
      command: "npx",
      args: ["-y", npx.package, ...npx.args],
      env: npx.env,
    }
  }

  if (uvx && installed.has("uvx")) {
    return { command: "uvx", args: [uvx.package, ...uvx.args], env: uvx.env }
  }

  return null
}

export const detectHarnesses = async (): Promise<Harness[]> => {
  const response = await fetch(REGISTRY)
  const { agents } = z
    .object({ agents: z.array(entry) })
    .parse(await response.json())
  const names = agents.flatMap(e => [
    ...cliNames(e),
    ...(binaryOf(e) ? [binaryOf(e)?.command ?? ""] : []),
  ])
  const installed = new Set(
    await invoke<string[]>("installed_commands", {
      names: [...names, "npx", "uvx"],
    }),
  )

  return agents.flatMap(e => {
    const present =
      cliNames(e).some(n => installed.has(n)) ||
      installed.has(binaryOf(e)?.command ?? "")
    const launch = present ? launchOf(e, installed) : null

    return launch ? [{ id: e.id, name: e.name, launch }] : []
  })
}
