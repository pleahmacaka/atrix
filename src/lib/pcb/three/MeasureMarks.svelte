<script lang="ts">
import { T } from "@threlte/core"
import DimLine from "./DimLine.svelte"
import type { Measure } from "./measure.svelte.ts"

let { measure }: { measure: Measure } = $props()

const COLOR = "#f59e0b"

const [a, b] = $derived(measure.points)
</script>

{#if a && b}
  <DimLine
    from={a}
    to={b}
    label={`${(measure.distance ?? 0).toFixed(2)} mm`}
    color={COLOR}
  />
{:else if a}
  <T.Mesh position={a}>
    <T.SphereGeometry args={[0.35, 12, 12]} />
    <T.MeshBasicMaterial color={COLOR} depthTest={false} />
  </T.Mesh>
{/if}
