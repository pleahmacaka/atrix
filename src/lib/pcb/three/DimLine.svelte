<script lang="ts">
import { T } from "@threlte/core"
import { HTML, MeshLineGeometry, MeshLineMaterial } from "@threlte/extras"
import { Vector3 } from "three"

let {
  from,
  to,
  label,
  color = "#3b82f6",
}: {
  from: [number, number, number]
  to: [number, number, number]
  label: string
  color?: string
} = $props()

const points = $derived([new Vector3(...from), new Vector3(...to)])

const middle = $derived(
  from.map((v, i) => (v + (to[i] ?? 0)) / 2) as [number, number, number],
)
</script>

<T.Mesh>
  <MeshLineGeometry {points} />
  <MeshLineMaterial {color} width={2} attenuate={false} depthTest={false} />
</T.Mesh>

{#each [from, to] as end, i (i)}
  <T.Mesh position={end}>
    <T.SphereGeometry args={[0.35, 12, 12]} />
    <T.MeshBasicMaterial {color} depthTest={false} />
  </T.Mesh>
{/each}

<HTML position={middle} center pointerEvents="none">
  <div class="badge badge-sm bg-base-100 whitespace-nowrap tabular-nums shadow-sm">{label}</div>
</HTML>
