import {
  CanvasTexture,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  SRGBColorSpace,
  type WebGLRenderer,
} from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import type { Layer } from "../types.ts"

const SKY = ["#cbcbe4", "#676781"] as const

const gradient = () => {
  const canvas = document.createElement("canvas")
  canvas.width = 2
  canvas.height = 256

  const context = canvas.getContext("2d")

  if (context) {
    const fill = context.createLinearGradient(0, 0, 0, canvas.height)
    fill.addColorStop(0, SKY[0])
    fill.addColorStop(1, SKY[1])
    context.fillStyle = fill
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace

  return texture
}

export const createStudio = (renderer: WebGLRenderer) => {
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04).texture
  const background = gradient()

  room.dispose()
  pmrem.dispose()

  return {
    environment,
    background,
    dispose: () => {
      environment.dispose()
      background.dispose()
    },
  }
}

const LOOK: Partial<Record<Layer, () => MeshStandardMaterial>> = {
  body: () => new MeshStandardMaterial({ color: "#4a3f26", roughness: 0.85 }),
  mask: () =>
    new MeshStandardMaterial({
      color: "#1d4529",
      roughness: 0.55,
      transparent: true,
      opacity: 0.92,
    }),
  silk: () => new MeshStandardMaterial({ color: "#f2f2f0", roughness: 0.7 }),
  copper: () =>
    new MeshStandardMaterial({
      color: "#d9b54a",
      roughness: 0.28,
      metalness: 0.9,
    }),
}

export const restyle = (layer: Layer, root: Object3D) => {
  const look = LOOK[layer]

  if (!look) {
    return
  }

  const made = new Map<Material, MeshStandardMaterial>()

  root.traverse(o => {
    if (!(o instanceof Mesh)) {
      return
    }

    const source: Material = o.material
    const next = made.get(source) ?? look()

    made.set(source, next)
    o.material = next
  })

  for (const source of made.keys()) {
    source.dispose()
  }
}
