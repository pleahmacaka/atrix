import { blake3 } from "@noble/hashes/blake3.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import { ulid } from "ulid"
import { parse, stringify } from "yaml"
import { z } from "zod"

export const ID_SOURCE = "kg_[0-9A-HJKMNP-TV-Z]{26}"

const ID = new RegExp(`^${ID_SOURCE}$`)

const FENCE = "---"

const WIKILINK = new RegExp(`\\[\\[(${ID_SOURCE})(?:\\|[^\\]]*)?\\]\\]`, "g")

export const docId = z.string().regex(ID)

const known = z.string().min(1)

export const actor = z.object({
  kind: z.enum(["agent", "human"]),
  agent: known.optional(),
  session: known.optional(),
  device: known,
  harness: z.object({ name: known, version: known }).optional(),
  model: z.object({ id: known, vendor: known }).optional(),
  route: z
    .array(z.object({ kind: z.enum(["router", "provider"]), name: known }))
    .optional(),
})

export const scope = z.union([
  z.literal("network"),
  z.string().regex(/^p2p:[a-z0-9][a-z0-9-]*$/),
])

export const link = z.object({ to: docId, rel: known })

export const editable = z.object({
  title: known,
  description: z.string().default(""),
  tags: z.array(known).default([]),
  scope: scope.default("network"),
  links: z.array(link).default([]),
  sources: z.array(known).optional(),
})

export const editablePatch = z
  .object({
    title: editable.shape.title,
    description: editable.shape.description.unwrap(),
    tags: editable.shape.tags.unwrap(),
    scope: editable.shape.scope.unwrap(),
    links: editable.shape.links.unwrap(),
    sources: editable.shape.sources.unwrap(),
  })
  .partial()

export const frontmatter = editable.extend({
  id: docId,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  base_hash: z.string().startsWith("blake3:").nullable().default(null),
  created_by: actor,
  updated_by: actor,
})

export type Actor = z.infer<typeof actor>

export type Editable = z.infer<typeof editable>

export type Frontmatter = z.infer<typeof frontmatter>

export type Doc = { meta: Frontmatter; body: string }

export const newId = () => `kg_${ulid()}`

export const hashOf = (text: string) =>
  `blake3:${bytesToHex(blake3(utf8ToBytes(text)))}`

const split = (text: string) => {
  const normalized = text.replaceAll("\r\n", "\n")

  if (!normalized.startsWith(`${FENCE}\n`)) {
    throw new Error("frontmatter_missing")
  }

  const end = normalized.indexOf(`\n${FENCE}\n`, FENCE.length)

  if (end === -1) {
    throw new Error("frontmatter_unclosed")
  }

  return {
    yaml: normalized.slice(FENCE.length + 1, end),
    body: normalized.slice(end + FENCE.length + 2),
  }
}

export const parseDoc = (text: string): Doc => {
  const { yaml, body } = split(text)

  return { meta: frontmatter.parse(parse(yaml)), body }
}

export const serializeDoc = ({ meta, body }: Doc) => {
  const same =
    JSON.stringify(meta.created_by) === JSON.stringify(meta.updated_by)
  const shared = same ? { ...meta, updated_by: meta.created_by } : meta

  return `${FENCE}\n${stringify(shared)}${FENCE}\n${body}`
}

const DATA_URI = /\bdata:[a-z]+\/[\w.+-]+[;,]/i

const BASE64_RUN = /[A-Za-z0-9+/=]{1000,}/

const TEXT_CONTROLS = new Set(["\t", "\n", "\r", "\f", "\v"])

const binaryByte = (text: string) =>
  [...text].some(c => c < " " && !TEXT_CONTROLS.has(c))

const EMBED = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g

const REMOTE = /^https?:\/\//i

const localEmbed = (text: string) =>
  [...text.matchAll(EMBED)].some(e => !REMOTE.test(e[1]))

const TEXT_ONLY = [
  "text_only: knowledge documents hold text only, without data: URIs, base64 blobs, binary bytes or embeds of local images and files.",
  "Put data and files in a datasource flagged for knowledge (ds_execute with knowledge: true), name it in `sources` and link to it.",
  "External https links, including to images hosted elsewhere, are fine.",
].join(" ")

const isTextOnly = (text: string) =>
  !DATA_URI.test(text) &&
  !BASE64_RUN.test(text) &&
  !binaryByte(text) &&
  !localEmbed(text)

export const assertTextOnly = ({ meta, body }: Doc) => {
  if (!isTextOnly(JSON.stringify(meta)) || !isTextOnly(body)) {
    throw new Error(TEXT_ONLY)
  }
}

export const linksOf = ({ meta, body }: Doc) => {
  const all = [
    ...meta.links,
    ...[...body.matchAll(WIKILINK)].map(m => ({ to: m[1], rel: "mentions" })),
  ]

  return [...new Map(all.map(l => [`${l.to}:${l.rel}`, l])).values()]
}
