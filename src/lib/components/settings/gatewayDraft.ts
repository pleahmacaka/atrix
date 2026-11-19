import { m } from "#lib/paraglide/messages.js"
import {
  CUSTOM_TEMPLATE,
  TEMPLATES,
  type Template,
  templateOf,
} from "#lib/store/gatewayCatalog.ts"
import type { Gateway } from "#lib/store/local.svelte.ts"

export type Draft = {
  id: string | null
  template: string
  name: string
  baseURL: string
  key: string
  model: string
}

export const CHOICES: Template[] = [
  ...TEMPLATES,
  {
    id: CUSTOM_TEMPLATE,
    name: m.gateway_custom(),
    icon: "lucide:server",
    baseURL: "",
  },
]

export const urlOf = (draft: Draft) => draft.baseURL.trim().replace(/\/+$/, "")

export const blank = (): Draft => ({
  id: null,
  template: CUSTOM_TEMPLATE,
  name: "",
  baseURL: "",
  key: "",
  model: "",
})

export const draftOf = (gateway: Gateway): Draft => ({
  id: gateway.id,
  template: templateOf(gateway.baseURL)?.id ?? CUSTOM_TEMPLATE,
  name: gateway.name,
  baseURL: gateway.baseURL,
  key: gateway.key ?? "",
  model: gateway.model,
})

export const pick = (draft: Draft, id: string) => {
  const picked = CHOICES.find(t => t.id === id)

  if (picked) {
    draft.template = id
    draft.name = id === CUSTOM_TEMPLATE ? "" : picked.name
    draft.baseURL = picked.baseURL
  }
}
