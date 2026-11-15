import { Color } from "three"
import { z } from "zod"
import { persisted } from "#lib/store/stored.svelte.ts"
import { netColor } from "./netColor.ts"

export type ColorKind = "net" | "part"

const KEY = "pcb-colors"

const hashColor = (text: string) => {
  let hash = 0

  for (const c of text) {
    hash = (hash * 31 + c.charCodeAt(0)) | 0
  }

  return `#${new Color().setHSL((Math.abs(hash) % 360) / 360, 0.7, 0.58).getHexString()}`
}

const hex = (color: string) => `#${new Color(color).getHexString()}`

class Palette {
  overrides = $state(persisted(KEY, {}, z.record(z.string(), z.string())))

  net = (name: string) => this.overrides[`net:${name}`] ?? hex(netColor(name))

  part = (ref: string) => this.overrides[`part:${ref}`] ?? hashColor(ref)

  of = (kind: ColorKind, name: string) =>
    kind === "net" ? this.net(name) : this.part(name)

  custom = (kind: ColorKind, name: string) =>
    Object.hasOwn(this.overrides, `${kind}:${name}`)

  set = (kind: ColorKind, name: string, color: string) => {
    this.overrides = { ...this.overrides, [`${kind}:${name}`]: color }
    this.#save()
  }

  reset = (kind: ColorKind, name: string) => {
    const { [`${kind}:${name}`]: _, ...rest } = this.overrides

    this.overrides = rest
    this.#save()
  }

  resetAll = () => {
    this.overrides = {}
    this.#save()
  }

  #save = () => {
    localStorage.setItem(KEY, JSON.stringify(this.overrides))
  }
}

export const palette = new Palette()
