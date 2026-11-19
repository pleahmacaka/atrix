import { panes } from "#lib/store/panes.svelte.ts"

export const useAction = (id: string) => {
  const hasSide = $derived(panes.hasSide(id))

  return {
    hasSide: () => hasSide,
    sideIcon: () =>
      hasSide ? "lucide:panel-right-close" : "lucide:panel-right-open",
    toggleSide: () => panes.toggleSide(id),
  }
}
