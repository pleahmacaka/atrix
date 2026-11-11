import { derivedQuery, hrefsQuery, type Outputs } from "../derived.ts"
import {
  type Artwork,
  type Copper,
  DERIVED,
  LAYERS,
  type Layer,
  type Pcb,
} from "../types.ts"

export const boardQueries = (outputs: () => Outputs | null | undefined) => {
  const pcb = derivedQuery<Pcb>(outputs, () => DERIVED.pcb)
  const copper = derivedQuery<Copper>(outputs, () => DERIVED.copper)
  const artwork = derivedQuery<Artwork>(outputs, () => DERIVED.artwork)
  const glbs = hrefsQuery(outputs, () => LAYERS.map(DERIVED.glb))

  const urls = $derived.by((): Record<Layer, string> | null => {
    const [body, copper, mask, silk, parts] = glbs.data ?? []

    return body && copper && mask && silk && parts
      ? { body, copper, mask, silk, parts }
      : null
  })

  const ready = $derived(!!pcb.data && !!urls && !copper.isLoading)

  return {
    pcb,
    copper,
    artwork,
    glbs,
    get urls() {
      return urls
    },
    get ready() {
      return ready
    },
  }
}
