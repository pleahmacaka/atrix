import { prefersReducedMotion } from "svelte/motion"

export const motion = (ms: number) => (prefersReducedMotion.current ? 0 : ms)
