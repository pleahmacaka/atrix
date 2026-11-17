import { invoke } from "@tauri-apps/api/core"
import { fetch } from "@tauri-apps/plugin-http"
import { z } from "zod"
import type { Available } from "#lib/p2p/protocol.ts"

const REGISTRY =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"

const BANNED = "antigravity"

const UNSUPPORTED = new Set([
  "stakpak",
  "vtcode",
  "vt code",
  "kimi",
  "kimi cli (legacy)",
  "harn",
  "dimcode",
  "factory-droid",
  "factory droid",
])

const supported = (e: Entry) =>
  [e.id, e.name]
    .map(v => v.toLowerCase())
    .every(v => !v.includes(BANNED) && !UNSUPPORTED.has(v))

const runner = z.object({
  package: z.string(),
  args: z.array(z.string()).catch([]),
  env: z.record(z.string(), z.string()).catch({}),
})

const build = z.object({
  archive: z.string(),
  cmd: z.string(),
  args: z.array(z.string()).catch([]),
  env: z.record(z.string(), z.string()).catch({}),
  sha256: z.string().optional(),
})

const entry = z.object({
  id: z.string(),
  name: z.string(),
  distribution: z
    .object({
      npx: runner.optional(),
      uvx: runner.optional(),
      binary: z.record(z.string(), build).optional(),
    })
    .catch({}),
})

type Entry = z.infer<typeof entry>

export type Launch = {
  command: string
  args: string[]
  env: Record<string, string>
}

export type Source =
  | { kind: "npm"; package: string }
  | { kind: "uv"; package: string }
  | {
      kind: "binary"
      id: string
      archive: string
      cmd: string
      sha256?: string
    }

export type Harness = {
  id: string
  name: string
  launch: Launch
  source: Source | null
  local: boolean
  login: string | null
}

export type Installable = Available & { source: Source }

type Found = { path: string; local: boolean }

type Option = { source: Source; launch: (path: string) => Launch }

const LOGIN: Record<string, { bin?: string; args: string[] }> = {
  "claude-acp": { args: ["--cli", "auth", "login", "--claudeai"] },
  "codex-acp": { bin: "codex", args: ["login"] },
  gemini: { args: [] },
  "github-copilot-cli": { args: [] },
  "qwen-code": { args: [] },
  opencode: { args: ["auth", "login"] },
  "opencode-v2": { args: ["auth", "login"] },
}

const loginOf = (id: string, path: string) => {
  const login = LOGIN[id]

  if (!login) {
    return null
  }

  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1
  const file = path.slice(slash)
  const dot = file.lastIndexOf(".")
  const extension = dot > 0 ? file.slice(dot) : ""
  const bin = login.bin
    ? `${path.slice(0, slash)}${login.bin}${extension}`
    : path

  return [`"${bin}"`, ...login.args].join(" ")
}

const binaryOf = (e: Entry, platform: string) =>
  e.distribution.binary?.[platform] ?? null

const optionsOf = (e: Entry, platform: string): Option[] => {
  const { npx, uvx } = e.distribution
  const binary = binaryOf(e, platform)

  return [
    ...(npx
      ? [
          {
            source: { kind: "npm", package: npx.package } as const,
            launch: (command: string) => ({
              command,
              args: npx.args,
              env: npx.env,
            }),
          },
        ]
      : []),
    ...(uvx
      ? [
          {
            source: { kind: "uv", package: uvx.package } as const,
            launch: (command: string) => ({
              command,
              args: uvx.args,
              env: uvx.env,
            }),
          },
        ]
      : []),
    ...(binary
      ? [
          {
            source: {
              kind: "binary",
              id: e.id,
              archive: binary.archive,
              cmd: binary.cmd,
              sha256: binary.sha256,
            } as const,
            launch: (command: string) => ({
              command,
              args: binary.args,
              env: binary.env,
            }),
          },
        ]
      : []),
  ]
}

const preferred = (options: Option[], installed: Set<string>) => {
  const ready = (o: Option) =>
    o.source.kind === "binary" ||
    installed.has(o.source.kind === "npm" ? "npm" : "uv")

  return options.find(ready) ?? options[0]
}

const cliNames = ({ id, name }: Entry) => [
  ...new Set([
    id,
    id.replace(/-(acp|cli|code)$/, ""),
    name.split(" ")[0].toLowerCase(),
  ]),
]

const commandOf = (cmd: string) =>
  (cmd.split("/").at(-1) ?? cmd).replace(/\.exe$/, "")

const pathLaunch = (
  e: Entry,
  platform: string,
  installed: Set<string>,
): Launch | null => {
  const binary = binaryOf(e, platform)

  if (binary && installed.has(commandOf(binary.cmd))) {
    return {
      command: commandOf(binary.cmd),
      args: binary.args,
      env: binary.env,
    }
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

export const detectHarnesses = async () => {
  const response = await fetch(REGISTRY)
  const agents = z
    .object({ agents: z.array(entry) })
    .parse(await response.json())
    .agents.filter(supported)
  const platform = await invoke<string>("tool_platform")
  const options = agents.map(e => optionsOf(e, platform))
  const found = await invoke<(Found | null)[]>("tool_find", {
    sources: options.flat().map(o => o.source),
  })
  const names = agents.flatMap(e => {
    const binary = binaryOf(e, platform)

    return [...cliNames(e), ...(binary ? [commandOf(binary.cmd)] : [])]
  })
  const installed = new Set(
    await invoke<string[]>("installed_commands", {
      names: [...names, "npx", "uvx", "npm", "uv"],
    }),
  )

  let cursor = 0

  const harnesses: Harness[] = []
  const available: Installable[] = []

  agents.forEach((e, i) => {
    const own = options[i]
    const hits = own.map((o, j) => ({ o, hit: found[cursor + j] }))
    const hit = hits.find(h => h.hit)

    cursor += own.length

    if (hit?.hit) {
      harnesses.push({
        id: e.id,
        name: e.name,
        launch: hit.o.launch(hit.hit.path),
        source: hit.o.source,
        local: hit.hit.local,
        login: loginOf(e.id, hit.hit.path),
      })

      return
    }

    const present =
      cliNames(e).some(n => installed.has(n)) ||
      installed.has(commandOf(binaryOf(e, platform)?.cmd ?? ""))
    const launch = present ? pathLaunch(e, platform, installed) : null

    if (launch) {
      harnesses.push({
        id: e.id,
        name: e.name,
        launch,
        source: null,
        local: false,
        login: null,
      })

      return
    }

    const option = preferred(own, installed)

    if (!option) {
      return
    }

    const { kind } = option.source
    const requires =
      kind === "npm" && !installed.has("npm")
        ? "node"
        : kind === "uv" && !installed.has("uv")
          ? "uv"
          : null

    available.push({ id: e.id, name: e.name, requires, source: option.source })
  })

  return { harnesses, available }
}
