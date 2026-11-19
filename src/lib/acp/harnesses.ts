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

const SUFFIX = /-(acp|cli|code)$/

const UNSUPPORTED = new Set([
  "antigravity",
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
  [e.id, e.name].map(v => v.toLowerCase()).every(v => !UNSUPPORTED.has(v))

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

const viaNpx = (packageName: string, args: string[] = []) => ({
  npx: { package: packageName, args, env: {} },
})

const extra = (
  id: string,
  name: string,
  website: string,
  repository: string,
  distribution: Entry["distribution"],
  more: Pick<Entry, "bins" | "bridge"> = {},
): Entry => ({
  id,
  name,
  description: "",
  version: "",
  website,
  repository,
  distribution,
  ...more,
})

const EXTRA: Entry[] = [
  extra(
    "deepseek-acp",
    "DeepSeek Harness",
    "https://github.com/deepseek-ai/deepseek-harness",
    "https://github.com/xintaofei/deepseek-acp",
    viaNpx("deepseek-acp"),
  ),
  extra(
    "hermes-agent",
    "Hermes Agent",
    "https://hermes-agent.nousresearch.com",
    "https://github.com/NousResearch/hermes-agent",
    { uvx: { package: "hermes-agent[acp]", args: ["acp"], env: {} } },
  ),
  extra(
    "oh-my-pi",
    "Oh My Pi",
    "https://omp.sh",
    "https://github.com/can1357/oh-my-pi",
    viaNpx("@oh-my-pi/pi-coding-agent", ["acp"]),
    { bins: ["omp"] },
  ),
  extra(
    "omo",
    "OmO",
    "https://omo.dev",
    "https://github.com/code-yeongyu/oh-my-openagent",
    viaNpx("omo-ai"),
    { bridge: { package: "pi-acp", env: "PI_ACP_PI_COMMAND" } },
  ),
  extra(
    "zcode-acp",
    "ZCode",
    "",
    "https://github.com/william0wang/zcode-acp",
    viaNpx("zcode-acp-server"),
    { bins: ["zcode-acp-server"] },
  ),
]

const EXTRA_INDEX = new Map(EXTRA.map(e => [e.id, e]))

const bridged = (e: Entry, launch: Launch): Launch =>
  e.bridge
    ? {
        command: "npx",
        args: ["-y", e.bridge.package],
        env: { ...launch.env, [e.bridge.env]: launch.command },
      }
    : launch

const isWindows = (platform: string) => platform.startsWith("windows")

const tailOf = (args: string[]) => (args.length ? ` ${args.join(" ")}` : "")

const bridgeCommand = (
  bridge: NonNullable<Entry["bridge"]>,
  bin: string,
  windows: boolean,
) =>
  windows
    ? `$previous = $env:${bridge.env}; try { $env:${bridge.env}="${bin}"; npx -y ${bridge.package} } finally { $env:${bridge.env} = $previous }`
    : `${bridge.env}=${bin} npx -y ${bridge.package}`

const previewOf = (e: Entry, option: Option, platform: string) => {
  const { source } = option
  const tail = tailOf(option.launch("").args)
  const windows = isWindows(platform)

  if (e.bridge && source.kind === "npm") {
    const bin = cliNames(e)[0]

    return {
      install: `npm install -g ${source.package}`,
      run: bridgeCommand(e.bridge, bin, windows),
      powershell: windows,
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
    ...new Set([id, id.replace(SUFFIX, ""), name.split(" ")[0].toLowerCase()]),
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

let fresh: { until: number; agents: Entry[] } | null = null

export const forgetRegistry = () => {
  fresh = null
}

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

const withExtras = (agents: Entry[]): Entry[] => {
  const listed = agents.map(entry => {
    const extra = EXTRA_INDEX.get(entry.id)
    const named: Entry = entry.id === PI_BASE ? { ...entry, name: "Pi" } : entry

    return extra ? { ...named, bins: extra.bins, bridge: extra.bridge } : named
  })
  const known = new Set(agents.map(entry => entry.id))

  return [...listed, ...EXTRA.filter(e => !known.has(e.id))]
}

const installedCommands = async (agents: Entry[], platform: string) => {
  const names = agents.flatMap(e => {
    const binary = binaryOf(e, platform)

    return [...cliNames(e), ...(binary ? [commandOf(binary.cmd)] : [])]
  })

  return new Set(
    await invoke<string[]>("installed_commands", {
      names: [...names, "npx", "uvx", "npm", "uv"],
    }),
  )
}

const offerOf = (
  e: Entry,
  option: Option,
  platform: string,
  installed: Set<string>,
): Installable => {
  const { kind } = option.source
  const requires =
    kind === "npm" && !installed.has("npm")
      ? "node"
      : kind === "uv" && !installed.has("uv")
        ? "uv"
        : null

  return {
    id: e.id,
    name: e.name,
    requires,
    description: e.description,
    version: e.version,
    website: e.website,
    repository: e.repository,
    ...previewOf(e, option, platform),
    source: option.source,
  }
}

const harnessOf = (e: Entry, launch: Launch): Harness => ({
  id: e.id,
  name: e.name,
  launch,
  source: null,
  local: false,
  login: null,
})

const localHarnessOf = (e: Entry, option: Option, found: Found): Harness => ({
  id: e.id,
  name: e.name,
  launch: bridged(e, option.launch(found.path)),
  source: option.source,
  local: found.local,
  login: loginOf(e.id, found.path),
})

type Hit = { option: Option; found: Found | null }

const itemOf = (
  e: Entry,
  hits: Hit[],
  platform: string,
  installed: Set<string>,
): Harness | Installable | null => {
  const hit = hits.find(h => h.found)

  if (hit?.found) {
    return localHarnessOf(e, hit.option, hit.found)
  }

  const binary = binaryOf(e, platform)
  const present =
    cliNames(e).some(n => installed.has(n)) ||
    installed.has(commandOf(binary?.cmd ?? ""))
  const launch = present ? pathLaunch(e, platform, installed) : null

  if (launch) {
    return harnessOf(e, launch)
  }

  const option = preferred(
    hits.map(h => h.option),
    installed,
  )

  return option ? offerOf(e, option, platform, installed) : null
}

export const detectHarnesses = async () => {
  const agents = withExtras(await fetchRegistry()).filter(supported)
  const platform = await invoke<string>("tool_platform")
  const options = agents.map(e => optionsOf(e, platform))
  const found = await invoke<(Found | null)[]>("tool_find", {
    sources: options.flat().map(o => o.source),
  })
  const installed = await installedCommands(agents, platform)

  let cursor = 0

  const harnesses: Harness[] = []
  const available: Installable[] = []

  agents.forEach((e, i) => {
    const own = options[i]
    const hits = own.map((option, j) => ({ option, found: found[cursor + j] }))
    const item = itemOf(e, hits, platform, installed)

    cursor += own.length

    if (item && "install" in item) {
      available.push(item)
    } else if (item) {
      harnesses.push(item)
    }
  })

  return { harnesses, available }
}
