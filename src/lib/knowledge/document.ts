import { blake3 } from "@noble/hashes/blake3.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import { ulid } from "ulid"
import { parse, stringify } from "yaml"
import { z } from "zod"

export const ID_SOURCE = "kg_[0-9A-HJKMNP-TV-Z]{26}"

const ID = new RegExp(`^${ID_SOURCE}$`)

const FENCE = "---"

const FENCE_END = `\n${FENCE}\n`

const WIKILINK = new RegExp(`\\[\\[(${ID_SOURCE})(?:\\|[^\\]]*)?\\]\\]`, "g")

const name = z.string().min(1)

export const docId = z.string().regex(ID)

export const actor = z.object({
  kind: z.enum(["agent", "human"]),
  agent: name.optional(),
  session: name.optional(),
  user: name.optional(),
  device: name,
  harness: z.object({ name, version: name }).optional(),
  model: z.object({ id: name, vendor: name }).optional(),
  route: z
    .array(z.object({ kind: z.enum(["router", "provider"]), name }))
    .optional(),
})

export const scope = z.union([
  z.literal("network"),
  z.string().regex(/^p2p:[a-z0-9][a-z0-9-]*$/),
])

export const link = z.object({ to: docId, rel: name })

export const editable = z.object({
  title: name,
  description: z.string().default(""),
  tags: z.array(name).default([]),
  scope: scope.default("network"),
  links: z.array(link).default([]),
  sources: z.array(name).optional(),
})

export const editablePatch = z
  .object({
    title: name,
    description: z.string(),
    tags: z.array(name),
    scope,
    links: z.array(link),
    sources: z.array(name),
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

export const parseDoc = (text: string): Doc => {
  const normalized = text.replaceAll("\r\n", "\n")

  if (!normalized.startsWith(`${FENCE}\n`)) {
    throw new Error("frontmatter_missing")
  }

  const end = normalized.indexOf(FENCE_END, FENCE.length)

  if (end === -1) {
    throw new Error("frontmatter_unclosed")
  }

  const meta = frontmatter.parse(parse(normalized.slice(FENCE.length + 1, end)))

  return { meta, body: normalized.slice(end + FENCE_END.length) }
}

export const serializeDoc = ({ meta, body }: Doc) => {
  const same =
    JSON.stringify(meta.created_by) === JSON.stringify(meta.updated_by)

  return `${FENCE}\n${stringify({ ...meta, updated_by: same ? meta.created_by : meta.updated_by })}${FENCE}\n${body}`
}

const DATA_URI = /\bdata:[a-z]+\/[\w.+-]+[;,]/i

const BASE64_RUN = /[A-Za-z0-9+/=]{1000,}/

const TEXT_CONTROLS = new Set(["\t", "\n", "\r", "\f", "\v"])

const TEXT_ONLY = [
  "text_only: knowledge documents hold text only, without data: URIs, base64 blobs, binary bytes or embeds of local images and files.",
  "Put data and files in a datasource flagged for knowledge (ds_execute with knowledge: true), name it in `sources` and link to it.",
  "External https links, including to images hosted elsewhere, are fine.",
].join(" ")

const hasBinaryByte = (text: string) =>
  [...text].some(c => c < " " && !TEXT_CONTROLS.has(c))

const hasLocalEmbed = (text: string) =>
  [...text.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].some(
    ([, url]) => !/^https?:\/\//i.test(url),
  )

const isTextOnly = (text: string) =>
  !DATA_URI.test(text) &&
  !BASE64_RUN.test(text) &&
  !hasBinaryByte(text) &&
  !hasLocalEmbed(text)

export const assertTextOnly = ({ meta, body }: Doc) => {
  if (!isTextOnly(JSON.stringify(meta)) || !isTextOnly(body)) {
    throw new Error(TEXT_ONLY)
  }
}

export const linksOf = ({ meta, body }: Doc) => {
  const mentions = [...body.matchAll(WIKILINK)].map(([, to]) => ({
    to,
    rel: "mentions",
  }))

  return [
    ...new Map(
      [...meta.links, ...mentions].map(l => [`${l.to}:${l.rel}`, l]),
    ).values(),
  ]
}
