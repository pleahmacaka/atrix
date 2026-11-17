import { z } from "zod"
import { fillVariables } from "#lib/knowledge/variable.ts"
import type {
  PartKind,
  Requires,
  StoredAgent,
  StoredPrompt,
} from "#lib/store/local.svelte.ts"

export const PART_NAME = /^[a-zA-Z_][\w-]*$/

export const VARIABLE_NAME = /^[a-zA-Z_]\w*$/

export const DEP_KINDS = ["skills", "tools", "mcp"] as const

export type DepKind = (typeof DEP_KINDS)[number]

export const PART_ICONS: Record<PartKind, string> = {
  prompt: "lucide:file-text",
  instruction: "lucide:scroll-text",
  variable: "lucide:braces",
}

export type Dep = { kind: DepKind; name: string; from: string[] }

const INCLUDE = /\{\{#([a-zA-Z_][\w-]*)\}\}/g

export const kindOf = (part: Pick<StoredPrompt, "kind">): PartKind =>
  part.kind ?? "prompt"

export const isBlock = (part: StoredPrompt) => kindOf(part) !== "variable"

export const blockNamed = (library: StoredPrompt[], name: string) =>
  library.find(p => isBlock(p) && p.name === name)

export const variableNamed = (library: StoredPrompt[], name: string) =>
  library.find(p => !isBlock(p) && p.name === name)

export const nameTaken = (
  library: StoredPrompt[],
  kind: PartKind,
  name: string,
  self: string | null,
) =>
  library.some(
    p =>
      p.id !== self &&
      p.name === name &&
      (kind === "variable") === (kindOf(p) === "variable"),
  )

export const expand = (
  library: StoredPrompt[],
  text: string,
  seen: ReadonlySet<string> = new Set(),
): string =>
  text.replaceAll(INCLUDE, (_, name: string) => {
    const part = blockNamed(library, name)

    return part && !seen.has(name)
      ? expand(library, part.text, new Set([...seen, name])).trim()
      : ""
  })

export const includedIn = (
  library: StoredPrompt[],
  text: string,
  seen: ReadonlySet<string> = new Set(),
): StoredPrompt[] =>
  [...text.matchAll(INCLUDE)].flatMap(([, name]) => {
    const part = blockNamed(library, name)

    if (!part || seen.has(name)) {
      return []
    }

    return [part, ...includedIn(library, part.text, new Set([...seen, name]))]
  })

const sharedValues = (library: StoredPrompt[]) =>
  Object.fromEntries(
    library.filter(p => !isBlock(p)).map(p => [p.name, p.text]),
  )

export const resolve = (
  library: StoredPrompt[],
  text: string,
  values: Record<string, string>,
) =>
  fillVariables(expand(library, text), {
    ...sharedValues(library),
    ...values,
  }).trim()

export const dependenciesOf = (
  library: StoredPrompt[],
  agent: Pick<StoredAgent, "instructions" | "requires">,
): Dep[] => {
  const sources: [string | null, Requires | undefined][] = [
    [null, agent.requires],
    ...includedIn(library, agent.instructions).map(
      (p): [string, Requires | undefined] => [p.name, p.requires],
    ),
  ]
  const deps: Dep[] = []

  for (const [from, requires] of sources) {
    for (const kind of DEP_KINDS) {
      for (const name of requires?.[kind] ?? []) {
        const known = deps.find(d => d.kind === kind && d.name === name)
        const entry = known ?? { kind, name, from: [] }

        if (!known) {
          deps.push(entry)
        }

        if (from && !entry.from.includes(from)) {
          entry.from.push(from)
        }
      }
    }
  }

  return deps
}

export const mcpNamesOf = (doc: { format: string; content: string }) => {
  if (doc.format === "json") {
    try {
      const parsed = z
        .record(z.string(), z.unknown())
        .safeParse(JSON.parse(doc.content || "{}"))

      return Object.keys(parsed.data ?? {})
    } catch {
      return []
    }
  }

  const prefix = "[mcp_servers."

  return doc.content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith(prefix))
    .map(line =>
      line.slice(prefix.length).split(/[.\]]/)[0].replaceAll('"', ""),
    )
    .filter((name, i, all) => name && all.indexOf(name) === i)
}

const requiresSchema = z.object({
  skills: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  mcp: z.array(z.string()).optional(),
})

const partSchema = z
  .object({
    name: z.string().regex(PART_NAME),
    kind: z.enum(["prompt", "instruction", "variable"]),
    text: z.string(),
    requires: requiresSchema.optional(),
  })
  .refine(p => p.kind !== "variable" || VARIABLE_NAME.test(p.name))

const blueprintSchema = z.object({
  name: z.string().trim().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  instructions: z.string(),
  variables: z.record(z.string(), z.string()).optional(),
  requires: requiresSchema.optional(),
  parts: z.array(partSchema).optional(),
})

export type Blueprint = z.infer<typeof blueprintSchema>

const FENCE = "```json"

export const blueprintIn = (text: string): Blueprint | null => {
  const start = text.lastIndexOf(FENCE)

  if (start < 0) {
    return null
  }

  const body = text.slice(start + FENCE.length)
  const end = body.indexOf("```")

  try {
    const parsed = blueprintSchema.safeParse(
      JSON.parse(end < 0 ? body : body.slice(0, end)),
    )

    return parsed.data ?? null
  } catch {
    return null
  }
}

export type BriefProvider = { key: string; kind: string; label: string }

export const builderBrief = (
  providers: BriefProvider[],
  library: StoredPrompt[],
) => `You help the user design an agent for Atrix. Interview the user briefly about the role, audience and tasks, then propose the agent.

Atrix composes an agent from reusable parts, following Mastra conventions:
- instruction: a system-prompt document, like Mastra's instructions.md.
- prompt: a reusable prompt block included with {{#name}}.
- variable: a shared value used as {{name}}, or {{name || 'fallback'}} with a fallback.
- Built-in variables: {{date}}, {{time}}, {{agent_name}}, {{cwd}}, {{user}}.
- A part may require skills, tools or MCP servers by name.

Providers the agent can run on (use the key):
${providers.map(p => `- ${p.key}: ${p.label} (${p.kind})`).join("\n") || "- none"}

Existing parts you can reuse with {{#name}} or {{name}}:
${library.map(p => `- ${p.name} (${kindOf(p)})`).join("\n") || "- none"}

Each time you propose or revise the agent, end your reply with exactly one fenced json block of this shape:
\`\`\`json
{"name": "", "provider": "", "model": "", "effort": "", "instructions": "", "variables": {}, "requires": {"skills": [], "tools": [], "mcp": []}, "parts": [{"name": "", "kind": "prompt", "text": "", "requires": {}}]}
\`\`\`
Part names use letters, digits, _ and -. Variable names use letters, digits and _. Reply in the user's language.`
