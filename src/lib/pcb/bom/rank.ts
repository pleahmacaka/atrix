import type { BomLine } from "../types.ts"

const PREFIX_CATEGORY: Record<string, string> = {
  U: "IC",
  IC: "IC",
  J: "커넥터",
  P: "커넥터",
  CN: "커넥터",
  Y: "크리스털",
  X: "크리스털",
  Q: "트랜지스터",
  D: "다이오드",
  LED: "LED",
  SW: "스위치",
  F: "퓨즈",
  L: "인덕터",
  FB: "인덕터",
  C: "커패시터",
  R: "저항",
  TP: "테스트 포인트",
}

const ORDER = [
  "IC",
  "커넥터",
  "크리스털",
  "트랜지스터",
  "다이오드",
  "TVS 다이오드",
  "제너 다이오드",
  "LED",
  "스위치",
  "퓨즈",
  "인덕터",
  "커패시터",
  "저항",
  "테스트 포인트",
]

const CORE = [
  "microcontroller",
  "mcu",
  "rf module",
  "wireless",
  "soc",
  "processor",
  "fpga",
]

const prefixOf = (ref: string) => {
  let end = 0

  while (end < ref.length && ref[end] >= "A" && ref[end] <= "Z") {
    end++
  }

  return ref.slice(0, end)
}

export const categoryOf = (line: BomLine) =>
  line.category || PREFIX_CATEGORY[prefixOf(line.refs[0] ?? "")] || "기타"

export const isPassive = (line: BomLine) =>
  ["커패시터", "저항", "인덕터"].includes(categoryOf(line)) && !line.mpn

const isCore = (line: BomLine) => {
  const text =
    `${line.info?.category ?? ""} ${line.info?.group ?? ""} ${line.info?.summary ?? ""}`.toLowerCase()

  return CORE.some(word => text.includes(word))
}

const tierOf = (line: BomLine) => {
  if (isCore(line)) {
    return -1
  }

  const index = ORDER.indexOf(categoryOf(line))

  return index < 0 ? ORDER.length : index
}

export const byImportance = (a: BomLine, b: BomLine) =>
  tierOf(a) - tierOf(b) ||
  (b.pins ?? 0) - (a.pins ?? 0) ||
  (a.refs[0] ?? "").localeCompare(b.refs[0] ?? "")
