import { join } from "@tauri-apps/api/path"
import type {
  ConfigDoc,
  HarnessConfig,
  HarnessKind,
  Skill,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { native } from "./native.ts"

export type Profile = { id: string; base: string; name: string }

type DocSpec = Omit<ConfigDoc, "content">

type Layout = {
  env: string
  global: string
  docs: DocSpec[]
  fork: string[]
  auth: string[]
}

export const KINDS: Record<string, HarnessKind> = {
  "claude-acp": "claude",
  "codex-acp": "codex",
}

const MCP_DOC = "mcp"

const CLAUDE_STATE = ".claude.json"

const LAYOUTS: Record<HarnessKind, Layout> = {
  claude: {
    env: "CLAUDE_CONFIG_DIR",
    global: ".claude",
    docs: [
      { id: "instructions", file: "CLAUDE.md", format: "markdown" },
      { id: "settings", file: "settings.json", format: "json" },
      { id: MCP_DOC, file: CLAUDE_STATE, format: "json" },
    ],
    fork: ["CLAUDE.md", "settings.json", "skills", "agents", "commands"],
    auth: [".credentials.json"],
  },
  codex: {
    env: "CODEX_HOME",
    global: ".codex",
    docs: [
      { id: "instructions", file: "AGENTS.md", format: "markdown" },
      { id: "settings", file: "config.toml", format: "toml" },
    ],
    fork: ["AGENTS.md", "config.toml", "skills", "prompts"],
    auth: ["auth.json"],
  },
}

const SKILL_FILE = "SKILL.md"

const readText = (path: string) => native<string | null>("read_text", { path })

const writeText = (path: string, content: string) =>
  native("write_text", { path, content })

export const envFor = (kind: HarnessKind, dir: string) => ({
  [LAYOUTS[kind].env]: dir,
})

export const atrixDir = (home: string) => join(home, ".atrix")

export const profileDir = async (home: string, id: string) =>
  join(await atrixDir(home), "profiles", id)

const profilesFile = async (home: string) =>
  join(await atrixDir(home), "profiles.json")

export const loadProfiles = async (home: string): Promise<Profile[]> => {
  const raw = await readText(await profilesFile(home))

  return raw ? (JSON.parse(raw) as Profile[]) : []
}

export const saveProfiles = async (home: string, profiles: Profile[]) =>
  writeText(await profilesFile(home), JSON.stringify(profiles, null, 2))

export type Target = { kind: HarnessKind; home: string; dir: string | null }

const rootOf = ({ kind, home, dir }: Target) =>
  dir ? Promise.resolve(dir) : join(home, LAYOUTS[kind].global)

const claudeState = (target: Target) =>
  target.dir ? join(target.dir, CLAUDE_STATE) : join(target.home, CLAUDE_STATE)

const readMcp = async (target: Target) => {
  const raw = await readText(await claudeState(target))
  const state = raw ? (JSON.parse(raw) as { mcpServers?: unknown }) : {}

  return JSON.stringify(state.mcpServers ?? {}, null, 2)
}

const writeMcp = async (target: Target, content: string) => {
  const servers: unknown = JSON.parse(content)

  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error(m.error_mcp_shape())
  }

  const path = await claudeState(target)
  const raw = await readText(path)
  const state = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}

  await writeText(
    path,
    JSON.stringify({ ...state, mcpServers: servers }, null, 2),
  )
}

const checkName = (name: string) => {
  const bad =
    !name ||
    name.startsWith(".") ||
    ["/", "\\", ":"].some(c => name.includes(c))

  if (bad) {
    throw new Error(m.error_skill_name())
  }
}

const skillPath = async (target: Target, name: string) => {
  checkName(name)

  return join(await rootOf(target), "skills", name, SKILL_FILE)
}

export const readConfig = async (target: Target): Promise<HarnessConfig> => {
  const root = await rootOf(target)
  const docs = await Promise.all(
    LAYOUTS[target.kind].docs.map(async spec => ({
      ...spec,
      content:
        spec.id === MCP_DOC
          ? await readMcp(target)
          : ((await readText(await join(root, spec.file))) ?? ""),
    })),
  )
  const names = await native<string[]>("list_dirs", {
    path: await join(root, "skills"),
  })
  const skills: Skill[] = await Promise.all(
    names.map(async name => ({
      name,
      content: (await readText(await skillPath(target, name))) ?? "",
    })),
  )

  return { dir: root, docs, skills }
}

export const writeDoc = async (
  target: Target,
  doc: string,
  content: string,
) => {
  const spec = LAYOUTS[target.kind].docs.find(d => d.id === doc)

  if (!spec) {
    throw new Error(m.error_unknown_doc())
  }

  if (spec.id === MCP_DOC) {
    return writeMcp(target, content)
  }

  if (spec.format === "json") {
    JSON.parse(content)
  }

  await writeText(await join(await rootOf(target), spec.file), content)
}

export const writeSkill = async (
  target: Target,
  name: string,
  content: string,
) => writeText(await skillPath(target, name), content)

export const removeSkill = async (target: Target, name: string) => {
  checkName(name)
  await native("remove_path", {
    path: await join(await rootOf(target), "skills", name),
  })
}

export const createProfileDir = async (
  kind: HarnessKind,
  home: string,
  dir: string,
  fork: boolean,
) => {
  const layout = LAYOUTS[kind]
  const global = await join(home, layout.global)
  const items = fork ? [...layout.fork, ...layout.auth] : layout.auth
  const skipped: string[] = []

  for (const item of items) {
    const missed = await native<string[]>("copy_path", {
      from: await join(global, item),
      to: await join(dir, item),
    })

    skipped.push(...missed)
  }

  if (kind === "claude" && fork) {
    await writeMcp(
      { kind, home, dir },
      await readMcp({ kind, home, dir: null }),
    )
  }

  return skipped
}
