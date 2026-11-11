<script lang="ts">
import { Canvas, T } from "@threlte/core"
import { HTML, OrbitControls } from "@threlte/extras"
import { DoubleSide, MathUtils } from "three"
import type { Block } from "#lib/chat/blocks.ts"

type Scene = Extract<Block, { type: "scene" }>

let { block }: { block: Scene } = $props()

const DEFAULT_COLOR = "#a8a29e"

const UNIT = [1, 1, 1]

const sizeOf = (o: Scene["objects"][number]) => o.size ?? UNIT

const frame = $derived.by(() => {
  const low = [Infinity, Infinity, Infinity]
  const high = [-Infinity, -Infinity, -Infinity]

  for (const o of block.objects) {
    const size = sizeOf(o)

    for (const axis of [0, 1, 2]) {
      const half = Math.abs(size[axis] ?? 1) / 2

      low[axis] = Math.min(low[axis], (o.position[axis] ?? 0) - half)
      high[axis] = Math.max(high[axis], (o.position[axis] ?? 0) + half)
    }
  }

  const center = low.map((l, i) => (l + (high[i] ?? l)) / 2) as [
    number,
    number,
    number,
  ]
  const radius = Math.max(
    Math.hypot(...high.map((h, i) => h - (low[i] ?? h))) / 2,
    0.5,
  )

  return {
    center,
    radius,
    eye: [
      center[0] + radius * 1.8,
      center[1] + radius * 1.3,
      center[2] + radius * 1.8,
    ] as [number, number, number],
  }
})

const toRadians = (rotation: number[] | undefined) =>
  (rotation ?? [0, 0, 0]).map(d => MathUtils.degToRad(d)) as [
    number,
    number,
    number,
  ]
</script>

<div class="h-80 overflow-hidden rounded-field bg-base-200">
  <Canvas>
    <T.PerspectiveCamera
      makeDefault
      position={frame.eye}
      fov={45}
      near={frame.radius / 100}
      far={frame.radius * 100}
    >
      <OrbitControls target={frame.center} enableDamping />
    </T.PerspectiveCamera>

    <T.AmbientLight intensity={0.7} />
    <T.DirectionalLight
      intensity={1.6}
      position={[
        frame.center[0] + frame.radius * 2,
        frame.center[1] + frame.radius * 3,
        frame.center[2] + frame.radius,
      ]}
    />

    {#each block.objects as o, i (i)}
      {@const size = sizeOf(o)}
      <T.Group
        position={o.position as [number, number, number]}
        rotation={toRadians(o.rotation)}
      >
        <T.Mesh scale={size as [number, number, number]}>
          {#if o.shape === "box"}
            <T.BoxGeometry />
          {:else if o.shape === "sphere"}
            <T.SphereGeometry args={[0.5, 32, 16]} />
          {:else if o.shape === "cylinder"}
            <T.CylinderGeometry args={[0.5, 0.5, 1, 32]} />
          {:else if o.shape === "cone"}
            <T.ConeGeometry args={[0.5, 1, 32]} />
          {:else if o.shape === "torus"}
            <T.TorusGeometry args={[0.35, 0.15, 16, 48]} />
          {:else}
            <T.PlaneGeometry oncreate={g => void g.rotateX(-Math.PI / 2)} />
          {/if}
          <T.MeshStandardMaterial
            color={o.color ?? DEFAULT_COLOR}
            side={o.shape === "plane" ? DoubleSide : undefined}
          />
        </T.Mesh>
        {#if o.label}
          <HTML position={[0, Math.abs(size[1] ?? 1) / 2 + frame.radius * 0.06, 0]} center>
            <span class="rounded-field bg-base-100/80 px-1.5 py-0.5 text-xs whitespace-nowrap">
              {o.label}
            </span>
          </HTML>
        {/if}
      </T.Group>
    {/each}
  </Canvas>
</div>
