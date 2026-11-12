import type { Loaded } from "#lib/p2p/protocol.ts"

export type Draft = {
  title: string
  description: string
  tags: string
  scope: string
  links: { to: string; rel: string }[]
  body: string
}

export const draftOf = ({ meta, body }: Loaded): Draft => ({
  title: meta.title,
  description: meta.description,
  tags: meta.tags.join(", "),
  scope: meta.scope,
  links: meta.links.map(l => ({ ...l })),
  body,
})

export const patchOf = (draft: Draft) => ({
  fields: {
    title: draft.title,
    description: draft.description,
    tags: draft.tags
      .split(",")
      .map(t => t.trim())
      .filter(Boolean),
    scope: draft.scope,
    links: draft.links.filter(l => l.to && l.rel.trim()),
  },
  body: draft.body,
})
