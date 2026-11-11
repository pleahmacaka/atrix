import { m } from "#lib/paraglide/messages.js"

export const FEA_DIR = "fea"

export const FEA_INDEX = `${FEA_DIR}/fea.json`

export type Vec3 = [number, number, number]

export type FeaLoad = {
  label: string
  type: string
  direction?: Vec3
  point?: Vec3
  axis?: Vec3
  magnitudeN?: number
  magnitudeNm?: number
}

export type FeaCase = {
  id: string
  title: string
  description: string
  loads: FeaLoad[]
  maxStressMPa: number
  stressAt0p3mmMPa: number
  location: string
  locationXyzMm: [number, number, number]
  safetyFactor: number
  peakSafetyFactor: number
  plugShiftMm: number
  glb: string
  colorRange: [number, number]
  unit: string
  verdict?: Verdict
}

export type Fea = {
  material: {
    name: string
    allowableInPlaneMPa: number
    allowableAcrossLayersMPa: number
  }
  assumptions: string[]
  frame: string
  generatedAt?: string
  cases: FeaCase[]
}

export type Verdict = "pass" | "marginal" | "fail"

export const VERDICT: Record<Verdict, { label: () => string; badge: string }> =
  {
    pass: { label: m.pcb_fea_pass, badge: "badge-success" },
    marginal: { label: m.pcb_fea_marginal, badge: "badge-warning" },
    fail: { label: m.pcb_fea_fail, badge: "badge-error" },
  }

export const verdictOf = (c: FeaCase): Verdict =>
  c.verdict ??
  (c.safetyFactor >= 1.5 ? "pass" : c.safetyFactor >= 1 ? "marginal" : "fail")
