<script lang="ts">
import { Canvas, T } from "@threlte/core"
import { HTML, OrbitControls } from "@threlte/extras"
import { DoubleSide, MathUtils } from "three"
import type { Block } from "#lib/chat/blocks.ts"

type Scene = Extract<Block, { type: "scene" }>

let { block }: { block: Scene } = $props()

const DEFAULT_COLOR = "#a8a29e"

type Vec3 = [number, number, number]

const AXES = [0, 1, 2] as const

const vec = (v: number[] | undefined, fill: number): Vec3 => [
  v?.[0] ?? fill,
  v?.[1] ?? fill,
  v?.[2] ?? fill,
]

const sizeOf = (o: Scene["objects"][number]) => vec(o.size, 1)

const frame = $derived.by(() => {
  const low: Vec3 = [Infinity, Infinity, Infinity]
  const high: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const o of block.objects) {
    const size = sizeOf(o)
    const position = vec(o.position, 0)

    for (const axis of AXES) {
      const half = Math.abs(size[axis]) / 2

      low[axis] = Math.min(low[axis], position[axis] - half)
      high[axis] = Math.max(high[axis], position[axis] + half)
    }
  }

  const center = vec(
    AXES.map(a => (low[a] + high[a]) / 2),
    0,
  )
  const radius = Math.max(Math.hypot(...AXES.map(a => high[a] - low[a])) / 2, 0.5)
  const eye: Vec3 = [
    center[0] + radius * 1.8,
    center[1] + radius * 1.3,
    center[2] + radius * 1.8,
  ]

  return { center, radius, eye }
})

const toRadians = (rotation: number[] | undefined) =>
  vec(rotation?.map(d => MathUtils.degToRad(d)), 0)
</script>

<div class="h-80 overflow-hidden rounded-field bg-inset">
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
        position={vec(o.position, 0)}
        rotation={toRadians(o.rotation)}
      >
        <T.Mesh scale={size}>
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
          <HTML position={[0, Math.abs(size[1]) / 2 + frame.radius * 0.06, 0]} center>
            <span
              class="block max-w-40 truncate rounded-field bg-raised px-1.5 py-0.5 text-xs shadow-sm"
              title={o.label}
            >
              {o.label}
            </span>
          </HTML>
        {/if}
      </T.Group>
    {/each}
  </Canvas>
</div>
