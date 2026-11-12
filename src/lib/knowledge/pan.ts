import { select } from "d3-selection"
import { type ZoomTransform, zoom, zoomIdentity } from "d3-zoom"

export const pan = (
  node: Element,
  onzoom: (transform: ZoomTransform) => void,
  filter: (e: Event) => boolean = () => true,
) => {
  const behavior = zoom<Element, unknown>()
    .scaleExtent([0.2, 4])
    .filter(e => (!e.ctrlKey || e.type === "wheel") && !e.button && filter(e))
    .on("zoom", e => onzoom(e.transform))

  select(node).call(behavior).call(behavior.transform, zoomIdentity)

  return () => {
    select(node).on(".zoom", null)
  }
}
