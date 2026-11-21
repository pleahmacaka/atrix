import { invoke } from "@tauri-apps/api/core"
import { fetch } from "@tauri-apps/plugin-http"
import { z } from "zod"
import { logFailure } from "#lib/logging.ts"
import type { Available } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { PI_BASE } from "./provider.ts"

const REGISTRY =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"

const REGISTRY_CACHE = "acp-registry"

const REGISTRY_FRESH_MS = 5 * 60_000

const REGISTRY_RETRY_MS = 30_000

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
  distribution: z
    .object({
      npx: runner.optional(),
      uvx: runner.optional(),
      binary: z.record(z.string(), build).optional(),
    })
    .catch({}),
})

type Entry = z.infer<typeof entry> & {
  bridge?: { package: string; env: string }
  bins?: string[]
}

const npxOnly = (pkg: string, args: string[] = []) => ({
  npx: { package: pkg, args, env: {} },
})

const EXTRA: Entry[] = [
  {
    id: "deepseek-acp",
    name: "DeepSeek Harness",
    description: "",
    version: "",
    website: "https://github.com/deepseek-ai/deepseek-harness",
    repository: "https://github.com/xintaofei/deepseek-acp",
    distribution: npxOnly("deepseek-acp"),
  },
  {
    id: "hermes-agent",
    name: "Hermes Agent",
    description: "",
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
    description: "",
    version: "",
    website: "https://omp.sh",
    bins: ["omp"],
    repository: "https://github.com/can1357/oh-my-pi",
    distribution: npxOnly("@oh-my-pi/pi-coding-agent", ["acp"]),
  },
  {
    id: "omo",
    name: "OmO",
    description: "",
    version: "",
    website: "https://omo.dev",
    repository: "https://github.com/code-yeongyu/oh-my-openagent",
    bridge: { package: "pi-acp", env: "PI_ACP_PI_COMMAND" },
    distribution: npxOnly("omo-ai"),
  },
  {
    id: "zcode-acp",
    name: "ZCode",
    description: "",
    version: "",
    website: "",
    repository: "https://github.com/william0wang/zcode-acp",
    bins: ["zcode-acp-server"],
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

const previewOf = (e: Entry, option: Option, platform: string) => {
  const { source } = option
  const { args } = option.launch("")
  const tail = args.length ? ` ${args.join(" ")}` : ""
  const powershell = platform.startsWith("windows")

  if (e.bridge && source.kind === "npm") {
    const bin = cliNames(e)[0]

    return {
      install: `npm install -g ${source.package}`,
      run: powershell
        ? `$previous = $env:${e.bridge.env}; try { $env:${e.bridge.env}="${bin}"; npx -y ${e.bridge.package} } finally { $env:${e.bridge.env} = $previous }`
        : `${e.bridge.env}=${bin} npx -y ${e.bridge.package}`,
      powershell,
    }
  }

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

  return {
    install: source.archive,
    run: `${commandOf(source.cmd)}${tail}`,
  }
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

const cliNames = ({ id, name, bins }: Entry) =>
  bins ?? [
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

const registryList = z.object({ agents: z.array(entry) })

const cachedRegistry = () => {
  try {
    const cached = registryList.safeParse(
      JSON.parse(localStorage.getItem(REGISTRY_CACHE) ?? "null"),
    )

    return cached.success ? cached.data.agents : []
  } catch {
    return []
  }
}

let fresh: { until: number; agents: z.infer<typeof entry>[] } | null = null

const remember = (text: string) => {
  try {
    localStorage.setItem(REGISTRY_CACHE, text)
  } catch (e) {
    logFailure("acp registry cache", e)
  }
}

const fetchRegistry = async () => {
  if (fresh && Date.now() < fresh.until) {
    return fresh.agents
  }

  try {
    const response = await fetch(REGISTRY)

    if (!response.ok) {
      throw new Error(m.error_registry_unavailable({ status: response.status }))
    }

    const text = await response.text()
    const agents = registryList.parse(JSON.parse(text)).agents

    fresh = { until: Date.now() + REGISTRY_FRESH_MS, agents }
    remember(text)

    return agents
  } catch (e) {
    logFailure("acp registry", e)

    const cached = cachedRegistry()

    if (cached.length === 0) {
      throw e
    }

    fresh = { until: Date.now() + REGISTRY_RETRY_MS, agents: cached }

    return cached
  }
}

export const detectHarnesses = async (force = false) => {
  if (force) {
    fresh = null
  }

  const listed = await fetchRegistry()
  const extraOf = (id: string) => EXTRA.find(e => e.id === id)
  const agents = [
    ...listed.map(l => {
      const extra = extraOf(l.id)

      const named = l.id === PI_BASE ? { ...l, name: "Pi" } : l

      return extra
        ? { ...named, bins: extra.bins, bridge: extra.bridge }
        : named
    }),
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
      ...previewOf(e, option, platform),
      source: option.source,
    })
  })

  return { harnesses, available }
}
