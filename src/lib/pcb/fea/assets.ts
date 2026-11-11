import { Color, DoubleSide, Group, Mesh, MeshLambertMaterial } from "three"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { derivedHrefs, type Outputs } from "../derived.ts"
import { FEA_DIR } from "./types.ts"

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

const material = new MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  side: DoubleSide,
})

const toLinear = (mesh: Mesh) => {
  const colors = mesh.geometry.attributes.color

  if (!colors) {
    return
  }

  const color = new Color()

  for (let i = 0; i < colors.count; i++) {
    color.fromBufferAttribute(colors, i)
    // GLB colours hold sRGB viridis bytes, glTF reads them as linear
    color.convertSRGBToLinear()
    colors.setXYZ(i, color.r, color.g, color.b)
  }
}

export const loadStressModel = async (outputs: Outputs, glb: string) => {
  const [url] = await derivedHrefs(outputs, [`${FEA_DIR}/${glb}`])

  return url ? loadStressGlb(url) : null
}

export const loadStressGlb = async (url: string) => {
  const { scene } = await loader.loadAsync(url)

  scene.traverse(o => {
    if (o instanceof Mesh) {
      toLinear(o)
      o.material = material
    }
  })

  const root = new Group()
  root.rotation.x = -Math.PI / 2
  root.add(scene)

  return root
}
