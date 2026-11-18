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
  description: z.string().catch(""),
  version: z.string().catch(""),
  website: z.string().catch(""),
  repository: z.string().catch(""),
  bridge: z.object({ package: z.string(), env: z.string() }).optional(),
  distribution: z
    .object({
      npx: runner.optional(),
      uvx: runner.optional(),
      binary: z.record(z.string(), build).optional(),
    })
    .catch({}),
})

type Entry = z.infer<typeof entry>

const npxOnly = (pkg: string, args: string[] = []) => ({
  npx: { package: pkg, args, env: {} },
})

const EXTRA: Entry[] = [
  {
    id: "deepseek-acp",
    name: "DeepSeek Harness",
    description: "DeepSeek's official harness, bridged to ACP for editors.",
    version: "",
    website: "https://github.com/deepseek-ai/deepseek-harness",
    repository: "https://github.com/xintaofei/deepseek-acp",
    distribution: npxOnly("deepseek-acp"),
  },
  {
    id: "hermes-agent",
    name: "Hermes Agent",
    description:
      "Nous Research's self-improving agent that learns skills from use.",
    version: "",
    website: "https://hermes-agent.nousresearch.com",
    repository: "https://github.com/NousResearch/hermes-agent",
    distribution: {
      uvx: { package: "hermes-agent[acp]", args: ["acp"], env: {} },
    },
  },
  {
    id: "oh-my-pi",
    name: "Oh My Pi",
    description: "Pi-based coding agent with subagents and LSP. Needs Bun.",
    version: "",
    website: "https://omp.sh",
    repository: "https://github.com/can1357/oh-my-pi",
    distribution: npxOnly("@oh-my-pi/pi-coding-agent", ["acp"]),
  },
  {
    id: "omo",
    name: "OmO",
    description: "Oh My OpenAgent's native omo, run over ACP through pi-acp.",
    version: "",
    website: "https://omo.dev",
    repository: "https://github.com/code-yeongyu/oh-my-openagent",
    bridge: { package: "pi-acp", env: "PI_ACP_PI_COMMAND" },
    distribution: npxOnly("omo-ai"),
  },
  {
    id: "zcode-acp",
    name: "ZCode",
    description:
      "Z.ai's GLM coding agent. Needs the ZCode app and its zcode CLI.",
    version: "",
    website: "",
    repository: "https://github.com/william0wang/zcode-acp",
    distribution: npxOnly("zcode-acp-server"),
  },
]

const bridged = (e: Entry, launch: Launch): Launch =>
  e.bridge
    ? {
        command: "npx",
        args: ["-y", e.bridge.package],
        env: { ...launch.env, [e.bridge.env]: launch.command },
      }
    : launch

const previewOf = (e: Entry, option: Option) => {
  const { source } = option

  if (e.bridge && source.kind === "npm") {
    return {
      install: `npm install -g ${source.package}`,
      run: `${e.bridge.env}=${cliNames(e)[0]} npx ${e.bridge.package}`,
    }
  }
  const { args } = option.launch("")
  const tail = args.length ? ` ${args.join(" ")}` : ""

  if (source.kind === "npm") {
    return {
      install: `npm install -g ${source.package}`,
      run: `npx ${source.package}${tail}`,
    }
  }

  if (source.kind === "uv") {
    return {
      install: `uv tool install "${source.package}"`,
      run: `uvx "${source.package}"${tail}`,
    }
  }

  return { install: source.archive, run: `${commandOf(source.cmd)}${tail}` }
}

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
  const own = cliNames(e).find(n => installed.has(n))

  if (e.bridge && own) {
    return bridged(e, { command: own, args: [], env: {} })
  }

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
  const listed = z
    .object({ agents: z.array(entry) })
    .parse(await response.json()).agents
  const agents = [
    ...listed,
    ...EXTRA.filter(e => !listed.some(l => l.id === e.id)),
  ].filter(supported)
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
        launch: bridged(e, hit.o.launch(hit.hit.path)),
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

    available.push({
      id: e.id,
      name: e.name,
      requires,
      description: e.description,
      version: e.version,
      website: e.website,
      repository: e.repository,
      ...previewOf(e, option),
      source: option.source,
    })
  })

  return { harnesses, available }
}
